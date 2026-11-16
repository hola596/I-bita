import "server-only";
import Decimal from "decimal.js";
import { Client } from "pg";
import { env } from "@/env";
import { AppError } from "@/lib/errors/app-error";
import {
  normalizeArsAmount,
  type NormalizedMercadoPagoPayment,
} from "./mercadopago";
import type { NormalizedUsdtTransfer } from "./usdt-onchain";

export type SettlementOutcome =
  | "SETTLED"
  | "DUPLICATE"
  | "RECORDED_NO_TRANSITION"
  | "IGNORED_NOT_APPROVED";

export interface SettlementResult {
  outcome: SettlementOutcome;
  bookingId: string | null;
  ledgerEntryId: string | null;
  bookingStatus: string | null;
}

export function createPaymentsPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

export function ledgerIdempotencyKeyForMpPayment(paymentId: string): string {
  return `mp-payment-${paymentId}`;
}

export function ledgerIdempotencyKeyForUsdtTx(txHash: string): string {
  return txHash.trim().toLowerCase();
}

/**
 * Acredita un pago ARS APROBADO de forma atómica e idempotente:
 *  1. bloquea la reserva (`FOR UPDATE`) y valida moneda y monto exacto (`decimal.js`);
 *  2. inserta el asiento `GUEST_PAYMENT_ARS` en `public.ledger_entries`
 *     (`idempotency_key` UNIQUE → un reenvío del webhook nunca duplica);
 *  3. mueve la reserva `PENDING_PAYMENT` → `PAID_PENDING_KYC` (o `ALL_ADULTS_VERIFIED` si el KYC
 *     ya estaba completo, para no dejar trabada la compuerta Zero-Trust de la Épica 3).
 */
export async function settleApprovedArsPayment(
  pgClient: Client,
  payment: NormalizedMercadoPagoPayment
): Promise<SettlementResult> {
  if (payment.status !== "approved") {
    return {
      outcome: "IGNORED_NOT_APPROVED",
      bookingId: payment.externalReference,
      ledgerEntryId: null,
      bookingStatus: null,
    };
  }

  const bookingId = payment.externalReference?.trim() ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      bookingId
    )
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El pago no referencia una reserva válida (external_reference).",
      422
    );
  }
  if (payment.currencyId !== "ARS") {
    throw new AppError(
      "VALIDATION_ERROR",
      `Moneda de pago inesperada (${payment.currencyId}); se exige ARS.`,
      422
    );
  }

  const idempotencyKey = ledgerIdempotencyKeyForMpPayment(payment.id);

  try {
    await pgClient.query("BEGIN");

    const bRes = await pgClient.query<{
      status: string;
      payment_currency: string;
      total_amount: string;
      declared_adults_count: number;
      verified_adults_count: number;
    }>(
      `SELECT status::text AS status, payment_currency::text AS payment_currency,
              total_amount::text AS total_amount, declared_adults_count, verified_adults_count
       FROM public.bookings WHERE id = $1 FOR UPDATE`,
      [bookingId]
    );
    const booking = bRes.rows[0];
    if (!booking) {
      throw new AppError(
        "NOT_FOUND",
        "La reserva referenciada por el pago no existe.",
        422
      );
    }
    if (booking.payment_currency !== "ARS") {
      throw new AppError(
        "VALIDATION_ERROR",
        "La reserva no fue pactada en ARS.",
        422
      );
    }

    const expected = normalizeArsAmount(booking.total_amount);
    const paid = new Decimal(payment.amount);
    if (!paid.eq(expected)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Monto acreditado (${paid.toFixed(2)}) distinto al total de la reserva (${expected.toFixed(2)}).`,
        422
      );
    }

    const insertRes = await pgClient.query<{ id: string }>(
      `INSERT INTO public.ledger_entries
         (booking_id, idempotency_key, entry_type, currency, amount, external_reference, metadata)
       VALUES ($1, $2, 'GUEST_PAYMENT_ARS', 'ARS', $3, $4, $5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        bookingId,
        idempotencyKey,
        paid.toFixed(6),
        payment.id,
        JSON.stringify({
          provider: "MERCADOPAGO",
          paymentId: payment.id,
          paymentMethodId: payment.paymentMethodId,
          installments: payment.installments,
          bookingStatusAtPayment: booking.status,
          reconciliationRequired: booking.status !== "PENDING_PAYMENT",
        }),
      ]
    );

    const inserted = insertRes.rows[0];
    if (!inserted) {
      const existing = await pgClient.query<{ id: string }>(
        `SELECT id FROM public.ledger_entries WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      await pgClient.query("COMMIT");
      return {
        outcome: "DUPLICATE",
        bookingId,
        ledgerEntryId: existing.rows[0]?.id ?? null,
        bookingStatus: booking.status,
      };
    }

    if (booking.status !== "PENDING_PAYMENT") {
      await pgClient.query("COMMIT");
      return {
        outcome: "RECORDED_NO_TRANSITION",
        bookingId,
        ledgerEntryId: inserted.id,
        bookingStatus: booking.status,
      };
    }

    const fullyVerified =
      Number(booking.verified_adults_count ?? 0) >=
      Number(booking.declared_adults_count ?? 1);
    const nextStatus = fullyVerified
      ? "ALL_ADULTS_VERIFIED"
      : "PAID_PENDING_KYC";

    await pgClient.query(
      `UPDATE public.bookings
       SET status = $1::booking_status, updated_at = NOW()
       WHERE id = $2`,
      [nextStatus, bookingId]
    );

    await pgClient.query("COMMIT");
    return {
      outcome: "SETTLED",
      bookingId,
      ledgerEntryId: inserted.id,
      bookingStatus: nextStatus,
    };
  } catch (err) {
    await pgClient.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

/**
 * Acredita un pago USDT verificado on-chain (Polygon) de forma atómica e idempotente:
 *  1. Valida anti-reutilización de txHash (AC-2): si el hash ya existe en `public.ledger_entries`,
 *     aborta y rechaza para impedir ataques de replay / doble gasto.
 *  2. Bloquea la reserva (`FOR UPDATE`) y valida que esté en `PENDING_PAYMENT` y pactada en `USDT`.
 *  3. Compara con `decimal.js` que el monto transferido coincida exactamente con `booking.total_amount`.
 *  4. Inserta el asiento inmutable `GUEST_PAYMENT_USDT` en `public.ledger_entries` con `idempotency_key = txHash`.
 *  5. Registra el depósito en garantía (`escrow_deposit_usdt`) en los metadatos y en la reserva si aplica.
 *  6. Transiciona atómicamente el estado de la reserva (`PENDING_PAYMENT` → `PAID_PENDING_KYC` o `ALL_ADULTS_VERIFIED`).
 */
export async function settleApprovedUsdtPayment(
  pgClient: Client,
  bookingId: string,
  txHash: string,
  transfer: NormalizedUsdtTransfer
): Promise<SettlementResult> {
  const normalizedBookingId = bookingId?.trim() ?? "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalizedBookingId
    )
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Identificador de reserva inválido.",
      422
    );
  }

  const idempotencyKey = ledgerIdempotencyKeyForUsdtTx(txHash);

  try {
    await pgClient.query("BEGIN");

    // 1. Anti-reutilización (AC-2): verificar si el txHash ya fue asentado en el ledger
    const existingTx = await pgClient.query<{ id: string; booking_id: string }>(
      `SELECT id, booking_id FROM public.ledger_entries WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    const firstExisting = existingTx.rows[0];
    if (firstExisting) {
      throw new AppError(
        "VALIDATION_ERROR",
        `La transacción ${txHash} ya fue acreditada previamente en el Libro Mayor (anti-reutilización / replay attack prevenido).`,
        409,
        { existingLedgerEntryId: firstExisting.id, bookingId: firstExisting.booking_id }
      );
    }

    // 2. Bloquear y validar la reserva
    const bRes = await pgClient.query<{
      status: string;
      payment_currency: string;
      total_amount: string;
      escrow_deposit_usdt: string;
      is_mid_term: boolean;
      declared_adults_count: number;
      verified_adults_count: number;
    }>(
      `SELECT status::text AS status,
              payment_currency::text AS payment_currency,
              total_amount::text AS total_amount,
              escrow_deposit_usdt::text AS escrow_deposit_usdt,
              is_mid_term,
              declared_adults_count,
              verified_adults_count
       FROM public.bookings
       WHERE id = $1 FOR UPDATE`,
      [normalizedBookingId]
    );

    const booking = bRes.rows[0];
    if (!booking) {
      throw new AppError(
        "NOT_FOUND",
        "La reserva no existe.",
        404
      );
    }

    if (booking.status !== "PENDING_PAYMENT") {
      throw new AppError(
        "VALIDATION_ERROR",
        `La reserva no está pendiente de pago (estado actual: ${booking.status}).`,
        422
      );
    }

    if (booking.payment_currency !== "USDT") {
      throw new AppError(
        "VALIDATION_ERROR",
        `La reserva fue pactada en ${booking.payment_currency}, no en USDT.`,
        422
      );
    }

    // 3. Validación de monto exacto con decimal.js (6 decimales)
    const expected = new Decimal(booking.total_amount).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
    const paid = new Decimal(transfer.amountUsdt).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);

    if (!paid.eq(expected)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Monto transferido on-chain (${paid.toFixed(6)} USDT) no coincide con el total de la reserva (${expected.toFixed(6)} USDT).`,
        422
      );
    }

    // 4. Inserción inmutable en ledger_entries con idempotency_key = txHash
    const metadata = {
      provider: "POLYGON_USDT",
      network: "polygon",
      chainId: 137,
      txHash,
      blockNumber: transfer.blockNumber.toString(),
      from: transfer.from,
      to: transfer.to,
      contractAddress: transfer.contractAddress,
      escrowDepositUsdt: booking.escrow_deposit_usdt,
      isMidTerm: booking.is_mid_term,
      verifiedAt: new Date().toISOString(),
    };

    const insertRes = await pgClient.query<{ id: string }>(
      `INSERT INTO public.ledger_entries
         (booking_id, idempotency_key, entry_type, currency, amount, external_reference, metadata)
       VALUES ($1, $2, 'GUEST_PAYMENT_USDT', 'USDT', $3, $4, $5::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id`,
      [
        normalizedBookingId,
        idempotencyKey,
        paid.toFixed(6),
        txHash,
        JSON.stringify(metadata),
      ]
    );

    const inserted = insertRes.rows[0];
    if (!inserted) {
      throw new AppError(
        "VALIDATION_ERROR",
        `La transacción ${txHash} colisionó durante la acreditación (idempotencia garantizada).`,
        409
      );
    }

    // 5. Transición atómica de estado en bookings
    const fullyVerified =
      Number(booking.verified_adults_count ?? 0) >=
      Number(booking.declared_adults_count ?? 1);
    const nextStatus = fullyVerified
      ? "ALL_ADULTS_VERIFIED"
      : "PAID_PENDING_KYC";

    await pgClient.query(
      `UPDATE public.bookings
       SET status = $1::booking_status, updated_at = NOW()
       WHERE id = $2`,
      [nextStatus, normalizedBookingId]
    );

    await pgClient.query("COMMIT");
    return {
      outcome: "SETTLED",
      bookingId: normalizedBookingId,
      ledgerEntryId: inserted.id,
      bookingStatus: nextStatus,
    };
  } catch (err) {
    await pgClient.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

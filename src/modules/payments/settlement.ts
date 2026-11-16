import "server-only";
import Decimal from "decimal.js";
import { Client } from "pg";
import { env } from "@/env";
import { AppError } from "@/lib/errors/app-error";
import {
  normalizeArsAmount,
  type NormalizedMercadoPagoPayment,
} from "./mercadopago";

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
      // Dinero recibido sobre una reserva no cobrable (p. ej. expirada): queda asentado para conciliar.
      await pgClient.query("COMMIT");
      return {
        outcome: "RECORDED_NO_TRANSITION",
        bookingId,
        ledgerEntryId: inserted.id,
        bookingStatus: booking.status,
      };
    }

    const nextStatus =
      Number(booking.verified_adults_count) >=
      Number(booking.declared_adults_count)
        ? "ALL_ADULTS_VERIFIED"
        : "PAID_PENDING_KYC";

    await pgClient.query(
      `UPDATE public.bookings
       SET status = $1::booking_status, updated_at = NOW()
       WHERE id = $2 AND status = 'PENDING_PAYMENT'`,
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
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // sin transacción activa
    }
    throw err;
  }
}

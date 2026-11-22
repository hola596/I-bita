"use server";

import "server-only";
import Decimal from "decimal.js";
import { z } from "zod";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import {
  createArsPreference,
  normalizeArsAmount,
  MP_MAX_INSTALLMENTS,
  type ArsPreferenceResult,
} from "./mercadopago";
import {
  verifyUsdtPaymentReceipt,
  type VerifyUsdtOptions,
} from "./usdt-onchain";
import {
  createPaymentsPgClient,
  settleApprovedUsdtPayment,
} from "./settlement";
import { isBookingHoldExpired } from "@/lib/bookings/partial-hold";

export interface ArsCheckoutSummary {
  bookingId: string;
  propertySlug: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  status: string;
  holdExpiresAt: string | null;
  hostConfirmedAt: string | null;
  paymentCurrency: string;
  amountArs: string;
  payable: boolean;
  maxInstallments: number;
}

export interface UsdtCheckoutSummary {
  bookingId: string;
  propertySlug: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  isMidTerm: boolean;
  status: string;
  holdExpiresAt: string | null;
  hostConfirmedAt: string | null;
  paymentCurrency: string;
  amountUsdt: string;
  escrowDepositUsdt: string;
  treasuryWallet: string;
  usdtContractAddress: string;
  network: string;
  chainId: number;
  payable: boolean;
}

export interface UsdtSettlementResult {
  bookingId: string;
  ledgerEntryId: string;
  bookingStatus: string;
  txHash: string;
  amountUsdt: string;
}

const BookingIdSchema = z.string().trim().uuid();
const TxHashSchema = z.string().trim().regex(/^0x[a-fA-F0-9]{64}$/, "Hash de transacción Polygon inválido (0x + 64 hex)");

function createPgClient(): Client {
  return createPaymentsPgClient();
}

async function resolveUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

interface CheckoutBookingRow {
  id: string;
  guest_id: string | null;
  status: string;
  hold_expires_at: Date | string | null;
  host_confirmed_at: Date | string | null;
  payment_currency: string;
  total_amount: string;
  escrow_deposit_usdt: string;
  is_mid_term: boolean;
  check_in: string;
  check_out: string;
  nights_count: number;
  property_slug: string;
  title: string;
  token_match: boolean;
}

function toIsoOrNull(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

/** Solo el huésped titular autenticado o quien posea un `invite_token` de ESA reserva puede consultarla o cobrarla. */
async function loadAuthorizedBooking(
  pg: Client,
  bookingId: string,
  inviteToken: string | null | undefined
): Promise<
  | { ok: true; row: CheckoutBookingRow }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN"; message: string }
> {
  const token = inviteToken?.trim() ?? "";
  const tokenIsUuid = z.string().uuid().safeParse(token).success;

  const res = await pg.query<CheckoutBookingRow>(
    `SELECT b.id, b.guest_id, b.status::text AS status,
            b.hold_expires_at, b.host_confirmed_at,
            b.payment_currency::text AS payment_currency,
            b.total_amount::text AS total_amount,
            b.escrow_deposit_usdt::text AS escrow_deposit_usdt,
            b.is_mid_term,
            b.check_in::text AS check_in, b.check_out::text AS check_out,
            b.nights_count, p.slug AS property_slug, p.title,
            ($2::uuid IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.guest_verifications gv
               WHERE gv.booking_id = b.id AND gv.invite_token = $2::uuid
            )) AS token_match
     FROM public.bookings b
     INNER JOIN public.properties p ON p.id = b.property_id
     WHERE b.id = $1 LIMIT 1`,
    [bookingId, tokenIsUuid ? token : null]
  );
  const row = res.rows[0];
  if (!row) {
    return { ok: false, code: "NOT_FOUND", message: "No se encontró la reserva." };
  }

  const userId = await resolveUserId();
  const isGuest = Boolean(userId && row.guest_id && userId === row.guest_id);
  if (!isGuest && !row.token_match) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "No estás autorizado para pagar o consultar esta reserva.",
    };
  }

  if (
    row.status === "PENDING_PAYMENT" &&
    isBookingHoldExpired(row.status, row.hold_expires_at)
  ) {
    await pg.query(
      `UPDATE public.bookings
       SET status = 'EXPIRED', updated_at = NOW()
       WHERE id = $1 AND status = 'PENDING_PAYMENT'`,
      [row.id]
    );
    row.status = "EXPIRED";
  }

  return { ok: true, row };
}

function toErr(err: unknown): { ok: false; error: { code: AppError["code"]; message: string } } {
  const appErr =
    err instanceof AppError
      ? err
      : AppError.fromPostgresError(err as { code?: string; message?: string });
  return { ok: false, error: { code: appErr.code, message: appErr.message } };
}

/** Resumen del checkout ARS (monto exacto con `decimal.js`) para `/checkout/[bookingId]`. */
export async function getArsCheckoutSummaryAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<ArsCheckoutSummary>> {
  const id = BookingIdSchema.safeParse(bookingId);
  if (!id.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Reserva inválida." },
    };
  }
  const pg = createPgClient();
  await pg.connect();
  try {
    const auth = await loadAuthorizedBooking(pg, id.data, inviteToken);
    if (!auth.ok) {
      return { ok: false, error: { code: auth.code, message: auth.message } };
    }
    const r = auth.row;
    return {
      ok: true,
      data: {
        bookingId: r.id,
        propertySlug: r.property_slug,
        propertyTitle: r.title,
        checkIn: r.check_in,
        checkOut: r.check_out,
        nightsCount: Number(r.nights_count),
        status: r.status,
        holdExpiresAt: toIsoOrNull(r.hold_expires_at),
        hostConfirmedAt: toIsoOrNull(r.host_confirmed_at),
        paymentCurrency: r.payment_currency,
        amountArs: normalizeArsAmount(r.total_amount).toFixed(2),
        payable: r.status === "PENDING_PAYMENT" && r.payment_currency === "ARS",
        maxInstallments: MP_MAX_INSTALLMENTS,
      },
    };
  } catch (err) {
    return toErr(err);
  } finally {
    await pg.end();
  }
}

/**
 * Crea la preferencia de Mercado Pago (SDK oficial, solo servidor) para una reserva
 * `PENDING_PAYMENT` pactada en ARS. El monto se lee de la BD, jamás del cliente.
 */
export async function createArsCheckoutPreferenceAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<ArsPreferenceResult>> {
  const id = BookingIdSchema.safeParse(bookingId);
  if (!id.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Reserva inválida." },
    };
  }
  const pg = createPgClient();
  await pg.connect();
  try {
    const auth = await loadAuthorizedBooking(pg, id.data, inviteToken);
    if (!auth.ok) {
      return { ok: false, error: { code: auth.code, message: auth.message } };
    }
    const r = auth.row;
    if (r.status === "EXPIRED") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Tu reserva parcial de 1 hora venció y las fechas volvieron a quedar disponibles. Elegí tus fechas nuevamente en el calendario.",
        },
      };
    }
    if (r.status !== "PENDING_PAYMENT") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "La reserva no está pendiente de pago.",
        },
      };
    }
    if (r.payment_currency !== "ARS") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "La reserva fue pactada en USDT; usá el checkout USDT.",
        },
      };
    }

    const preference = await createArsPreference({
      bookingId: r.id,
      propertyTitle: r.title,
      checkIn: r.check_in,
      checkOut: r.check_out,
      totalAmountArs: r.total_amount,
    });
    return { ok: true, data: preference };
  } catch (err) {
    return toErr(err);
  } finally {
    await pg.end();
  }
}

/**
 * Resumen del checkout USDT (red Polygon) para `/checkout/[bookingId]`.
 * Devuelve la dirección de tesorería, el contrato oficial y los importes exactos en USDT con 6 decimales.
 */
export async function getUsdtCheckoutSummaryAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<UsdtCheckoutSummary>> {
  const id = BookingIdSchema.safeParse(bookingId);
  if (!id.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Identificador de reserva inválido." },
    };
  }
  const pg = createPgClient();
  await pg.connect();
  try {
    const auth = await loadAuthorizedBooking(pg, id.data, inviteToken);
    if (!auth.ok) {
      return { ok: false, error: { code: auth.code, message: auth.message } };
    }
    const r = auth.row;
    const amountUsdt = new Decimal(r.total_amount).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);
    const escrowDepositUsdt = new Decimal(r.escrow_deposit_usdt ?? "0").toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);

    return {
      ok: true,
      data: {
        bookingId: r.id,
        propertySlug: r.property_slug,
        propertyTitle: r.title,
        checkIn: r.check_in,
        checkOut: r.check_out,
        nightsCount: Number(r.nights_count),
        isMidTerm: Boolean(r.is_mid_term),
        status: r.status,
        holdExpiresAt: toIsoOrNull(r.hold_expires_at),
        hostConfirmedAt: toIsoOrNull(r.host_confirmed_at),
        paymentCurrency: r.payment_currency,
        amountUsdt,
        escrowDepositUsdt,
        treasuryWallet: env.NEXT_PUBLIC_IBITA_TREASURY_WALLET,
        usdtContractAddress: env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS,
        network: "Polygon PoS",
        chainId: 137,
        payable: r.status === "PENDING_PAYMENT" && r.payment_currency === "USDT",
      },
    };
  } catch (err) {
    return toErr(err);
  } finally {
    await pg.end();
  }
}

/**
 * Server Action que recibe `txHash`, verifica on-chain vía Viem (`getTransactionReceipt` / `parseEventLogs`),
 * valida el contrato oficial USDT en Polygon, el destinatario (tesorería I-bita) y el monto exacto de la reserva (`decimal.js`).
 * Tras la verificación exitosa, inserta el asiento inmutable en `public.ledger_entries` con `idempotency_key = txHash`
 * y transiciona atómicamente la reserva a `PAID_PENDING_KYC` (o `ALL_ADULTS_VERIFIED`).
 */
export async function verifyAndSettleUsdtPaymentAction(
  bookingId: string,
  txHash: string,
  inviteToken?: string | null,
  verificationOptions?: VerifyUsdtOptions
): Promise<ActionResult<UsdtSettlementResult>> {
  const idParsed = BookingIdSchema.safeParse(bookingId);
  if (!idParsed.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Identificador de reserva inválido." },
    };
  }

  const txParsed = TxHashSchema.safeParse(txHash);
  if (!txParsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Hash de transacción inválido. Debe tener formato 0x seguido de 64 caracteres hexadecimales.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const auth = await loadAuthorizedBooking(pg, idParsed.data, inviteToken);
    if (!auth.ok) {
      return { ok: false, error: { code: auth.code, message: auth.message } };
    }
    const r = auth.row;

    if (r.status === "EXPIRED") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Tu reserva parcial de 1 hora venció y las fechas volvieron a quedar disponibles. Elegí tus fechas nuevamente en el calendario.",
        },
      };
    }

    if (r.status !== "PENDING_PAYMENT") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `La reserva no está pendiente de pago (estado: ${r.status}).`,
        },
      };
    }

    if (r.payment_currency !== "USDT") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `La reserva fue pactada en ${r.payment_currency}; utilizá la pasarela correspondiente.`,
        },
      };
    }

    // 1. Verificación on-chain en Polygon con Viem (estrictamente en servidor)
    const verification = await verifyUsdtPaymentReceipt(
      txParsed.data,
      r.total_amount,
      verificationOptions
    );

    // 2. Liquidación atómica en PostgreSQL/Supabase
    const settlement = await settleApprovedUsdtPayment(
      pg,
      r.id,
      verification.txHash,
      verification.transfer
    );

    return {
      ok: true,
      data: {
        bookingId: r.id,
        ledgerEntryId: settlement.ledgerEntryId ?? "",
        bookingStatus: settlement.bookingStatus ?? "PAID_PENDING_KYC",
        txHash: verification.txHash,
        amountUsdt: verification.transfer.amountUsdt,
      },
    };
  } catch (err) {
    return toErr(err);
  } finally {
    await pg.end();
  }
}

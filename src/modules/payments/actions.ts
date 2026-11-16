"use server";

import "server-only";
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

export interface ArsCheckoutSummary {
  bookingId: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  status: string;
  paymentCurrency: string;
  amountArs: string;
  payable: boolean;
  maxInstallments: number;
}

const BookingIdSchema = z.string().trim().uuid();

function createPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
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
  payment_currency: string;
  total_amount: string;
  check_in: string;
  check_out: string;
  nights_count: number;
  title: string;
  token_match: boolean;
}

/** Solo el huésped titular autenticado o quien posea un `invite_token` de ESA reserva puede cobrarla. */
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
            b.payment_currency::text AS payment_currency,
            b.total_amount::text AS total_amount,
            b.check_in::text AS check_in, b.check_out::text AS check_out,
            b.nights_count, p.title,
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
      message: "No estás autorizado para pagar esta reserva.",
    };
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
        propertyTitle: r.title,
        checkIn: r.check_in,
        checkOut: r.check_out,
        nightsCount: Number(r.nights_count),
        status: r.status,
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

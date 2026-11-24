"use server";

import "server-only";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/errors/app-error";
import { sendConsumerRequestNotifications } from "@/lib/notifications/resend";
import {
  ConsumerArrepentimientoSchema,
  ConsumerBajaSchema,
  type ConsumerArrepentimientoInput,
  type ConsumerBajaInput,
} from "./validators";

export interface ConsumerRequestReceipt {
  id: string;
  requestType: "ARREPENTIMIENTO" | "BAJA_SERVICIO";
  trackingCode: string;
  email: string;
  bookingCode: string | null;
  submittedAtUtc: string;
  confirmationWindowHours: 24;
  notificationDispatched: boolean;
}

function buildTrackingCode(prefix: "ARR" | "BAJ"): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${datePart}-${randomPart}`;
}

async function resolveRequestContext(): Promise<{
  ipAddress: string;
  userAgent: string;
  userId: string | null;
}> {
  let ipAddress = "0.0.0.0";
  let userAgent = "unknown";
  try {
    const reqHeaders = await headers();
    const xff = reqHeaders.get("x-forwarded-for");
    const xri = reqHeaders.get("x-real-ip");
    ipAddress = (xff?.split(",")[0] ?? xri ?? "0.0.0.0").trim().slice(0, 120);
    userAgent = (reqHeaders.get("user-agent") ?? "unknown").trim().slice(0, 400);
  } catch {
    // Contexto sin headers HTTP (ej. test directo)
  }

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  return { ipAddress, userAgent, userId };
}

async function persistConsumerRequest(params: {
  requestType: "ARREPENTIMIENTO" | "BAJA_SERVICIO";
  email: string;
  bookingCode: string;
  reason: string;
}): Promise<ActionResult<ConsumerRequestReceipt>> {
  const prefix = params.requestType === "ARREPENTIMIENTO" ? "ARR" : "BAJ";
  const trackingCode = buildTrackingCode(prefix);
  const { ipAddress, userAgent, userId } = await resolveRequestContext();
  const cleanBookingCode = params.bookingCode.trim() || null;
  const cleanReason = params.reason.trim() || null;

  const pg = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await pg.connect();
  try {
    const inserted = await pg.query<{ id: string; created_at: Date | string }>(
      `INSERT INTO public.consumer_requests (
         request_type, tracking_code, email, booking_code, reason,
         status, ip_address, user_agent, user_id
       ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8)
       RETURNING id, created_at`,
      [
        params.requestType,
        trackingCode,
        params.email.toLowerCase(),
        cleanBookingCode,
        cleanReason,
        ipAddress,
        userAgent,
        userId,
      ]
    );

    const row = inserted.rows[0];
    if (!row) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "No pudimos registrar la solicitud en la base de datos.",
        },
      };
    }

    const submittedAtUtc =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();

    const notifyRes = await sendConsumerRequestNotifications({
      requestType: params.requestType,
      trackingCode,
      email: params.email.toLowerCase(),
      bookingCode: cleanBookingCode,
      reason: cleanReason,
      submittedAtUtc,
    });

    if (notifyRes.userNotified || notifyRes.adminNotified) {
      await pg
        .query(
          `UPDATE public.consumer_requests
           SET notification_sent_at = NOW()
           WHERE id = $1`,
          [row.id]
        )
        .catch(() => undefined);
    }

    return {
      ok: true,
      data: {
        id: row.id,
        requestType: params.requestType,
        trackingCode,
        email: params.email.toLowerCase(),
        bookingCode: cleanBookingCode,
        submittedAtUtc,
        confirmationWindowHours: 24,
        notificationDispatched:
          notifyRes.userNotified || notifyRes.adminNotified,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Ocurrió un error al registrar tu solicitud.",
      },
    };
  } finally {
    await pg.end();
  }
}

/**
 * Registra el Botón de Arrepentimiento sin exigir login (Ley 24.240 / Disp. 954/2025).
 */
export async function submitArrepentimientoAction(
  rawInput: ConsumerArrepentimientoInput
): Promise<ActionResult<ConsumerRequestReceipt>> {
  const parsed = ConsumerArrepentimientoSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Revisá los datos del formulario de arrepentimiento.",
      },
    };
  }

  return persistConsumerRequest({
    requestType: "ARREPENTIMIENTO",
    email: parsed.data.email,
    bookingCode: parsed.data.bookingCode,
    reason: parsed.data.reason,
  });
}

/**
 * Registra la solicitud directa del Botón de Baja de servicio sin exigir login (Disp. 954/2025).
 */
export async function submitBajaServicioAction(
  rawInput: ConsumerBajaInput
): Promise<ActionResult<ConsumerRequestReceipt>> {
  const parsed = ConsumerBajaSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Revisá los datos del formulario de baja.",
      },
    };
  }

  return persistConsumerRequest({
    requestType: "BAJA_SERVICIO",
    email: parsed.data.email,
    bookingCode: parsed.data.accountReference,
    reason: parsed.data.reason,
  });
}

"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import {
  MidTermGuestApplicationSchema,
  type MidTermGuestApplication,
} from "@/modules/properties/mid-term-policy";
import {
  computeHoldExpiresAt,
  isBookingHoldExpired,
  isBookingPaid,
} from "@/lib/bookings/partial-hold";

export interface HostBookingConfirmationItem {
  bookingId: string;
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  status: string;
  paymentCurrency: string;
  totalAmount: string;
  declaredAdultsCount: number;
  guestName: string;
  guestEmail: string;
  holdExpiresAt: string | null;
  hostConfirmedAt: string | null;
  hostDecisionNotes: string | null;
  createdAt: string;
}

const ConfirmHostBookingSchema = z.object({
  bookingId: z.string().uuid("Identificador de reserva inválido"),
  decision: z.enum(["CONFIRM", "RELEASE"]),
  notes: z
    .string()
    .trim()
    .max(500, "Las notas no pueden superar los 500 caracteres")
    .optional()
    .default(""),
});

export interface HostMidTermApplicationItem {
  bookingId: string;
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  status: string;
  paymentCurrency: string;
  totalAmount: string;
  guestName: string;
  guestEmail: string;
  guestPhoneFallback: string | null;
  declaredAdultsCount: number;
  midTermApplication: MidTermGuestApplication | null;
  hostDecisionNotes: string | null;
  hostReviewedAt: string | null;
  createdAt: string;
}

const ReviewMidTermBookingSchema = z.object({
  bookingId: z.string().uuid("Identificador de solicitud inválido"),
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z
    .string()
    .trim()
    .max(500, "Las notas no pueden superar los 500 caracteres")
    .optional()
    .default(""),
});

function createPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

function toSafeError(err: unknown) {
  const appErr =
    err instanceof AppError
      ? err
      : AppError.fromPostgresError(err as { code?: string; message?: string });
  return {
    ok: false as const,
    error: { code: appErr.code, message: appErr.message },
  };
}

export async function listHostMidTermApplicationsAction(): Promise<
  ActionResult<HostMidTermApplicationItem[]>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Iniciá sesión como anfitrión para ver tus solicitudes de entrevista.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const roleRes = await pg.query<{ role: string }>(
      `SELECT role::text AS role FROM public.profiles WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    const isSuperadmin = roleRes.rows[0]?.role === "SUPERADMIN";

    const res = await pg.query<{
      booking_id: string;
      property_id: string;
      property_slug: string;
      property_title: string;
      check_in: string;
      check_out: string;
      nights_count: number;
      status: string;
      payment_currency: string;
      total_amount: string;
      declared_adults_count: number;
      mid_term_application: unknown;
      host_decision_notes: string | null;
      host_reviewed_at: Date | string | null;
      created_at: Date | string;
      guest_name: string | null;
      guest_email: string | null;
      guest_phone: string | null;
    }>(
      `SELECT
         b.id AS booking_id,
         b.property_id,
         p.slug AS property_slug,
         p.title AS property_title,
         b.check_in::text AS check_in,
         b.check_out::text AS check_out,
         b.nights_count,
         b.status::text AS status,
         b.payment_currency::text AS payment_currency,
         b.total_amount::text AS total_amount,
         b.declared_adults_count,
         b.mid_term_application,
         b.host_decision_notes,
         b.host_reviewed_at,
         b.created_at,
         pr.full_name AS guest_name,
         pr.email AS guest_email,
         pr.phone_whatsapp AS guest_phone
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       LEFT JOIN public.profiles pr ON pr.id = b.guest_id
       WHERE b.is_mid_term = TRUE
         AND (b.status = 'PENDING_HOST_APPROVAL' OR b.mid_term_application IS NOT NULL)
         AND (p.host_id = $1 OR $2::boolean = TRUE)
       ORDER BY
         CASE WHEN b.status = 'PENDING_HOST_APPROVAL' THEN 0 ELSE 1 END ASC,
         b.created_at DESC
       LIMIT 40`,
      [user.id, isSuperadmin]
    );

    const items: HostMidTermApplicationItem[] = res.rows.map((row) => {
      const parsedApp = row.mid_term_application
        ? MidTermGuestApplicationSchema.safeParse(row.mid_term_application)
        : null;

      return {
        bookingId: row.booking_id,
        propertyId: row.property_id,
        propertySlug: row.property_slug,
        propertyTitle: row.property_title,
        checkIn: row.check_in,
        checkOut: row.check_out,
        nightsCount: Number(row.nights_count),
        status: row.status,
        paymentCurrency: row.payment_currency,
        totalAmount: row.total_amount,
        guestName: row.guest_name?.trim() || "Huésped interesado",
        guestEmail: row.guest_email?.trim() || "Sin email informado",
        guestPhoneFallback: row.guest_phone?.trim() || null,
        declaredAdultsCount: Number(row.declared_adults_count),
        midTermApplication: parsedApp?.success ? parsedApp.data : null,
        hostDecisionNotes: row.host_decision_notes,
        hostReviewedAt:
          row.host_reviewed_at instanceof Date
            ? row.host_reviewed_at.toISOString()
            : row.host_reviewed_at
              ? String(row.host_reviewed_at)
              : null,
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      };
    });

    return { ok: true, data: items };
  } catch (err) {
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}

export async function reviewMidTermBookingAction(rawInput: {
  bookingId: string;
  decision: "APPROVE" | "REJECT";
  notes?: string;
}): Promise<
  ActionResult<{ bookingId: string; status: string; hostReviewedAt: string }>
> {
  const parsed = ReviewMidTermBookingSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para revisar la solicitud.",
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Debés iniciar sesión como anfitrión para aprobar o rechazar solicitudes.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const roleRes = await pg.query<{ role: string }>(
      `SELECT role::text AS role FROM public.profiles WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    const isSuperadmin = roleRes.rows[0]?.role === "SUPERADMIN";

    const existingRes = await pg.query<{
      id: string;
      status: string;
      host_id: string;
      property_slug: string;
    }>(
      `SELECT b.id, b.status::text AS status, p.host_id, p.slug AS property_slug
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE b.id = $1
       LIMIT 1`,
      [parsed.data.bookingId]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No encontramos esa solicitud de estadía larga.",
        },
      };
    }

    if (existing.host_id !== user.id && !isSuperadmin) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos para decidir sobre esta propiedad.",
        },
      };
    }

    if (existing.status !== "PENDING_HOST_APPROVAL") {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Esta solicitud ya fue revisada anteriormente.",
        },
      };
    }

    const nextStatus =
      parsed.data.decision === "APPROVE" ? "PENDING_PAYMENT" : "CANCELLED";
    const cleanNotes =
      parsed.data.notes.trim().length > 0 ? parsed.data.notes.trim() : null;
    const holdExpiresAtIso =
      parsed.data.decision === "APPROVE"
        ? computeHoldExpiresAt().toISOString()
        : null;

    const updatedRes = await pg.query<{
      id: string;
      status: string;
      host_reviewed_at: Date | string;
    }>(
      `UPDATE public.bookings
       SET status = $2::booking_status,
           host_decision_notes = $3,
           host_reviewed_at = NOW(),
           host_confirmed_at = CASE WHEN $2::booking_status = 'PENDING_PAYMENT' THEN COALESCE(host_confirmed_at, NOW()) ELSE host_confirmed_at END,
           hold_expires_at = CASE WHEN $2::booking_status = 'PENDING_PAYMENT' THEN $4::timestamptz ELSE hold_expires_at END,
           host_responded_at = COALESCE(host_responded_at, NOW()),
           host_responded_on_time = COALESCE(
             host_responded_on_time,
             (host_response_due_at IS NULL OR NOW() <= host_response_due_at)
           ),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status::text AS status, host_reviewed_at`,
      [existing.id, nextStatus, cleanNotes, holdExpiresAtIso]
    );

    const updated = updatedRes.rows[0]!;

    try {
      revalidatePath("/dashboard/propiedades");
      revalidatePath("/perfil");
      revalidatePath(`/p/${existing.property_slug}`);
      revalidatePath(`/checkout/${existing.id}`);
    } catch {
      // Ignorar si corre fuera de contexto Next.js
    }

    return {
      ok: true,
      data: {
        bookingId: updated.id,
        status: updated.status,
        hostReviewedAt:
          updated.host_reviewed_at instanceof Date
            ? updated.host_reviewed_at.toISOString()
            : String(updated.host_reviewed_at),
      },
    };
  } catch (err) {
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}

function toOptionalIso(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

/**
 * Lista las reservas activas o en reserva parcial de 1 hora en propiedades del anfitrión
 * para confirmar disponibilidad o liberar reservas vencidas / no abonadas.
 */
export async function listHostBookingConfirmationsAction(): Promise<
  ActionResult<HostBookingConfirmationItem[]>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Iniciá sesión como anfitrión para ver tus confirmaciones de reserva.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    try {
      await pg.query(`SELECT public.expire_stale_booking_holds(NULL)`);
    } catch {
      // Ignorar si la función aún no existe
    }

    const roleRes = await pg.query<{ role: string }>(
      `SELECT role::text AS role FROM public.profiles WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    const isSuperadmin = roleRes.rows[0]?.role === "SUPERADMIN";

    const res = await pg.query<{
      booking_id: string;
      property_id: string;
      property_slug: string;
      property_title: string;
      check_in: string;
      check_out: string;
      nights_count: number;
      status: string;
      payment_currency: string;
      total_amount: string;
      declared_adults_count: number;
      hold_expires_at: Date | string | null;
      host_confirmed_at: Date | string | null;
      host_decision_notes: string | null;
      created_at: Date | string;
      guest_name: string | null;
      guest_email: string | null;
    }>(
      `SELECT
         b.id AS booking_id,
         b.property_id,
         p.slug AS property_slug,
         p.title AS property_title,
         b.check_in::text AS check_in,
         b.check_out::text AS check_out,
         b.nights_count,
         b.status::text AS status,
         b.payment_currency::text AS payment_currency,
         b.total_amount::text AS total_amount,
         b.declared_adults_count,
         b.hold_expires_at,
         b.host_confirmed_at,
         b.host_decision_notes,
         b.created_at,
         pr.full_name AS guest_name,
         pr.email AS guest_email
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       LEFT JOIN public.profiles pr ON pr.id = b.guest_id
       WHERE b.status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK')
         AND (p.host_id = $1 OR $2::boolean = TRUE)
       ORDER BY
         CASE WHEN b.host_confirmed_at IS NULL THEN 0 ELSE 1 END ASC,
         b.created_at DESC
       LIMIT 50`,
      [user.id, isSuperadmin]
    );

    const items: HostBookingConfirmationItem[] = res.rows.map((row) => ({
      bookingId: row.booking_id,
      propertyId: row.property_id,
      propertySlug: row.property_slug,
      propertyTitle: row.property_title,
      checkIn: row.check_in,
      checkOut: row.check_out,
      nightsCount: Number(row.nights_count),
      status: row.status,
      paymentCurrency: row.payment_currency,
      totalAmount: row.total_amount,
      declaredAdultsCount: Number(row.declared_adults_count),
      guestName: row.guest_name?.trim() || "Huésped I-bita",
      guestEmail: row.guest_email?.trim() || "Sin email informado",
      holdExpiresAt: toOptionalIso(row.hold_expires_at),
      hostConfirmedAt: toOptionalIso(row.host_confirmed_at),
      hostDecisionNotes: row.host_decision_notes,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    }));

    return { ok: true, data: items };
  } catch (err) {
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}

/**
 * Permite al anfitrión confirmar una reserva (completando la segunda llave junto al pago)
 * o liberar una reserva parcial aún no abonada para devolver las fechas al calendario.
 */
export async function confirmHostBookingAction(rawInput: {
  bookingId: string;
  decision: "CONFIRM" | "RELEASE";
  notes?: string;
}): Promise<
  ActionResult<{
    bookingId: string;
    status: string;
    hostConfirmedAt: string | null;
  }>
> {
  const parsed = ConfirmHostBookingSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para confirmar o liberar la reserva.",
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Iniciá sesión como anfitrión para gestionar tus reservas.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    await pg.query("BEGIN");

    const roleRes = await pg.query<{ role: string; full_name: string | null }>(
      `SELECT role::text AS role, full_name FROM public.profiles WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    const isSuperadmin = roleRes.rows[0]?.role === "SUPERADMIN";
    const actorName = roleRes.rows[0]?.full_name?.trim() || "Tu anfitrión";

    const existingRes = await pg.query<{
      id: string;
      status: string;
      hold_expires_at: Date | string | null;
      host_confirmed_at: Date | string | null;
      host_id: string;
      property_slug: string;
      property_title: string;
      check_in: string;
      check_out: string;
    }>(
      `SELECT b.id, b.status::text AS status, b.hold_expires_at, b.host_confirmed_at,
              p.host_id, p.slug AS property_slug, p.title AS property_title,
              b.check_in::text AS check_in, b.check_out::text AS check_out
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE b.id = $1
       FOR UPDATE OF b`,
      [parsed.data.bookingId]
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      await pg.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No encontramos esa reserva.",
        },
      };
    }

    if (existing.host_id !== user.id && !isSuperadmin) {
      await pg.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos sobre esta propiedad.",
        },
      };
    }

    if (
      existing.status === "PENDING_PAYMENT" &&
      isBookingHoldExpired(existing.status, existing.hold_expires_at)
    ) {
      await pg.query(
        `UPDATE public.bookings
         SET status = 'EXPIRED', updated_at = NOW()
         WHERE id = $1`,
        [existing.id]
      );
      await pg.query("COMMIT");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "La reserva parcial de 1 hora venció y las fechas ya volvieron a quedar libres en tu calendario.",
        },
      };
    }

    if (existing.status === "CANCELLED" || existing.status === "EXPIRED") {
      await pg.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Esta reserva ya se encuentra cancelada o vencida.",
        },
      };
    }

    const cleanNotes =
      parsed.data.notes.trim().length > 0 ? parsed.data.notes.trim() : null;

    if (parsed.data.decision === "RELEASE") {
      if (isBookingPaid(existing.status)) {
        await pg.query("ROLLBACK");
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Esta reserva ya registra un pago acreditado y no puede liberarse directamente desde acá.",
          },
        };
      }

      const relRes = await pg.query<{ id: string; status: string }>(
        `UPDATE public.bookings
         SET status = 'CANCELLED',
             host_decision_notes = COALESCE($2, host_decision_notes),
             host_reviewed_at = COALESCE(host_reviewed_at, NOW()),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, status::text AS status`,
        [existing.id, cleanNotes]
      );
      await pg.query("COMMIT");

      try {
        revalidatePath("/dashboard/propiedades");
        revalidatePath("/perfil");
        revalidatePath(`/p/${existing.property_slug}`);
        revalidatePath(`/checkout/${existing.id}`);
        revalidatePath("/mensajes");
      } catch {
        // Ignorar fuera de request context
      }

      return {
        ok: true,
        data: {
          bookingId: relRes.rows[0]!.id,
          status: relRes.rows[0]!.status,
          hostConfirmedAt: null,
        },
      };
    }

    // CONFIRM
    const confirmRes = await pg.query<{
      id: string;
      status: string;
      host_confirmed_at: Date | string;
    }>(
      `UPDATE public.bookings
       SET status = CASE
             WHEN status = 'PENDING_HOST_APPROVAL' THEN 'PENDING_PAYMENT'::booking_status
             ELSE status
           END,
           host_confirmed_at = COALESCE(host_confirmed_at, NOW()),
           host_reviewed_at = COALESCE(host_reviewed_at, NOW()),
           host_decision_notes = COALESCE($2, host_decision_notes),
           host_responded_at = COALESCE(host_responded_at, NOW()),
           host_responded_on_time = COALESCE(
             host_responded_on_time,
             (host_response_due_at IS NULL OR NOW() <= host_response_due_at)
           ),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, status::text AS status, host_confirmed_at`,
      [existing.id, cleanNotes]
    );

    const confirmedRow = confirmRes.rows[0]!;
    const convRes = await pg.query<{ id: string }>(
      `SELECT id FROM public.conversations WHERE booking_id = $1 LIMIT 1`,
      [existing.id]
    );
    const conversationId = convRes.rows[0]?.id;
    if (conversationId) {
      const msgBody = cleanNotes
        ? `¡Confirmé tu reserva en ${existing.property_title} (${existing.check_in} → ${existing.check_out})! Mensaje del anfitrión: ${cleanNotes}`
        : `¡Confirmé tu reserva en ${existing.property_title} (${existing.check_in} → ${existing.check_out})! Tu estadía queda respaldada dentro de I-bita.`;
      await pg.query(
        `INSERT INTO public.conversation_messages (
           conversation_id, sender_id, sender_role, sender_name, body, message_type
         ) VALUES ($1, $2, 'HOST', $3, $4, 'TEXT')`,
        [conversationId, user.id, actorName, msgBody]
      );
      await pg.query(
        `UPDATE public.conversations
         SET last_message_preview = $2,
             last_message_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [conversationId, msgBody.slice(0, 140)]
      );
    }

    await pg.query("COMMIT");

    try {
      revalidatePath("/dashboard/propiedades");
      revalidatePath("/perfil");
      revalidatePath(`/p/${existing.property_slug}`);
      revalidatePath(`/checkout/${existing.id}`);
      revalidatePath(`/checkin/${existing.id}`);
      revalidatePath("/mensajes");
    } catch {
      // Ignorar fuera de request context
    }

    return {
      ok: true,
      data: {
        bookingId: confirmedRow.id,
        status: confirmedRow.status,
        hostConfirmedAt: toOptionalIso(confirmedRow.host_confirmed_at),
      },
    };
  } catch (err) {
    try {
      await pg.query("ROLLBACK");
    } catch {
      // Ignorar
    }
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}

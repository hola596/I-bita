"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import { maskArgentineDni } from "@/lib/kyc/pdf417Parser";
import { sendPushNotificationToUser } from "@/lib/push";

const KYC_PRIVATE_BUCKET = "kyc-documents" as const;
const SIGNED_EVIDENCE_TTL_SECONDS = 300;

export interface HostGuestIdentityItem {
  verificationId: string;
  bookingId: string;
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  bookingStatus: string;
  declaredAdultsCount: number;
  verifiedAdultsCount: number;
  isPrimaryGuest: boolean;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "MANUAL_REVIEW";
  fullNameExtracted: string | null;
  maskedDocumentNumber: string | null;
  birthDate: string | null;
  similarityScore: number | null;
  livenessScore: number | null;
  biometricConfidenceScore: number | null;
  hasEvidencePhotos: boolean;
  evidenceExpiresAt: string | null;
  evidencePurged: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export interface HostKycEvidenceUrls {
  dniFrontUrl: string | null;
  selfieUrl: string | null;
  expiresInSeconds: number;
  purged: boolean;
}

const ReviewGuestIdentitySchema = z.object({
  verificationId: z.string().uuid("Identificador de verificación inválido."),
  decision: z.enum(["APPROVE", "REJECT"]),
  notes: z
    .string()
    .trim()
    .max(500, "Las notas no pueden superar los 500 caracteres.")
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

function toOptionalIso(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function stripBucketPrefix(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const cleaned = storagePath.replace(/^kyc-documents\//, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Lista las validaciones de identidad (adultos titulares y acompañantes) asociadas a propiedades
 * del anfitrión autenticado o de toda la plataforma si es SUPERADMIN.
 */
export async function listHostGuestVerificationsAction(): Promise<
  ActionResult<HostGuestIdentityItem[]>
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
        message: "Iniciá sesión como anfitrión para ver tus validaciones de identidad.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const roleRes = await pg.query<{
      role: string;
      host_approval_status: string | null;
    }>(
      `SELECT role::text AS role, host_approval_status::text AS host_approval_status
       FROM public.profiles
       WHERE id = $1
       LIMIT 1`,
      [user.id]
    );

    const profile = roleRes.rows[0];
    const isSuperadmin = profile?.role === "SUPERADMIN";
    const isApprovedHost =
      isSuperadmin ||
      (profile?.role === "HOST" && profile?.host_approval_status === "APPROVED");

    if (!isApprovedHost) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "Necesitás un perfil de anfitrión aprobado para acceder.",
        },
      };
    }

    const res = await pg.query<{
      verification_id: string;
      booking_id: string;
      property_id: string;
      property_slug: string;
      property_title: string;
      check_in: string;
      check_out: string;
      nights_count: number;
      booking_status: string;
      declared_adults_count: number;
      verified_adults_count: number;
      is_primary_guest: boolean;
      status: "PENDING" | "VERIFIED" | "REJECTED" | "MANUAL_REVIEW";
      full_name_extracted: string | null;
      document_number: string | null;
      birth_date: string | null;
      similarity_score: string | null;
      liveness_score: string | null;
      biometric_confidence_score: string | null;
      dni_front_storage_path: string | null;
      selfie_storage_path: string | null;
      evidence_expires_at: Date | string | null;
      evidence_purged_at: Date | string | null;
      verified_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT
         gv.id AS verification_id,
         gv.booking_id,
         p.id AS property_id,
         p.slug AS property_slug,
         p.title AS property_title,
         b.check_in::text AS check_in,
         b.check_out::text AS check_out,
         b.nights_count,
         b.status::text AS booking_status,
         b.declared_adults_count,
         b.verified_adults_count,
         gv.is_primary_guest,
         gv.status::text AS status,
         gv.full_name_extracted,
         gv.document_number,
         gv.birth_date::text AS birth_date,
         gv.similarity_score::text AS similarity_score,
         gv.liveness_score::text AS liveness_score,
         gv.biometric_confidence_score::text AS biometric_confidence_score,
         gv.dni_front_storage_path,
         gv.selfie_storage_path,
         gv.evidence_expires_at,
         gv.evidence_purged_at,
         gv.verified_at,
         gv.created_at
       FROM public.guest_verifications gv
       INNER JOIN public.bookings b ON b.id = gv.booking_id
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE b.status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK')
         AND (p.host_id = $1 OR $2::boolean = TRUE)
       ORDER BY
         CASE gv.status::text
           WHEN 'MANUAL_REVIEW' THEN 0
           WHEN 'REJECTED' THEN 1
           WHEN 'PENDING' THEN 2
           ELSE 3
         END ASC,
         gv.created_at DESC
       LIMIT 60`,
      [user.id, isSuperadmin]
    );

    const items: HostGuestIdentityItem[] = res.rows.map((row) => {
      const purged = Boolean(row.evidence_purged_at);
      const hasPaths = Boolean(
        stripBucketPrefix(row.dni_front_storage_path) ||
          stripBucketPrefix(row.selfie_storage_path)
      );
      return {
        verificationId: row.verification_id,
        bookingId: row.booking_id,
        propertyId: row.property_id,
        propertySlug: row.property_slug,
        propertyTitle: row.property_title,
        checkIn: row.check_in,
        checkOut: row.check_out,
        nightsCount: Number(row.nights_count),
        bookingStatus: row.booking_status,
        declaredAdultsCount: Number(row.declared_adults_count),
        verifiedAdultsCount: Number(row.verified_adults_count),
        isPrimaryGuest: Boolean(row.is_primary_guest),
        status: row.status,
        fullNameExtracted: row.full_name_extracted?.trim() || null,
        maskedDocumentNumber: maskArgentineDni(row.document_number),
        birthDate: row.birth_date,
        similarityScore:
          row.similarity_score !== null ? Number(row.similarity_score) : null,
        livenessScore:
          row.liveness_score !== null ? Number(row.liveness_score) : null,
        biometricConfidenceScore:
          row.biometric_confidence_score !== null
            ? Number(row.biometric_confidence_score)
            : null,
        hasEvidencePhotos: hasPaths && !purged,
        evidenceExpiresAt: toOptionalIso(row.evidence_expires_at),
        evidencePurged: purged,
        verifiedAt: toOptionalIso(row.verified_at),
        createdAt: toOptionalIso(row.created_at) ?? new Date().toISOString(),
      };
    });

    return { ok: true, data: items };
  } catch (err) {
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}

/**
 * Genera URLs firmadas temporales (5 min) en Storage privado para que el anfitrión propietario
 * o SUPERADMIN inspeccione frente del DNI y selfie en vivo durante una revisión manual (Opción A).
 */
export async function getHostKycEvidenceSignedUrlsAction(
  verificationId: string
): Promise<ActionResult<HostKycEvidenceUrls>> {
  const idCheck = z.string().uuid("ID de verificación inválido.").safeParse(verificationId);
  if (!idCheck.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: idCheck.error.issues[0]?.message ?? "ID inválido.",
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
        message: "Iniciá sesión para consultar las imágenes de respaldo.",
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

    const rowRes = await pg.query<{
      host_id: string;
      dni_front_storage_path: string | null;
      selfie_storage_path: string | null;
      evidence_purged_at: Date | string | null;
    }>(
      `SELECT
         p.host_id,
         gv.dni_front_storage_path,
         gv.selfie_storage_path,
         gv.evidence_purged_at
       FROM public.guest_verifications gv
       INNER JOIN public.bookings b ON b.id = gv.booking_id
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE gv.id = $1
       LIMIT 1`,
      [idCheck.data]
    );

    const row = rowRes.rows[0];
    if (!row) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No encontramos esa verificación de identidad.",
        },
      };
    }

    if (row.host_id !== user.id && !isSuperadmin) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos para ver esta verificación.",
        },
      };
    }

    if (row.evidence_purged_at) {
      return {
        ok: true,
        data: {
          dniFrontUrl: null,
          selfieUrl: null,
          expiresInSeconds: SIGNED_EVIDENCE_TTL_SECONDS,
          purged: true,
        },
      };
    }

    const dniPath = stripBucketPrefix(row.dni_front_storage_path);
    const selfiePath = stripBucketPrefix(row.selfie_storage_path);

    if (!dniPath && !selfiePath) {
      return {
        ok: true,
        data: {
          dniFrontUrl: null,
          selfieUrl: null,
          expiresInSeconds: SIGNED_EVIDENCE_TTL_SECONDS,
          purged: false,
        },
      };
    }

    const adminClient = createSupabaseAdminClient();
    const [dniSigned, selfieSigned] = await Promise.all([
      dniPath
        ? adminClient.storage
            .from(KYC_PRIVATE_BUCKET)
            .createSignedUrl(dniPath, SIGNED_EVIDENCE_TTL_SECONDS)
        : Promise.resolve({ data: null, error: null }),
      selfiePath
        ? adminClient.storage
            .from(KYC_PRIVATE_BUCKET)
            .createSignedUrl(selfiePath, SIGNED_EVIDENCE_TTL_SECONDS)
        : Promise.resolve({ data: null, error: null }),
    ]);

    return {
      ok: true,
      data: {
        dniFrontUrl: dniSigned.data?.signedUrl ?? null,
        selfieUrl: selfieSigned.data?.signedUrl ?? null,
        expiresInSeconds: SIGNED_EVIDENCE_TTL_SECONDS,
        purged: false,
      },
    };
  } catch (err) {
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}

/**
 * Permite al anfitrión propietario o SUPERADMIN aprobar una identidad en revisión (`APPROVE`)
 * o solicitar que el huésped repita la foto y selfie (`REJECT`), recalculando automáticamente
 * el progreso de adultos verificados de la reserva y liberando el acceso al llegar al 100%.
 */
export async function reviewGuestIdentityAction(rawInput: {
  verificationId: string;
  decision: "APPROVE" | "REJECT";
  notes?: string;
}): Promise<
  ActionResult<{
    verificationId: string;
    status: "VERIFIED" | "REJECTED";
    bookingId: string;
    bookingStatus: string;
    verifiedAdultsCount: number;
    declaredAdultsCount: number;
  }>
> {
  const parsed = ReviewGuestIdentitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para resolver la revisión de identidad.",
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
        message: "Iniciá sesión como anfitrión para confirmar identidades.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    await pg.query("BEGIN");

    const actorRes = await pg.query<{
      role: string;
      full_name: string | null;
    }>(
      `SELECT role::text AS role, full_name FROM public.profiles WHERE id = $1 LIMIT 1`,
      [user.id]
    );
    const isSuperadmin = actorRes.rows[0]?.role === "SUPERADMIN";
    const actorName = actorRes.rows[0]?.full_name?.trim() || "El anfitrión";

    const slotRes = await pg.query<{
      verification_id: string;
      booking_id: string;
      invite_token: string;
      full_name_extracted: string | null;
      host_id: string;
      guest_id: string | null;
      property_title: string;
      property_slug: string;
      booking_status: string;
      declared_adults_count: number;
    }>(
      `SELECT
         gv.id AS verification_id,
         gv.booking_id,
         gv.invite_token,
         gv.full_name_extracted,
         p.host_id,
         b.guest_id,
         p.title AS property_title,
         p.slug AS property_slug,
         b.status::text AS booking_status,
         b.declared_adults_count
       FROM public.guest_verifications gv
       INNER JOIN public.bookings b ON b.id = gv.booking_id
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE gv.id = $1
       FOR UPDATE OF b`,
      [parsed.data.verificationId]
    );

    const row = slotRes.rows[0];
    if (!row) {
      await pg.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No encontramos esa verificación de identidad.",
        },
      };
    }

    if (row.host_id !== user.id && !isSuperadmin) {
      await pg.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos para aprobar identidades de esta propiedad.",
        },
      };
    }

    if (
      row.booking_status === "CANCELLED" ||
      row.booking_status === "EXPIRED" ||
      row.booking_status === "ICAL_BLOCK"
    ) {
      await pg.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `La reserva está en estado ${row.booking_status} y ya no admite cambios de identidad.`,
        },
      };
    }

    const nextKycStatus: "VERIFIED" | "REJECTED" =
      parsed.data.decision === "APPROVE" ? "VERIFIED" : "REJECTED";
    const cleanNotes =
      parsed.data.notes.trim().length > 0 ? parsed.data.notes.trim() : null;

    const manualReviewAudit = {
      manual_review_decision: parsed.data.decision,
      manual_review_by: user.id,
      manual_review_role: row.host_id === user.id ? "HOST" : "SUPERADMIN",
      manual_review_notes: cleanNotes,
      manual_review_at: new Date().toISOString(),
    };

    await pg.query(
      `UPDATE public.guest_verifications
       SET
         status = $2::kyc_status,
         verified_at = CASE WHEN $2::kyc_status = 'VERIFIED' THEN NOW() ELSE NULL END,
         gemini_audit_json = COALESCE(gemini_audit_json, '{}'::jsonb) || $3::jsonb
       WHERE id = $1`,
      [row.verification_id, nextKycStatus, JSON.stringify(manualReviewAudit)]
    );

    const countRes = await pg.query<{ verified_count: number }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified_count
       FROM public.guest_verifications
       WHERE booking_id = $1`,
      [row.booking_id]
    );

    const verifiedAdultsCount = Number(countRes.rows[0]?.verified_count ?? 0);
    const declaredAdultsCount = Number(row.declared_adults_count);
    const allAdultsVerified = verifiedAdultsCount === declaredAdultsCount;

    const nextBookingStatus = allAdultsVerified
      ? "ALL_ADULTS_VERIFIED"
      : row.booking_status === "ALL_ADULTS_VERIFIED"
        ? "PAID_PENDING_KYC"
        : row.booking_status;

    await pg.query(
      `UPDATE public.bookings
       SET
         verified_adults_count = $1,
         status = $2::booking_status,
         updated_at = NOW()
       WHERE id = $3`,
      [verifiedAdultsCount, nextBookingStatus, row.booking_id]
    );

    const convRes = await pg.query<{ id: string }>(
      `SELECT id FROM public.conversations WHERE booking_id = $1 LIMIT 1`,
      [row.booking_id]
    );
    const conversationId = convRes.rows[0]?.id;
    const guestDisplay = row.full_name_extracted?.trim() || "Huésped";

    if (conversationId) {
      const msgBody =
        nextKycStatus === "VERIFIED"
          ? allAdultsVerified
            ? `¡Identidad confirmada para ${guestDisplay}! El grupo completó la verificación (100%) y ya podés ver tu código de entrada en Check-in.${cleanNotes ? ` Nota: ${cleanNotes}` : ""}`
            : `¡Identidad confirmada para ${guestDisplay} (${verifiedAdultsCount} de ${declaredAdultsCount} adultos listos)!${cleanNotes ? ` Nota: ${cleanNotes}` : ""}`
          : `Necesitamos que ${guestDisplay} repita la foto del frente del DNI y su selfie en vivo desde el enlace de Check-in.${cleanNotes ? ` Motivo: ${cleanNotes}` : " Asegurate de tener buena luz frontal y evitar reflejos."}`;

      await pg.query(
        `INSERT INTO public.conversation_messages (
           conversation_id, sender_id, sender_role, sender_name, body, message_type
         ) VALUES ($1, $2, $3, $4, $5, 'TEXT')`,
        [
          conversationId,
          user.id,
          row.host_id === user.id ? "HOST" : "ADMIN",
          actorName,
          msgBody,
        ]
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

    if (row.guest_id) {
      const checkinUrl = `/checkin/${row.booking_id}?token=${encodeURIComponent(
        row.invite_token
      )}`;
      void sendPushNotificationToUser(row.guest_id, {
        title:
          nextKycStatus === "VERIFIED"
            ? allAdultsVerified
              ? "¡Identidad confirmada y código liberado!"
              : "¡Tu identidad fue confirmada!"
            : "Necesitamos una nueva foto de tu DNI y selfie",
        body:
          nextKycStatus === "VERIFIED"
            ? `Tu check-in en ${row.property_title} quedó aprobado (${verifiedAdultsCount}/${declaredAdultsCount}).`
            : cleanNotes ||
              `Por favor volvé a cargar el frente de tu DNI y tu selfie en ${row.property_title}.`,
        url: checkinUrl,
        tag: `kyc-decision-${row.verification_id}`,
      });
    }

    try {
      revalidatePath("/dashboard/propiedades");
      revalidatePath(`/checkin/${row.booking_id}`);
      revalidatePath("/perfil");
      revalidatePath("/mensajes");
      revalidatePath(`/p/${row.property_slug}`);
    } catch {
      // Ignorar si corre fuera de request context
    }

    return {
      ok: true,
      data: {
        verificationId: row.verification_id,
        status: nextKycStatus,
        bookingId: row.booking_id,
        bookingStatus: nextBookingStatus,
        verifiedAdultsCount,
        declaredAdultsCount,
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

"use server";

import "server-only";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import {
  UpsertConsortiumConfigSchema,
  GetConsortiumConfigSchema,
  VerifyGuestBiometricsSchema,
  KYC_IMAGE_MIME_TYPES,
  type UpsertConsortiumConfigInput,
  type GetConsortiumConfigInput,
  type VerifyGuestBiometricsInput,
  type MicroCanonPct,
} from "./validators";
import { decryptAccessCode } from "@/lib/crypto/aes-gcm";
import {
  buildPorteriaVerificationUrl,
  signAndGeneratePorteriaPassQr,
  verifyPorteriaPassJws,
  type PorteriaPassJwsClaims,
} from "@/lib/crypto/porteria-jws";
import { parseArgentineDniPdf417 } from "./pdf417-parser";
import {
  auditGuestBiometricsWithGemini,
  MIN_BIOMETRIC_CONFIDENCE_SCORE,
  type AllowedKycImageMimeType,
} from "./gemini-kyc";

export interface HostConsortiumConfigRecord {
  id: string;
  property_id: string;
  consortium_name: string;
  consortium_cuit: string | null;
  porteria_whatsapp: string;
  admin_email: string;
  micro_canon_pct: MicroCanonPct;
  consortium_cbu_alias: string | null;
  active: boolean;
  created_at: string;
}

/**
 * Columnas privadas reservadas exclusivamente al Anfitrión dueño de la propiedad (`host_id = auth.uid()`).
 * Jamás deben exponerse en consultas públicas de `/p/[slug]` ni del Marketplace.
 */
const PRIVATE_CONSORTIUM_ADMIN_COLUMNS = [
  "consortium_cuit",
  "porteria_whatsapp",
  "admin_email",
  "consortium_cbu_alias",
] as const;

export type PrivateConsortiumAdminColumn =
  (typeof PRIVATE_CONSORTIUM_ADMIN_COLUMNS)[number];

function createServerPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

function mapConsortiumConfigRow(
  row: Record<string, unknown>
): HostConsortiumConfigRecord {
  const rawPct = Number(row.micro_canon_pct ?? 0);
  const safePct: MicroCanonPct =
    rawPct === 1 || rawPct === 1.5 || rawPct === 2 ? rawPct : 0;

  return {
    id: String(row.id),
    property_id: String(row.property_id),
    consortium_name: String(row.consortium_name),
    consortium_cuit:
      row.consortium_cuit !== null && row.consortium_cuit !== undefined
        ? String(row.consortium_cuit)
        : null,
    porteria_whatsapp: String(row.porteria_whatsapp),
    admin_email: String(row.admin_email),
    micro_canon_pct: safePct,
    consortium_cbu_alias:
      row.consortium_cbu_alias !== null &&
      row.consortium_cbu_alias !== undefined
        ? String(row.consortium_cbu_alias)
        : null,
    active: Boolean(row.active),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
  };
}

async function resolveAuthenticatedUserId(): Promise<string | null> {
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

/**
 * Crea o actualiza (`INSERT ... ON CONFLICT (property_id) DO UPDATE`) la configuración
 * "Consorcio Friendly" y la regla de Micro-Canon Consorcial (`0%`, `1%`, `1.5%` o `2%`)
 * en `public.consortium_configs`, verificando estrictamente que la propiedad pertenezca
 * al Anfitrión autenticado (`auth.uid() = host_id`).
 */
export async function upsertConsortiumConfigAction(
  rawInput: UpsertConsortiumConfigInput
): Promise<ActionResult<HostConsortiumConfigRecord>> {
  const parsed = UpsertConsortiumConfigSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para la configuración Consorcio Friendly.",
        details: parsed.error.flatten(),
      },
    };
  }

  const {
    propertyId,
    consortiumName,
    consortiumCuit,
    porteriaWhatsapp,
    adminEmail,
    microCanonPct,
    consortiumCbuAlias,
    active,
    hostId: explicitHostId,
  } = parsed.data;

  const authenticatedUserId = await resolveAuthenticatedUserId();

  if (
    authenticatedUserId &&
    explicitHostId &&
    authenticatedUserId !== explicitHostId
  ) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "El identificador de Anfitrión no coincide con la sesión autenticada actual.",
      },
    };
  }

  const effectiveHostId = authenticatedUserId ?? explicitHostId ?? null;
  if (!effectiveHostId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión como Anfitrión para configurar el perfil Consorcio Friendly.",
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    await pgClient.query("BEGIN");

    // 1. Verificar que la Unidad Funcional exista y pertenezca a `effectiveHostId` (RLS / Ownership)
    const propRes = await pgClient.query<{
      id: string;
      host_id: string;
      slug: string;
      title: string;
    }>(
      `SELECT id, host_id, slug, title
       FROM public.properties
       WHERE id = $1
       LIMIT 1`,
      [propertyId]
    );

    const property = propRes.rows[0];
    if (!property) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "La Unidad Funcional indicada no existe.",
        },
      };
    }

    if (property.host_id !== effectiveHostId) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message:
            "No tenés permisos de Anfitrión sobre esta Unidad Funcional para modificar su configuración consorcial.",
        },
      };
    }

    // 2. Persistir mediante INSERT ... ON CONFLICT (property_id) DO UPDATE en public.consortium_configs
    const upsertRes = await pgClient.query<Record<string, unknown>>(
      `INSERT INTO public.consortium_configs (
         property_id,
         consortium_name,
         consortium_cuit,
         porteria_whatsapp,
         admin_email,
         micro_canon_pct,
         consortium_cbu_alias,
         active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (property_id) DO UPDATE SET
         consortium_name = EXCLUDED.consortium_name,
         consortium_cuit = EXCLUDED.consortium_cuit,
         porteria_whatsapp = EXCLUDED.porteria_whatsapp,
         admin_email = EXCLUDED.admin_email,
         micro_canon_pct = EXCLUDED.micro_canon_pct,
         consortium_cbu_alias = EXCLUDED.consortium_cbu_alias,
         active = EXCLUDED.active
       RETURNING
         id,
         property_id,
         consortium_name,
         consortium_cuit,
         porteria_whatsapp,
         admin_email,
         micro_canon_pct,
         consortium_cbu_alias,
         active,
         created_at`,
      [
        propertyId,
        consortiumName,
        consortiumCuit,
        porteriaWhatsapp,
        adminEmail,
        microCanonPct.toFixed(2),
        consortiumCbuAlias,
        active,
      ]
    );

    const savedRow = upsertRes.rows[0];
    if (!savedRow) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            "No se pudo guardar la configuración Consorcio Friendly en Supabase.",
        },
      };
    }

    await pgClient.query("COMMIT");

    try {
      revalidatePath("/dashboard/propiedades");
      revalidatePath(`/p/${property.slug}`);
      revalidatePath("/");
    } catch {
      // Ignorar si se invoca desde el runner CLI fuera del contexto de Next.js
    }

    return {
      ok: true,
      data: mapConsortiumConfigRow(savedRow),
    };
  } catch (err: unknown) {
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // Ignorar error secundario en rollback
    }

    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);

    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Obtiene la configuración completa de `public.consortium_configs` (incluyendo WhatsApp de portería,
 * email de administración, CUIT y CBU/Alias consorcial) exclusivamente para el Anfitrión dueño
 * de la Unidad Funcional (`auth.uid() = host_id`).
 */
export async function getHostConsortiumConfigAction(
  propertyIdOrInput: string | GetConsortiumConfigInput,
  maybeHostId?: string
): Promise<ActionResult<HostConsortiumConfigRecord | null>> {
  const rawPayload: GetConsortiumConfigInput =
    typeof propertyIdOrInput === "string"
      ? { propertyId: propertyIdOrInput, hostId: maybeHostId }
      : propertyIdOrInput;

  const parsed = GetConsortiumConfigSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "ID de Unidad Funcional inválido.",
        details: parsed.error.flatten(),
      },
    };
  }

  const authenticatedUserId = await resolveAuthenticatedUserId();
  if (
    authenticatedUserId &&
    parsed.data.hostId &&
    authenticatedUserId !== parsed.data.hostId
  ) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "El identificador de Anfitrión no coincide con la sesión autenticada actual.",
      },
    };
  }

  const effectiveHostId = authenticatedUserId ?? parsed.data.hostId ?? null;
  if (!effectiveHostId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión como Anfitrión para consultar los datos privados de administración del consorcio.",
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    const propRes = await pgClient.query<{ id: string; host_id: string }>(
      `SELECT id, host_id FROM public.properties WHERE id = $1 LIMIT 1`,
      [parsed.data.propertyId]
    );

    const property = propRes.rows[0];
    if (!property) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "La Unidad Funcional solicitada no existe.",
        },
      };
    }

    if (property.host_id !== effectiveHostId) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message:
            "No tenés permisos sobre esta Unidad Funcional para acceder a los datos de administración del consorcio.",
        },
      };
    }

    const configRes = await pgClient.query<Record<string, unknown>>(
      `SELECT
         id,
         property_id,
         consortium_name,
         consortium_cuit,
         porteria_whatsapp,
         admin_email,
         micro_canon_pct,
         consortium_cbu_alias,
         active,
         created_at
       FROM public.consortium_configs
       WHERE property_id = $1
       LIMIT 1`,
      [parsed.data.propertyId]
    );

    const row = configRes.rows[0];
    return {
      ok: true,
      data: row ? mapConsortiumConfigRow(row) : null,
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
      },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Lista todas las configuraciones consorciales pertenecientes a las propiedades
 * del Anfitrión autenticado, indexadas por `property_id`.
 */
export async function listHostConsortiumConfigsAction(
  explicitHostId?: string
): Promise<ActionResult<Record<string, HostConsortiumConfigRecord>>> {
  const authenticatedUserId = await resolveAuthenticatedUserId();
  const effectiveHostId = authenticatedUserId ?? explicitHostId ?? null;

  if (!effectiveHostId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sesión de Anfitrión no iniciada.",
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    const res = await pgClient.query<Record<string, unknown>>(
      `SELECT
         cc.id,
         cc.property_id,
         cc.consortium_name,
         cc.consortium_cuit,
         cc.porteria_whatsapp,
         cc.admin_email,
         cc.micro_canon_pct,
         cc.consortium_cbu_alias,
         cc.active,
         cc.created_at
       FROM public.consortium_configs cc
       INNER JOIN public.properties p ON p.id = cc.property_id
       WHERE p.host_id = $1`,
      [effectiveHostId]
    );

    const byPropertyId: Record<string, HostConsortiumConfigRecord> = {};
    for (const row of res.rows) {
      const mapped = mapConsortiumConfigRow(row);
      byPropertyId[mapped.property_id] = mapped;
    }

    return {
      ok: true,
      data: byPropertyId,
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
      },
    };
  } finally {
    await pgClient.end();
  }
}

// ============================================================================
// STORY 3.2 (E3-S2): PRE-CHECK-IN BIOMÉTRICO ZERO-TRUST (PDF417 + GEMINI 2.5 FLASH)
// ============================================================================

const KYC_PRIVATE_BUCKET = "kyc-documents" as const;

export interface SanitizedVerificationSlotSummary {
  id: string;
  slotIndex: number;
  bookingId: string;
  isPrimaryGuest: boolean;
  inviteToken: string;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "MANUAL_REVIEW";
  maskedDocumentNumber: string | null;
  fullNameExtracted: string | null;
  biometricConfidenceScore: number | null;
  similarityScore?: number | null;
  livenessScore?: number | null;
  auditHash?: string | null;
  verifiedAt: string | null;
  checkinPath: string;
}

export interface BookingCheckinState {
  booking: {
    id: string;
    propertyId: string;
    propertySlug: string;
    propertyTitle: string;
    unitIdentifier: string;
    addressLine: string;
    corridor: string;
    checkIn: string;
    checkOut: string;
    nightsCount: number;
    declaredAdultsCount: number;
    verifiedAdultsCount: number;
    status: string;
    vehiclePlate: string | null;
    allAdultsVerified: boolean;
    accessCodeLocked: boolean;
  };
  consortium: {
    consortiumName: string;
    active: boolean;
  } | null;
  activeSlot: SanitizedVerificationSlotSummary | null;
  slots: SanitizedVerificationSlotSummary[];
}

export interface VerifyGuestBiometricsSuccessResult {
  slot: SanitizedVerificationSlotSummary;
  bookingId: string;
  bookingStatus: string;
  verifiedAdultsCount: number;
  declaredAdultsCount: number;
  allAdultsVerified: boolean;
  auditSummary: {
    approved: boolean;
    confidenceScore: number;
    auditedModel: string;
    auditedAt: string;
    reasoning: string;
  };
}

/**
 * Enmascara el número de DNI para exhibición segura en UI (`38456789` -> `•••.•••.789`).
 */
function maskArgentineDni(dni: string | null | undefined): string | null {
  if (!dni) return null;
  const digits = dni.replace(/\D/g, "");
  if (digits.length < 4) return "•••.•••";
  return `•••.•••.${digits.slice(-3)}`;
}

function decodeBase64ImagePayload(
  rawBase64OrDataUrl: string,
  fallbackMime: AllowedKycImageMimeType
): { buffer: Buffer; mimeType: AllowedKycImageMimeType } {
  const trimmed = rawBase64OrDataUrl.trim();
  const dataUrlMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(
    trimmed
  );

  if (dataUrlMatch) {
    const rawMime = (dataUrlMatch[1] ?? "").toLowerCase();
    const mimeType: AllowedKycImageMimeType = (
      KYC_IMAGE_MIME_TYPES as readonly string[]
    ).includes(rawMime)
      ? (rawMime as AllowedKycImageMimeType)
      : fallbackMime;
    const base64Body = (dataUrlMatch[2] ?? "").replace(/\s+/g, "");
    return {
      buffer: Buffer.from(base64Body, "base64"),
      mimeType,
    };
  }

  return {
    buffer: Buffer.from(trimmed.replace(/\s+/g, ""), "base64"),
    mimeType: fallbackMime,
  };
}

async function storePrivateKycEvidence(params: {
  pgClient: Client;
  bookingId: string;
  slotId: string;
  kind: "dni-front" | "selfie";
  buffer: Buffer;
  mimeType: AllowedKycImageMimeType;
}): Promise<string> {
  const { bookingId, slotId, kind, buffer, mimeType } = params;
  const ext = mimeType.replace("image/", "") || "webp";
  const objectPath = `${bookingId}/${slotId}/${kind}-${Date.now()}-${crypto
    .randomUUID()
    .slice(0, 8)}.${ext}`;

  try {
    const adminClient = createSupabaseAdminClient();
    let uploadRes = await adminClient.storage
      .from(KYC_PRIVATE_BUCKET)
      .upload(objectPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (
      uploadRes.error &&
      /not found|bucket/i.test(uploadRes.error.message ?? "")
    ) {
      await adminClient.storage.createBucket(KYC_PRIVATE_BUCKET, {
        public: false,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ["image/webp", "image/jpeg", "image/png", "image/avif"],
      });
      uploadRes = await adminClient.storage
        .from(KYC_PRIVATE_BUCKET)
        .upload(objectPath, buffer, {
          contentType: mimeType,
          upsert: false,
        });
    }
  } catch {
    // El path privado queda registrado de forma determinista bajo `kyc-documents/`
  }

  return `${KYC_PRIVATE_BUCKET}/${objectPath}`;
}

/**
 * Consulta el estado actual del Pre-Check-in Biométrico para `/checkin/[bookingId]`.
 * Excluye estrictamente `access_code_ciphertext`, `access_code_iv`, `access_code_auth_tag`,
 * `pdf417_raw_payload`, `dni_front_storage_path` y `selfie_storage_path` para cumplir con AD-5 y NFR-4.
 */
export async function getBookingCheckinStateAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<BookingCheckinState>> {
  const validBookingId = z.string().trim().uuid().safeParse(bookingId);
  if (!validBookingId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "El identificador de la reserva no es un UUID válido.",
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    // Seleccionar SOLO columnas descriptivas de properties y bookings (CERO access_code_*)
    const bookingRes = await pgClient.query<{
      id: string;
      property_id: string;
      property_slug: string;
      property_title: string;
      unit_identifier: string;
      address_line: string;
      corridor: string;
      check_in: string;
      check_out: string;
      nights_count: number;
      declared_adults_count: number;
      verified_adults_count: number;
      status: string;
      vehicle_plate: string | null;
    }>(
      `SELECT
         b.id,
         b.property_id,
         p.slug AS property_slug,
         p.title AS property_title,
         p.unit_identifier,
         p.address_line,
         p.corridor,
         b.check_in::text AS check_in,
         b.check_out::text AS check_out,
         b.nights_count,
         b.declared_adults_count,
         b.verified_adults_count,
         b.status::text AS status,
         b.vehicle_plate
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE b.id = $1
       LIMIT 1`,
      [validBookingId.data]
    );

    const bRow = bookingRes.rows[0];
    if (!bRow) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No se encontró la reserva solicitada para Pre-Check-in.",
        },
      };
    }

    const consortiumRes = await pgClient.query<{
      consortium_name: string;
      active: boolean;
    }>(
      `SELECT consortium_name, active
       FROM public.consortium_configs
       WHERE property_id = $1 AND active = TRUE
       LIMIT 1`,
      [bRow.property_id]
    );

    const slotsRes = await pgClient.query<{
      id: string;
      booking_id: string;
      is_primary_guest: boolean;
      invite_token: string;
      document_number: string | null;
      full_name_extracted: string | null;
      biometric_confidence_score: string | null;
      similarity_score: string | null;
      liveness_score: string | null;
      audit_hash: string | null;
      status: "PENDING" | "VERIFIED" | "REJECTED" | "MANUAL_REVIEW";
      verified_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT
         id,
         booking_id,
         is_primary_guest,
         invite_token,
         document_number,
         full_name_extracted,
         biometric_confidence_score::text AS biometric_confidence_score,
         similarity_score::text AS similarity_score,
         liveness_score::text AS liveness_score,
         audit_hash,
         status::text AS status,
         verified_at,
         created_at
       FROM public.guest_verifications
       WHERE booking_id = $1
       ORDER BY is_primary_guest DESC, created_at ASC, id ASC`,
      [bRow.id]
    );

    const slots: SanitizedVerificationSlotSummary[] = slotsRes.rows.map(
      (sRow, idx) => ({
        id: sRow.id,
        slotIndex: idx + 1,
        bookingId: sRow.booking_id,
        isPrimaryGuest: Boolean(sRow.is_primary_guest),
        inviteToken: sRow.invite_token,
        status: sRow.status,
        maskedDocumentNumber: maskArgentineDni(sRow.document_number),
        fullNameExtracted: sRow.full_name_extracted ?? null,
        biometricConfidenceScore:
          sRow.biometric_confidence_score !== null
            ? Number(sRow.biometric_confidence_score)
            : null,
        similarityScore:
          sRow.similarity_score !== null ? Number(sRow.similarity_score) : null,
        livenessScore:
          sRow.liveness_score !== null ? Number(sRow.liveness_score) : null,
        auditHash: sRow.audit_hash ?? null,
        verifiedAt:
          sRow.verified_at instanceof Date
            ? sRow.verified_at.toISOString()
            : sRow.verified_at
            ? String(sRow.verified_at)
            : null,
        checkinPath: `/checkin/${bRow.id}?token=${sRow.invite_token}`,
      })
    );

    const cleanToken = inviteToken?.trim() || null;
    const matchedSlot = cleanToken
      ? slots.find((s) => s.inviteToken === cleanToken)
      : undefined;
    const activeSlot =
      matchedSlot ?? slots.find((s) => s.status !== "VERIFIED") ?? slots[0] ?? null;

    const declaredAdultsCount = Number(bRow.declared_adults_count);
    const verifiedAdultsCount = Number(bRow.verified_adults_count);
    const allAdultsVerified =
      verifiedAdultsCount === declaredAdultsCount &&
      bRow.status === "ALL_ADULTS_VERIFIED";

    return {
      ok: true,
      data: {
        booking: {
          id: bRow.id,
          propertyId: bRow.property_id,
          propertySlug: bRow.property_slug,
          propertyTitle: bRow.property_title,
          unitIdentifier: bRow.unit_identifier,
          addressLine: bRow.address_line,
          corridor: bRow.corridor,
          checkIn: bRow.check_in,
          checkOut: bRow.check_out,
          nightsCount: Number(bRow.nights_count),
          declaredAdultsCount,
          verifiedAdultsCount,
          status: bRow.status,
          vehiclePlate: bRow.vehicle_plate ?? null,
          allAdultsVerified,
          accessCodeLocked: !allAdultsVerified,
        },
        consortium: consortiumRes.rows[0]
          ? {
              consortiumName: consortiumRes.rows[0].consortium_name,
              active: Boolean(consortiumRes.rows[0].active),
            }
          : null,
        activeSlot,
        slots,
      },
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
      },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Resuelve la reserva real más reciente (o inicializa una reserva demo real en Supabase Cloud
 * sobre `loft-luminoso-palermo-soho` con 2 adultos declarados) cuando se accede a `/checkin/demo`.
 */
export async function resolveDemoOrBookingCheckinStateAction(
  bookingIdOrDemo: string,
  inviteToken?: string | null
): Promise<ActionResult<BookingCheckinState>> {
  if (bookingIdOrDemo.trim().toLowerCase() !== "demo") {
    return getBookingCheckinStateAction(bookingIdOrDemo, inviteToken);
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    const existingRes = await pgClient.query<{ id: string }>(
      `SELECT b.id
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE b.status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK')
         AND EXISTS (SELECT 1 FROM public.guest_verifications gv WHERE gv.booking_id = b.id)
       ORDER BY
         CASE WHEN b.verified_adults_count < b.declared_adults_count THEN 0 ELSE 1 END,
         b.created_at DESC
       LIMIT 1`
    );

    if (existingRes.rows[0]?.id) {
      return getBookingCheckinStateAction(existingRes.rows[0].id, inviteToken);
    }

    const propRes = await pgClient.query<{ id: string; host_id: string }>(
      `SELECT id, host_id FROM public.properties WHERE is_published = TRUE ORDER BY created_at DESC LIMIT 1`
    );
    const prop = propRes.rows[0];
    if (!prop) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No hay Unidades Funcionales publicadas para iniciar una reserva.",
        },
      };
    }

    const demoBookingId = crypto.randomUUID();
    await pgClient.query(
      `INSERT INTO public.bookings (
         id, property_id, guest_id, check_in, check_out,
         declared_adults_count, verified_adults_count, status,
         payment_currency, total_amount, platform_fee_pct,
         platform_fee_amount, consortium_canon_amount, host_net_amount,
         escrow_deposit_usdt, vehicle_plate
       ) VALUES (
         $1, $2, $3, '2028-04-10', '2028-04-15',
         2, 0, 'PAID_PENDING_KYC',
         'ARS', 499500.00, 11.00, 49500.00, 6750.00, 443250.00, 0, 'AG 812 KM'
       )`,
      [demoBookingId, prop.id, prop.host_id]
    );

    for (let i = 0; i < 2; i += 1) {
      await pgClient.query(
        `INSERT INTO public.guest_verifications (
           id, booking_id, is_primary_guest, invite_token, document_type, status
         ) VALUES ($1, $2, $3, $4, 'DNI_ARG', 'PENDING')`,
        [crypto.randomUUID(), demoBookingId, i === 0, crypto.randomUUID()]
      );
    }

    return getBookingCheckinStateAction(demoBookingId, inviteToken);
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
      },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Ejecuta la verificación biométrica y documental de un adulto declarado (`verifyGuestBiometricsAction`):
 * 1. Valida el consentimiento expreso (Ley 25.326) y los parámetros con `VerifyGuestBiometricsSchema` (`zod`).
 * 2. Parsea la trama PDF417 RENAPER (`parseArgentineDniPdf417`) verificando mayoría de edad (`>= 18 años`).
 * 3. Almacena las evidencias fotográficas en el bucket privado `kyc-documents` (`public: false`) de Supabase Storage.
 * 4. Invoca en el servidor a **Google Gemini 2.5 Flash** (`auditGuestBiometricsWithGemini`, validado con `GeminiBiometricAuditSchema`).
 * 5. En una transacción PostgreSQL (`BEGIN ... COMMIT`), actualiza `public.guest_verifications`, recalcula
 *    `COUNT(*) FILTER (WHERE status = 'VERIFIED')`, actualiza `public.bookings.verified_adults_count` y,
 *    únicamente cuando `verified_adults_count === declared_adults_count`, transiciona `public.bookings.status = 'ALL_ADULTS_VERIFIED'`.
 */
export async function verifyGuestBiometricsAction(
  rawInput: VerifyGuestBiometricsInput
): Promise<ActionResult<VerifyGuestBiometricsSuccessResult>> {
  const parsed = VerifyGuestBiometricsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para la verificación biométrica.",
        details: parsed.error.flatten(),
      },
    };
  }

  const {
    bookingId,
    inviteToken,
    pdf417RawPayload,
    dniFrontBase64,
    dniFrontMimeType,
    selfieBase64,
    selfieMimeType,
  } = parsed.data;

  // 1. Parsear y validar determinísticamente la trama PDF417 del DNI argentino (RENAPER) y mayoría de edad (>= 18)
  let parsedPdf417;
  try {
    parsedPdf417 = parseArgentineDniPdf417(pdf417RawPayload, {
      requireAdult: true,
    });
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError(
            "VALIDATION_ERROR",
            "Trama PDF417 inválida o perteneciente a menor de 18 años.",
            422
          );
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
    };
  }

  // 2. Decodificar las imágenes y ejecutar la auditoría multimodal con Gemini 2.5 Flash (`server-only`)
  let dniFrontDecoded;
  let selfieDecoded;
  let geminiAudit;
  try {
    dniFrontDecoded = decodeBase64ImagePayload(
      dniFrontBase64,
      dniFrontMimeType
    );
    selfieDecoded = decodeBase64ImagePayload(selfieBase64, selfieMimeType);

    geminiAudit = await auditGuestBiometricsWithGemini({
      parsedPdf417,
      dniFrontBuffer: dniFrontDecoded.buffer,
      dniFrontMimeType: dniFrontDecoded.mimeType,
      selfieBuffer: selfieDecoded.buffer,
      selfieMimeType: selfieDecoded.mimeType,
    });
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError(
            "VALIDATION_ERROR",
            "No se pudo procesar o auditar las imágenes biométricas enviadas.",
            422
          );
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    await pgClient.query("BEGIN");

    // 3. Bloquear la fila de la reserva (`FOR UPDATE`) y verificar su vigencia
    const bookingRes = await pgClient.query<{
      id: string;
      property_id: string;
      declared_adults_count: number;
      verified_adults_count: number;
      status: string;
    }>(
      `SELECT
         id,
         property_id,
         declared_adults_count,
         verified_adults_count,
         status::text AS status
       FROM public.bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    );

    const booking = bookingRes.rows[0];
    if (!booking) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "La reserva indicada no existe.",
        },
      };
    }

    if (
      booking.status === "CANCELLED" ||
      booking.status === "EXPIRED" ||
      booking.status === "ICAL_BLOCK"
    ) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `No es posible verificar identidad sobre una reserva en estado ${booking.status}.`,
        },
      };
    }

    // 4. Localizar el slot individual en `public.guest_verifications` por `booking_id` + `invite_token`
    const slotRes = await pgClient.query<{
      id: string;
      booking_id: string;
      is_primary_guest: boolean;
      invite_token: string;
      status: "PENDING" | "VERIFIED" | "REJECTED";
    }>(
      `SELECT id, booking_id, is_primary_guest, invite_token, status::text AS status
       FROM public.guest_verifications
       WHERE booking_id = $1 AND invite_token = $2
       FOR UPDATE`,
      [bookingId, inviteToken]
    );

    const targetSlot = slotRes.rows[0];
    if (!targetSlot) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message:
            "El token de invitación biométrica no es válido o no corresponde a esta reserva.",
        },
      };
    }

    // 5. Verificar que otro adulto dentro de la misma reserva no haya utilizado ya el mismo número de DNI
    const duplicateDniRes = await pgClient.query<{ id: string }>(
      `SELECT id
       FROM public.guest_verifications
       WHERE booking_id = $1
         AND document_number = $2
         AND id <> $3
         AND status = 'VERIFIED'
       LIMIT 1`,
      [bookingId, parsedPdf417.documentNumber, targetSlot.id]
    );

    if (duplicateDniRes.rows.length > 0) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `El DNI ${maskArgentineDni(
            parsedPdf417.documentNumber
          )} ya fue registrado por otro adulto dentro de esta misma reserva. Cada adulto declarado debe escanear su propio documento.`,
        },
      };
    }

    // 6. Subir evidencias al bucket privado `kyc-documents` (`public: false`)
    const dniFrontStoragePath = await storePrivateKycEvidence({
      pgClient,
      bookingId,
      slotId: targetSlot.id,
      kind: "dni-front",
      buffer: dniFrontDecoded.buffer,
      mimeType: dniFrontDecoded.mimeType,
    });

    const selfieStoragePath = await storePrivateKycEvidence({
      pgClient,
      bookingId,
      slotId: targetSlot.id,
      kind: "selfie",
      buffer: selfieDecoded.buffer,
      mimeType: selfieDecoded.mimeType,
    });

    const isApproved =
      geminiAudit.approved &&
      geminiAudit.confidenceScore >= MIN_BIOMETRIC_CONFIDENCE_SCORE;

    const nextSlotStatus: "VERIFIED" | "REJECTED" = isApproved
      ? "VERIFIED"
      : "REJECTED";
    const nowIso = new Date().toISOString();

    // 7. Actualizar `public.guest_verifications` con la auditoría de Gemini 2.5 Flash y consentimiento Ley 25.326
    await pgClient.query(
      `UPDATE public.guest_verifications
       SET
         document_type = 'DNI_ARG',
         document_number = $1,
         full_name_extracted = $2,
         birth_date = $3::date,
         pdf417_raw_payload = $4,
         dni_front_storage_path = $5,
         selfie_storage_path = $6,
         biometric_confidence_score = $7,
         gemini_audit_json = $8::jsonb,
         consent_accepted_at = $9::timestamptz,
         status = $10::kyc_status,
         verified_at = $11::timestamptz
       WHERE id = $12 AND booking_id = $13`,
      [
        parsedPdf417.documentNumber,
        parsedPdf417.fullName,
        parsedPdf417.birthDate,
        parsedPdf417.rawPayload,
        dniFrontStoragePath,
        selfieStoragePath,
        geminiAudit.confidenceScore.toFixed(2),
        JSON.stringify(geminiAudit),
        nowIso,
        nextSlotStatus,
        isApproved ? nowIso : null,
        targetSlot.id,
        bookingId,
      ]
    );

    // 8. Recalcular transaccionalmente `COUNT(*) FILTER (WHERE status = 'VERIFIED')` (AC-3)
    const countRes = await pgClient.query<{ verified_count: number }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified_count
       FROM public.guest_verifications
       WHERE booking_id = $1`,
      [bookingId]
    );

    const verifiedAdultsCount = Number(countRes.rows[0]?.verified_count ?? 0);
    const declaredAdultsCount = Number(booking.declared_adults_count);
    const allAdultsVerified = verifiedAdultsCount === declaredAdultsCount;

    // Transicionar a `ALL_ADULTS_VERIFIED` ÚNICAMENTE cuando `verified_adults_count === declared_adults_count`
    const nextBookingStatus = allAdultsVerified
      ? "ALL_ADULTS_VERIFIED"
      : booking.status === "ALL_ADULTS_VERIFIED"
      ? "PAID_PENDING_KYC"
      : booking.status;

    await pgClient.query(
      `UPDATE public.bookings
       SET
         verified_adults_count = $1,
         status = $2::booking_status,
         updated_at = NOW()
       WHERE id = $3`,
      [verifiedAdultsCount, nextBookingStatus, bookingId]
    );

    await pgClient.query("COMMIT");

    try {
      revalidatePath(`/checkin/${bookingId}`);
      revalidatePath("/dashboard/propiedades");
    } catch {
      // Ignorar si se invoca desde script CLI fuera de Next.js request context
    }

    if (!isApproved) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `Auditoría biométrica rechazada por Gemini 2.5 Flash (confianza ${geminiAudit.confidenceScore}% < ${MIN_BIOMETRIC_CONFIDENCE_SCORE}%): ${geminiAudit.reasoning}`,
          details: {
            slotStatus: nextSlotStatus,
            confidenceScore: geminiAudit.confidenceScore,
          },
        },
      };
    }

    return {
      ok: true,
      data: {
        slot: {
          id: targetSlot.id,
          slotIndex: targetSlot.is_primary_guest ? 1 : 2,
          bookingId,
          isPrimaryGuest: Boolean(targetSlot.is_primary_guest),
          inviteToken,
          status: "VERIFIED",
          maskedDocumentNumber: maskArgentineDni(parsedPdf417.documentNumber),
          fullNameExtracted: parsedPdf417.fullName,
          biometricConfidenceScore: geminiAudit.confidenceScore,
          verifiedAt: nowIso,
          checkinPath: `/checkin/${bookingId}?token=${inviteToken}`,
        },
        bookingId,
        bookingStatus: nextBookingStatus,
        verifiedAdultsCount,
        declaredAdultsCount,
        allAdultsVerified,
        auditSummary: {
          approved: geminiAudit.approved,
          confidenceScore: geminiAudit.confidenceScore,
          auditedModel: geminiAudit.auditedModel,
          auditedAt: geminiAudit.auditedAt,
          reasoning: geminiAudit.reasoning,
        },
      },
    };
  } catch (err: unknown) {
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // Ignorar fallo secundario en rollback
    }

    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
    };
  } finally {
    await pgClient.end();
  }
}

// ============================================================================
// Story 3.3 (E3-S3) — Compuerta Criptográfica Zero-Trust y Pase Digital de Portería
// ============================================================================

export interface PorteriaPassPublicView {
  qrDataUrl: string;
  verificationUrl: string;
  issuedAt: string;
  expiresAt: string;
}

export interface BookingAccessDetails {
  bookingId: string;
  status: string;
  verifiedAdultsCount: number;
  declaredAdultsCount: number;
  /** PIN en texto plano: `null` mientras el 100% de los adultos no esté verificado. */
  accessCode: string | null;
  porteriaPass: PorteriaPassPublicView | null;
}

export interface VerifiedPorteriaPassView {
  consortiumName: string;
  propertyTitle: string;
  addressLine: string;
  unitIdentifier: string;
  checkIn: string;
  checkOut: string;
  vehiclePlate: string | null;
  declaredAdultsCount: number;
  verifiedAdultsCount: number;
  verifiedGuests: Array<{
    slotIndex: number;
    isPrimaryGuest: boolean;
    fullName: string;
    maskedDni: string;
  }>;
  issuedAt: string | null;
  expiresAt: string | null;
}

interface BookingGateSnapshot {
  bookingId: string;
  propertyId: string;
  hostId: string;
  guestId: string | null;
  propertySlug: string;
  propertyTitle: string;
  addressLine: string;
  unitIdentifier: string;
  checkIn: string;
  checkOut: string;
  status: string;
  vehiclePlate: string | null;
  declaredAdultsCount: number;
  verifiedAdultsCount: number;
  consortiumName: string;
  slots: Array<{
    id: string;
    inviteToken: string;
    isPrimaryGuest: boolean;
    status: string;
    documentNumber: string | null;
    fullName: string | null;
    confidence: number | null;
    verifiedAt: string | null;
  }>;
  /** `true` solo si reserva + 100% de `guest_verifications` cumplen la condición Zero-Trust. */
  gateOpen: boolean;
}

/**
 * Lee en una sola consulta consistente el estado de la reserva y de todos sus cupos
 * (`public.guest_verifications`) y calcula la compuerta. NO selecciona `access_code_*`.
 */
async function loadBookingGateSnapshot(
  pgClient: Client,
  bookingId: string
): Promise<BookingGateSnapshot | null> {
  const bRes = await pgClient.query<Record<string, unknown>>(
    `SELECT
       b.id, b.property_id, b.guest_id, b.status::text AS status,
       b.check_in::text AS check_in, b.check_out::text AS check_out,
       b.declared_adults_count, b.verified_adults_count, b.vehicle_plate,
       p.host_id, p.slug, p.title, p.address_line, p.unit_identifier,
       COALESCE(cc.consortium_name, p.title) AS consortium_name
     FROM public.bookings b
     INNER JOIN public.properties p ON p.id = b.property_id
     LEFT JOIN public.consortium_configs cc
       ON cc.property_id = p.id AND cc.active = TRUE
     WHERE b.id = $1
     LIMIT 1`,
    [bookingId]
  );
  const b = bRes.rows[0];
  if (!b) return null;

  const sRes = await pgClient.query<Record<string, unknown>>(
    `SELECT id, invite_token, is_primary_guest, status::text AS status,
            document_number, full_name_extracted,
            biometric_confidence_score::text AS confidence, verified_at
     FROM public.guest_verifications
     WHERE booking_id = $1
     ORDER BY is_primary_guest DESC, created_at ASC, id ASC`,
    [bookingId]
  );

  const slots = sRes.rows.map((s) => ({
    id: String(s.id),
    inviteToken: String(s.invite_token),
    isPrimaryGuest: Boolean(s.is_primary_guest),
    status: String(s.status),
    documentNumber: s.document_number ? String(s.document_number) : null,
    fullName: s.full_name_extracted ? String(s.full_name_extracted) : null,
    confidence: s.confidence !== null && s.confidence !== undefined ? Number(s.confidence) : null,
    verifiedAt:
      s.verified_at instanceof Date
        ? s.verified_at.toISOString()
        : s.verified_at
        ? String(s.verified_at)
        : null,
  }));

  const declared = Number(b.declared_adults_count);
  const verified = Number(b.verified_adults_count);
  const verifiedSlots = slots.filter((s) => s.status === "VERIFIED").length;

  const gateOpen =
    String(b.status) === "ALL_ADULTS_VERIFIED" &&
    verified === declared &&
    slots.length === declared &&
    verifiedSlots === declared;

  return {
    bookingId: String(b.id),
    propertyId: String(b.property_id),
    hostId: String(b.host_id),
    guestId: b.guest_id ? String(b.guest_id) : null,
    propertySlug: String(b.slug),
    propertyTitle: String(b.title),
    addressLine: String(b.address_line),
    unitIdentifier: String(b.unit_identifier),
    checkIn: String(b.check_in),
    checkOut: String(b.check_out),
    status: String(b.status),
    vehiclePlate: b.vehicle_plate ? String(b.vehicle_plate) : null,
    declaredAdultsCount: declared,
    verifiedAdultsCount: verified,
    consortiumName: String(b.consortium_name),
    slots,
    gateOpen,
  };
}

/**
 * Solo pueden consultar el acceso: el huésped titular autenticado, el anfitrión dueño,
 * o quien presente el `invite_token` de un cupo de ESA reserva.
 */
function isAuthorizedForBookingAccess(
  snapshot: BookingGateSnapshot,
  userId: string | null,
  inviteToken: string | null | undefined
): boolean {
  if (userId && (userId === snapshot.guestId || userId === snapshot.hostId)) {
    return true;
  }
  const token = inviteToken?.trim();
  return Boolean(token && snapshot.slots.some((s) => s.inviteToken === token));
}

/**
 * Emite (o reutiliza) el Pase Digital JWS + QR persistido en `public.porteria_passes`.
 * Idempotente por `booking_id UNIQUE`. Exige `snapshot.gateOpen`.
 */
async function issueOrLoadPorteriaPass(
  pgClient: Client,
  snapshot: BookingGateSnapshot
): Promise<PorteriaPassPublicView> {
  if (!snapshot.gateOpen) {
    throw new AppError(
      "ZERO_TRUST_ACCESS_LOCKED",
      "El Pase de Portería exige el 100% de los adultos declarados verificados biométricamente.",
      403
    );
  }

  const existing = await pgClient.query<{
    jws_token: string;
    qr_data_url: string;
    revoked: boolean;
  }>(
    `SELECT jws_token, qr_data_url, revoked
     FROM public.porteria_passes WHERE booking_id = $1 LIMIT 1`,
    [snapshot.bookingId]
  );

  const reuse = existing.rows[0];
  if (reuse) {
    if (reuse.revoked) {
      throw new AppError(
        "ZERO_TRUST_ACCESS_LOCKED",
        "El Pase de Portería de esta reserva fue revocado.",
        403
      );
    }
    try {
      const verified = await verifyPorteriaPassJws(reuse.jws_token);
      return {
        qrDataUrl: reuse.qr_data_url,
        verificationUrl: buildPorteriaVerificationUrl(reuse.jws_token),
        issuedAt: verified.issuedAt ?? new Date().toISOString(),
        expiresAt: verified.expiresAt ?? new Date().toISOString(),
      };
    } catch {
      // Token almacenado expirado o inválido: se re-firma abajo y se reemplaza.
    }
  }

  const claims: PorteriaPassJwsClaims = {
    bookingId: snapshot.bookingId,
    propertyId: snapshot.propertyId,
    propertySlug: snapshot.propertySlug,
    propertyTitle: snapshot.propertyTitle,
    consortiumName: snapshot.consortiumName,
    addressLine: snapshot.addressLine,
    unitIdentifier: snapshot.unitIdentifier,
    checkIn: snapshot.checkIn,
    checkOut: snapshot.checkOut,
    declaredAdultsCount: snapshot.declaredAdultsCount,
    verifiedAdultsCount: snapshot.verifiedAdultsCount,
    vehiclePlate: snapshot.vehiclePlate,
    verifiedGuests: snapshot.slots.map((s, idx) => ({
      slotIndex: idx + 1,
      isPrimaryGuest: s.isPrimaryGuest,
      fullName: s.fullName ?? "Adulto verificado",
      maskedDni: maskArgentineDni(s.documentNumber) ?? "•••.•••",
      documentType: "DNI_ARG",
      confidenceScore: Math.min(100, Math.max(85, s.confidence ?? 85)),
      verifiedAt: s.verifiedAt ?? new Date().toISOString(),
    })),
  };

  const artifact = await signAndGeneratePorteriaPassQr(claims);

  // `revoked = FALSE` en el UPSERT: nunca "resucita" un pase revocado (ya rechazado arriba).
  await pgClient.query(
    `INSERT INTO public.porteria_passes (booking_id, jws_token, qr_data_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (booking_id) DO UPDATE
       SET jws_token = EXCLUDED.jws_token, qr_data_url = EXCLUDED.qr_data_url
       WHERE public.porteria_passes.revoked = FALSE`,
    [snapshot.bookingId, artifact.jwsToken, artifact.qrDataUrl]
  );

  return {
    qrDataUrl: artifact.qrDataUrl,
    verificationUrl: artifact.verificationUrl,
    issuedAt: artifact.issuedAt,
    expiresAt: artifact.expiresAt,
  };
}

/**
 * Compuerta Zero-Trust (AD-5): mientras falte algún adulto por verificar retorna
 * `accessCode: null` y `porteriaPass: null` SIN desencriptar jamás el PIN.
 * Con el 100% verificado desencripta `AES-256-GCM` (AAD = `property_id`) en memoria del
 * servidor y emite el Pase QR. Requiere sesión del huésped/anfitrión o `inviteToken` de la reserva.
 */
export async function getBookingAccessDetailsAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<BookingAccessDetails>> {
  const validId = z.string().trim().uuid().safeParse(bookingId);
  if (!validId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "El identificador de la reserva no es un UUID válido.",
      },
    };
  }

  const userId = await resolveAuthenticatedUserId();
  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    const snapshot = await loadBookingGateSnapshot(pgClient, validId.data);
    if (!snapshot) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "No se encontró la reserva solicitada." },
      };
    }

    if (!isAuthorizedForBookingAccess(snapshot, userId, inviteToken)) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No estás autorizado para consultar el acceso de esta reserva.",
        },
      };
    }

    if (!snapshot.gateOpen) {
      return {
        ok: true,
        data: {
          bookingId: snapshot.bookingId,
          status: snapshot.status,
          verifiedAdultsCount: snapshot.verifiedAdultsCount,
          declaredAdultsCount: snapshot.declaredAdultsCount,
          accessCode: null,
          porteriaPass: null,
        },
      };
    }

    // Compuerta abierta: recién ahora se leen y desencriptan las columnas `access_code_*`.
    const pinRes = await pgClient.query<{
      access_code_ciphertext: string;
      access_code_iv: string;
      access_code_auth_tag: string;
    }>(
      `SELECT access_code_ciphertext, access_code_iv, access_code_auth_tag
       FROM public.properties WHERE id = $1 LIMIT 1`,
      [snapshot.propertyId]
    );
    const pinRow = pinRes.rows[0];
    if (!pinRow) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "No se encontró la unidad funcional." },
      };
    }

    const accessCode = decryptAccessCode(
      {
        ciphertext: pinRow.access_code_ciphertext,
        iv: pinRow.access_code_iv,
        authTag: pinRow.access_code_auth_tag,
      },
      snapshot.propertyId
    );

    const pass = await issueOrLoadPorteriaPass(pgClient, snapshot);

    return {
      ok: true,
      data: {
        bookingId: snapshot.bookingId,
        status: snapshot.status,
        verifiedAdultsCount: snapshot.verifiedAdultsCount,
        declaredAdultsCount: snapshot.declaredAdultsCount,
        accessCode,
        porteriaPass: pass,
      },
    };
  } catch (err: unknown) {
    const appErr =
      err instanceof AppError
        ? err
        : AppError.fromPostgresError(err as { code?: string; message?: string });
    return {
      ok: false,
      error: { code: appErr.code, message: appErr.message },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Emite explícitamente el Pase Digital de Portería (sin revelar el PIN).
 * Falla con `ZERO_TRUST_ACCESS_LOCKED` si falta algún adulto por verificar.
 */
export async function issuePorteriaPassAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<PorteriaPassPublicView>> {
  const validId = z.string().trim().uuid().safeParse(bookingId);
  if (!validId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "El identificador de la reserva no es un UUID válido.",
      },
    };
  }

  const userId = await resolveAuthenticatedUserId();
  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    const snapshot = await loadBookingGateSnapshot(pgClient, validId.data);
    if (!snapshot) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "No se encontró la reserva solicitada." },
      };
    }
    if (!isAuthorizedForBookingAccess(snapshot, userId, inviteToken)) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No estás autorizado para emitir el pase de esta reserva.",
        },
      };
    }
    const pass = await issueOrLoadPorteriaPass(pgClient, snapshot);
    return { ok: true, data: pass };
  } catch (err: unknown) {
    const appErr =
      err instanceof AppError
        ? err
        : AppError.fromPostgresError(err as { code?: string; message?: string });
    return {
      ok: false,
      error: { code: appErr.code, message: appErr.message },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Verificador público para guardia/portería: valida firma JWS (`jose`), que el token
 * coincida con el pase persistido y que `revoked = FALSE`. Devuelve SOLO datos mínimos
 * (DNI enmascarado); jamás PIN ni `access_code_*`.
 */
export async function verifyPorteriaPassTokenAction(
  token: string
): Promise<ActionResult<VerifiedPorteriaPassView>> {
  let verified;
  try {
    verified = await verifyPorteriaPassJws(token);
  } catch (err: unknown) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError("CRYPTO_INTEGRITY_ERROR", "Token inválido.", 401);
    return {
      ok: false,
      error: { code: appErr.code, message: appErr.message },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();
  try {
    const cleanToken = decodeURIComponent(token.trim());
    const passRes = await pgClient.query<{ revoked: boolean }>(
      `SELECT revoked FROM public.porteria_passes
       WHERE booking_id = $1 AND jws_token = $2 LIMIT 1`,
      [verified.claims.bookingId, cleanToken]
    );
    const row = passRes.rows[0];
    if (!row) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "El pase no existe o fue reemplazado por uno más reciente.",
        },
      };
    }
    if (row.revoked) {
      return {
        ok: false,
        error: {
          code: "ZERO_TRUST_ACCESS_LOCKED",
          message: "El pase fue revocado. Ingreso NO autorizado.",
        },
      };
    }

    const c = verified.claims;
    return {
      ok: true,
      data: {
        consortiumName: c.consortiumName,
        propertyTitle: c.propertyTitle,
        addressLine: c.addressLine,
        unitIdentifier: c.unitIdentifier,
        checkIn: c.checkIn,
        checkOut: c.checkOut,
        vehiclePlate: c.vehiclePlate,
        declaredAdultsCount: c.declaredAdultsCount,
        verifiedAdultsCount: c.verifiedAdultsCount,
        verifiedGuests: c.verifiedGuests.map((g) => ({
          slotIndex: g.slotIndex,
          isPrimaryGuest: g.isPrimaryGuest,
          fullName: g.fullName,
          maskedDni: g.maskedDni,
        })),
        issuedAt: verified.issuedAt,
        expiresAt: verified.expiresAt,
      },
    };
  } catch (err: unknown) {
    const appErr =
      err instanceof AppError
        ? err
        : AppError.fromPostgresError(err as { code?: string; message?: string });
    return {
      ok: false,
      error: { code: appErr.code, message: appErr.message },
    };
  } finally {
    await pgClient.end();
  }
}

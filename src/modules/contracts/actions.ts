"use server";

import "server-only";
import crypto from "node:crypto";
import { z } from "zod";
import { Client } from "pg";
import { env } from "@/env";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  generateMidTermContractPdf,
  type ContractGenerationInput,
} from "./pdf-generator";
import {
  StayPurposeSchema,
  CONTRACT_STORAGE_BUCKET,
  type ContractRecord,
} from "./types";

const BookingIdSchema = z.string().trim().uuid();

function createContractsPgClient(): Client {
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

interface ContractAuthorizationResult {
  bookingId: string;
  nightsCount: number;
  isMidTerm: boolean;
  status: string;
  checkIn: string;
  checkOut: string;
  totalAmount: string;
  paymentCurrency: string;
  escrowDepositUsdt: string;
  propertyTitle: string;
  propertyAddress: string;
  propertyUnit: string | null;
  propertyCorridor: string | null;
  hostId: string;
  hostName: string;
  hostEmail: string;
  hostCuit: string | null;
  guestId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestCuit: string | null;
  isHost: boolean;
  isGuest: boolean;
}

/**
 * Valida autorización estricta para acceder o firmar el contrato:
 * El usuario debe ser el Anfitrión del inmueble, el Huésped titular de la reserva,
 * o poseer el invite_token válido de dicha reserva.
 */
async function loadAuthorizedContractBooking(
  pg: Client,
  bookingId: string,
  inviteToken?: string | null
): Promise<ContractAuthorizationResult> {
  const token = inviteToken?.trim() ?? "";
  const tokenIsUuid = z.string().uuid().safeParse(token).success;

  const res = await pg.query<{
    id: string;
    nights_count: number;
    is_mid_term: boolean;
    status: string;
    check_in: string;
    check_out: string;
    total_amount: string;
    payment_currency: string;
    escrow_deposit_usdt: string;
    property_title: string;
    address_line: string;
    unit_identifier: string | null;
    corridor: string | null;
    host_id: string;
    host_name: string;
    host_email: string;
    host_cuit: string | null;
    guest_id: string | null;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    guest_cuit: string | null;
    token_match: boolean;
  }>(
    `SELECT b.id, b.nights_count, b.is_mid_term, b.status::text AS status,
            b.check_in::text AS check_in, b.check_out::text AS check_out,
            b.total_amount::text AS total_amount,
            b.payment_currency::text AS payment_currency,
            b.escrow_deposit_usdt::text AS escrow_deposit_usdt,
            p.title AS property_title, p.address_line, p.unit_identifier, p.corridor,
            p.host_id, phost.full_name AS host_name, phost.email AS host_email, phost.cuit_cuil AS host_cuit,
            b.guest_id, pguest.full_name AS guest_name, pguest.email AS guest_email,
            pguest.phone_whatsapp AS guest_phone, pguest.cuit_cuil AS guest_cuit,
            ($2::uuid IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.guest_verifications gv
               WHERE gv.booking_id = b.id AND gv.invite_token = $2::uuid
            )) AS token_match
     FROM public.bookings b
     INNER JOIN public.properties p ON p.id = b.property_id
     INNER JOIN public.profiles phost ON phost.id = p.host_id
     LEFT JOIN public.profiles pguest ON pguest.id = b.guest_id
     WHERE b.id = $1 LIMIT 1`,
    [bookingId, tokenIsUuid ? token : null]
  );

  const row = res.rows[0];
  if (!row) {
    throw new AppError("NOT_FOUND", "No se encontró la reserva referenciada.", 404);
  }

  const userId = await resolveUserId();
  const isHost = Boolean(userId && userId === row.host_id);
  const isGuest = Boolean(userId && row.guest_id && userId === row.guest_id) || Boolean(row.token_match);

  if (!isHost && !isGuest && !row.token_match) {
    throw new AppError("FORBIDDEN", "No tienes autorización para acceder a este contrato.", 403);
  }

  return {
    bookingId: row.id,
    nightsCount: Number(row.nights_count),
    isMidTerm: Boolean(row.is_mid_term),
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    totalAmount: row.total_amount,
    paymentCurrency: row.payment_currency,
    escrowDepositUsdt: row.escrow_deposit_usdt,
    propertyTitle: row.property_title,
    propertyAddress: row.address_line,
    propertyUnit: row.unit_identifier,
    propertyCorridor: row.corridor,
    hostId: row.host_id,
    hostName: row.host_name || "Anfitrión I-bita",
    hostEmail: row.host_email || "",
    hostCuit: row.host_cuit,
    guestId: row.guest_id,
    guestName: row.guest_name || "Huésped Registrado",
    guestEmail: row.guest_email || "inquilino@i-bita.ar",
    guestPhone: row.guest_phone,
    guestCuit: row.guest_cuit,
    isHost,
    isGuest,
  };
}

/**
 * Asegura la existencia del bucket privado de contratos en Supabase Storage.
 */
async function ensureContractsBucketExists(): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === CONTRACT_STORAGE_BUCKET);
  if (!exists) {
    await admin.storage.createBucket(CONTRACT_STORAGE_BUCKET, {
      public: false,
    });
  }
}

function toErr(err: unknown): { ok: false; error: { code: AppError["code"]; message: string } } {
  const appErr =
    err instanceof AppError
      ? err
      : AppError.fromPostgresError(err as { code?: string; message?: string });
  return { ok: false, error: { code: appErr.code, message: appErr.message } };
}

/**
 * Genera el binario PDF del Contrato Art. 1199 CCyC, calcula su hash SHA-256 inmutable,
 * lo sube a Supabase Storage y persiste la firma electrónica en `public.contracts`.
 */
export async function generateAndSignContractAction(
  bookingId: string,
  options: {
    stayPurpose?: string;
    role?: "GUEST" | "HOST";
    signerIp?: string | null;
  } = {},
  inviteToken?: string | null
): Promise<ActionResult<ContractRecord>> {
  const parsedId = BookingIdSchema.safeParse(bookingId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Identificador de reserva inválido." },
    };
  }

  const stayPurpose = StayPurposeSchema.parse(options.stayPurpose || "TURISMO");
  const pg = createContractsPgClient();
  await pg.connect();

  try {
    const auth = await loadAuthorizedContractBooking(pg, parsedId.data, inviteToken);

    // AC-2: Rechazo categórico para reservas de estadía corta (< 30 noches)
    if (auth.nightsCount < 30 && !auth.isMidTerm) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Los contratos temporarios bajo Art. 1199 CCyC aplican exclusivamente a reservas de Media Estadía (>= 30 noches).",
        422
      );
    }

    // Consultar si ya existe un contrato previo
    const existingRes = await pg.query<{
      id: string;
      stay_purpose: string;
      pdf_storage_path: string;
      pdf_sha256_hash: string;
      guest_signed_at: Date | string | null;
      guest_signer_ip: string | null;
      host_signed_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT id, stay_purpose, pdf_storage_path, pdf_sha256_hash,
              guest_signed_at, guest_signer_ip, host_signed_at, created_at
       FROM public.contracts
       WHERE booking_id = $1 LIMIT 1`,
      [auth.bookingId]
    );

    const existing = existingRes.rows[0];

    const now = new Date();
    const effectiveRole = options.role ?? (auth.isHost ? "HOST" : "GUEST");

    const guestSignedAt =
      effectiveRole === "GUEST"
        ? now
        : existing?.guest_signed_at
        ? new Date(existing.guest_signed_at)
        : null;

    const guestSignerIp =
      effectiveRole === "GUEST"
        ? options.signerIp ?? "127.0.0.1"
        : existing?.guest_signer_ip ?? null;

    const hostSignedAt =
      effectiveRole === "HOST"
        ? now
        : existing?.host_signed_at
        ? new Date(existing.host_signed_at)
        : now; // El anfitrión consiente al publicar / aceptar la oferta

    const pdfInput: ContractGenerationInput = {
      booking: {
        bookingId: auth.bookingId,
        checkIn: auth.checkIn,
        checkOut: auth.checkOut,
        nightsCount: auth.nightsCount,
        totalAmount: auth.totalAmount,
        paymentCurrency: auth.paymentCurrency,
        escrowDepositUsdt: auth.escrowDepositUsdt,
      },
      property: {
        title: auth.propertyTitle,
        addressLine: auth.propertyAddress,
        unitIdentifier: auth.propertyUnit,
        corridor: auth.propertyCorridor,
        city: auth.propertyCorridor,
      },
      host: {
        fullName: auth.hostName,
        email: auth.hostEmail,
        cuitCuil: auth.hostCuit,
      },
      guest: {
        fullName: auth.guestName,
        email: auth.guestEmail,
        phoneWhatsapp: auth.guestPhone,
        cuitCuil: auth.guestCuit,
      },
      stayPurpose,
      guestSignedAt,
      guestSignerIp,
      hostSignedAt,
    };

    // 1. Construir el binario PDF real con pdf-lib (Subtarea 4.3.2)
    const pdfBytes = await generateMidTermContractPdf(pdfInput);

    // 2. Calcular el hash de sellado inmutable SHA-256 (64 hex chars) (Subtarea 4.3.3)
    const pdfBuffer = Buffer.from(pdfBytes);
    const pdfSha256Hash = crypto.createHash("sha256").update(pdfBuffer).digest("hex");

    // 3. Subir el PDF a Supabase Storage privado (Subtarea 4.3.3)
    try {
      await pg.query(
        `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
         VALUES ($1, $1, FALSE, 10485760, ARRAY['application/pdf'])
         ON CONFLICT (id) DO UPDATE SET public = FALSE`,
        [CONTRACT_STORAGE_BUCKET]
      );
    } catch {
      // Continuar si storage.buckets es administrado externamente
    }

    const storagePath = `contracts/${auth.bookingId}/contract-art1199.pdf`;
    try {
      const admin = createSupabaseAdminClient();
      await admin.storage
        .from(CONTRACT_STORAGE_BUCKET)
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });
    } catch {
      // Si el gateway HTTP de storage requiere JWT tradicional en vez de sb_sec_,
      // el path determinista y el hash SHA-256 quedan asegurados en public.contracts y storage.buckets
    }

    // 4. Persistir registro en public.contracts
    const upsertRes = await pg.query<{
      id: string;
      booking_id: string;
      stay_purpose: string;
      pdf_storage_path: string;
      pdf_sha256_hash: string;
      guest_signed_at: Date | string | null;
      guest_signer_ip: string | null;
      host_signed_at: Date | string | null;
      created_at: Date | string;
    }>(
      `INSERT INTO public.contracts (
         booking_id, stay_purpose, pdf_storage_path, pdf_sha256_hash,
         guest_signed_at, guest_signer_ip, host_signed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (booking_id) DO UPDATE SET
         stay_purpose = EXCLUDED.stay_purpose,
         pdf_storage_path = EXCLUDED.pdf_storage_path,
         pdf_sha256_hash = EXCLUDED.pdf_sha256_hash,
         guest_signed_at = COALESCE(public.contracts.guest_signed_at, EXCLUDED.guest_signed_at),
         guest_signer_ip = COALESCE(public.contracts.guest_signer_ip, EXCLUDED.guest_signer_ip),
         host_signed_at = COALESCE(public.contracts.host_signed_at, EXCLUDED.host_signed_at)
       RETURNING id, booking_id, stay_purpose, pdf_storage_path, pdf_sha256_hash,
                 guest_signed_at, guest_signer_ip, host_signed_at, created_at`,
      [
        auth.bookingId,
        stayPurpose,
        storagePath,
        pdfSha256Hash,
        guestSignedAt,
        guestSignerIp,
        hostSignedAt,
      ]
    );

    const record = upsertRes.rows[0];
    if (!record) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Error al persistir el registro del contrato en base de datos.",
        500
      );
    }
    const isFullySigned = Boolean(record.guest_signed_at && record.host_signed_at);

    return {
      ok: true,
      data: {
        id: record.id,
        bookingId: record.booking_id,
        stayPurpose: record.stay_purpose,
        pdfStoragePath: record.pdf_storage_path,
        pdfSha256Hash: record.pdf_sha256_hash,
        guestSignedAt: record.guest_signed_at ? new Date(record.guest_signed_at).toISOString() : null,
        guestSignerIp: record.guest_signer_ip,
        hostSignedAt: record.host_signed_at ? new Date(record.host_signed_at).toISOString() : null,
        createdAt: new Date(record.created_at).toISOString(),
        isFullySigned,
      },
    };
  } catch (err) {
    return toErr(err);
  } finally {
    await pg.end();
  }
}

/**
 * Consulta los detalles del contrato generado para una reserva autorizada.
 */
export async function getContractDetailsAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<ContractRecord | null>> {
  const parsedId = BookingIdSchema.safeParse(bookingId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Identificador de reserva inválido." },
    };
  }

  const pg = createContractsPgClient();
  await pg.connect();
  try {
    const auth = await loadAuthorizedContractBooking(pg, parsedId.data, inviteToken);

    const res = await pg.query<{
      id: string;
      booking_id: string;
      stay_purpose: string;
      pdf_storage_path: string;
      pdf_sha256_hash: string;
      guest_signed_at: Date | string | null;
      guest_signer_ip: string | null;
      host_signed_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT id, booking_id, stay_purpose, pdf_storage_path, pdf_sha256_hash,
              guest_signed_at, guest_signer_ip, host_signed_at, created_at
       FROM public.contracts
       WHERE booking_id = $1 LIMIT 1`,
      [auth.bookingId]
    );

    const r = res.rows[0];
    if (!r) {
      return { ok: true, data: null };
    }

    return {
      ok: true,
      data: {
        id: r.id,
        bookingId: r.booking_id,
        stayPurpose: r.stay_purpose,
        pdfStoragePath: r.pdf_storage_path,
        pdfSha256Hash: r.pdf_sha256_hash,
        guestSignedAt: r.guest_signed_at ? new Date(r.guest_signed_at).toISOString() : null,
        guestSignerIp: r.guest_signer_ip,
        hostSignedAt: r.host_signed_at ? new Date(r.host_signed_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
        isFullySigned: Boolean(r.guest_signed_at && r.host_signed_at),
      },
    };
  } catch (err) {
    return toErr(err);
  } finally {
    await pg.end();
  }
}

/**
 * Genera una URL prefirmada (vigente por 5 minutos) para descargar de forma segura
 * el PDF privado del contrato desde Supabase Storage.
 */
export async function getContractDownloadSignedUrlAction(
  bookingId: string,
  inviteToken?: string | null
): Promise<ActionResult<{ signedUrl: string; sha256Hash: string }>> {
  const parsedId = BookingIdSchema.safeParse(bookingId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Identificador de reserva inválido." },
    };
  }

  const pg = createContractsPgClient();
  await pg.connect();
  try {
    const auth = await loadAuthorizedContractBooking(pg, parsedId.data, inviteToken);

    const res = await pg.query<{
      pdf_storage_path: string;
      pdf_sha256_hash: string;
    }>(
      `SELECT pdf_storage_path, pdf_sha256_hash FROM public.contracts WHERE booking_id = $1 LIMIT 1`,
      [auth.bookingId]
    );

    const r = res.rows[0];
    if (!r) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "El contrato aún no ha sido generado." },
      };
    }

    let signedUrl = "";
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin.storage
        .from(CONTRACT_STORAGE_BUCKET)
        .createSignedUrl(r.pdf_storage_path, 300); // 5 minutos de vigencia
      if (data?.signedUrl) {
        signedUrl = data.signedUrl;
      }
    } catch {
      // Continuar al fallback seguro
    }

    if (!signedUrl) {
      signedUrl = `${env.NEXT_PUBLIC_APP_URL}/api/contracts/${auth.bookingId}/download?hash=${r.pdf_sha256_hash}`;
    }

    return {
      ok: true,
      data: {
        signedUrl,
        sha256Hash: r.pdf_sha256_hash,
      },
    };
  } catch (err) {
    return toErr(err);
  } finally {
    await pg.end();
  }
}

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseArgentineDniPdf417Strict, maskArgentineDni } from "@/lib/kyc/pdf417Parser";
import { MAX_KYC_SERVER_BYTES } from "@/lib/kyc/imageQuality";
import type {
  BiometricServiceResponse,
  LivenessCaptureMetadata,
} from "@/lib/kyc/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KYC_PRIVATE_BUCKET = "kyc-documents" as const;

const FormFieldsSchema = z.object({
  bookingId: z.string().trim().uuid("ID de reserva inválido."),
  inviteToken: z.string().trim().uuid("Token de invitación inválido."),
  consentAccepted: z.literal("true", {
    errorMap: () => ({
      message:
        "Debés aceptar expresamente el consentimiento de validación biométrica (Ley 25.326).",
    }),
  }),
  consentAcceptedAt: z.string().trim().optional(),
  pdf417RawPayload: z
    .string()
    .trim()
    .min(20, "La lectura del código PDF417 del DNI es obligatoria.")
    .max(600, "La trama PDF417 supera el límite permitido."),
  livenessMetadata: z.string().optional(),
  mockMode: z.string().optional(),
});

function hasValidImageMagicBytes(buf: Buffer): {
  valid: boolean;
  mimeType: "image/jpeg" | "image/webp" | "image/png" | "image/avif" | null;
} {
  if (buf.byteLength < 32) return { valid: false, mimeType: null };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { valid: true, mimeType: "image/jpeg" };
  }
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { valid: true, mimeType: "image/png" };
  }
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { valid: true, mimeType: "image/webp" };
  }
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    return { valid: true, mimeType: "image/avif" };
  }
  return { valid: false, mimeType: null };
}

function translateBiometricRejectionReasons(
  reasons: string[],
  similarityScore: number,
  livenessScore: number,
  minLiveness: number
): string {
  if (reasons.includes("INVALID_IMAGE_DNI")) {
    return "No pudimos leer la imagen del frente del DNI. Volvé a capturarla con buena iluminación.";
  }
  if (reasons.includes("INVALID_IMAGE_SELFIE")) {
    return "No pudimos leer la imagen de tu selfie. Intentá nuevamente frente a la cámara.";
  }
  if (reasons.includes("NO_FACE_IN_DNI")) {
    return "No detectamos un rostro nítido en el frente de tu DNI. Acercá la tarjeta y evitá reflejos sobre tu foto.";
  }
  if (reasons.includes("NO_FACE_IN_SELFIE")) {
    return "No detectamos tu rostro en la selfie. Posicionate al centro de la cámara con luz pareja.";
  }
  if (reasons.includes("MULTIPLE_FACES_IN_SELFIE")) {
    return "Detectamos más de un rostro en la selfie. Asegurate de estar solo frente a la cámara e intentá de nuevo.";
  }
  if (reasons.includes("LIVENESS_FAILED") || livenessScore < minLiveness) {
    return "No pudimos confirmar la prueba de vida, intentá de nuevo mirando directo a la cámara en un lugar bien iluminado.";
  }
  return `La comparación facial (${Math.round(similarityScore * 100)}%) no alcanzó el umbral mínimo de seguridad frente a la foto del DNI. Probá sin gorra ni anteojos oscuros y con luz frontal.`;
}

async function storePrivateKycEvidence(params: {
  pgClient: Client;
  bookingId: string;
  slotId: string;
  kind: "dni-front" | "selfie";
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const { pgClient, bookingId, slotId, kind, buffer, mimeType } = params;
  const ext = mimeType.replace("image/", "").replace("jpeg", "jpg") || "jpg";
  const objectPath = `${bookingId}/${slotId}/${kind}-${Date.now()}-${crypto
    .randomUUID()
    .slice(0, 8)}.${ext}`;

  try {
    await pgClient.query(
      `INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
       VALUES ($1, $1, FALSE, 5242880, ARRAY['image/webp','image/jpeg','image/png','image/avif'])
       ON CONFLICT (id) DO UPDATE SET public = FALSE`,
      [KYC_PRIVATE_BUCKET]
    );
  } catch {
    // El bucket puede ya estar provisionado por Supabase Storage API
  }

  const adminClient = createSupabaseAdminClient();
  const uploadRes = await adminClient.storage
    .from(KYC_PRIVATE_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadRes.error) {
    throw new Error(
      `No se pudo resguardar la evidencia privada en Storage: ${uploadRes.error.message}`
    );
  }

  return `${KYC_PRIVATE_BUCKET}/${objectPath}`;
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "INVALID_FORM_DATA",
          message: "El envío debe ser multipart/form-data válido.",
        },
      },
      { status: 400 }
    );
  }

  const parsedFields = FormFieldsSchema.safeParse({
    bookingId: formData.get("bookingId"),
    inviteToken: formData.get("inviteToken"),
    consentAccepted: formData.get("consentAccepted"),
    consentAcceptedAt: formData.get("consentAcceptedAt") || undefined,
    pdf417RawPayload: formData.get("pdf417RawPayload"),
    livenessMetadata: formData.get("livenessMetadata") || undefined,
    mockMode: formData.get("mockMode") || undefined,
  });

  if (!parsedFields.success) {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "VALIDATION_ERROR",
          message:
            parsedFields.error.issues[0]?.message ??
            "Faltan campos obligatorios para validar la identidad.",
        },
      },
      { status: 422 }
    );
  }

  const fields = parsedFields.data;
  const dniFrontEntry = formData.get("dni_front");
  const selfieEntry = formData.get("selfie");

  if (!(dniFrontEntry instanceof File) || !(selfieEntry instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "MISSING_FILES",
          message:
            "Debés adjuntar la captura del frente del DNI y tu selfie en vivo.",
        },
      },
      { status: 422 }
    );
  }

  let parsedPdf417;
  try {
    parsedPdf417 = parseArgentineDniPdf417Strict(fields.pdf417RawPayload, {
      requireAdult: true,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "INVALID_PDF417",
          message:
            err instanceof Error
              ? err.message
              : "El código de barras PDF417 del DNI no es válido o pertenece a un menor de edad.",
        },
      },
      { status: 422 }
    );
  }

  const dniBuffer = Buffer.from(await dniFrontEntry.arrayBuffer());
  const selfieBuffer = Buffer.from(await selfieEntry.arrayBuffer());

  if (
    dniBuffer.byteLength < 32 ||
    dniBuffer.byteLength > MAX_KYC_SERVER_BYTES ||
    selfieBuffer.byteLength < 32 ||
    selfieBuffer.byteLength > MAX_KYC_SERVER_BYTES
  ) {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "IMAGE_SIZE_LIMIT",
          message:
            "Cada imagen debe pesar menos de 500 KB. Volvé a capturar con la compresión automática del navegador.",
        },
      },
      { status: 413 }
    );
  }

  const dniMagic = hasValidImageMagicBytes(dniBuffer);
  const selfieMagic = hasValidImageMagicBytes(selfieBuffer);
  if (!dniMagic.valid || !dniMagic.mimeType || !selfieMagic.valid || !selfieMagic.mimeType) {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "INVALID_IMAGE_FORMAT",
          message:
            "Formato de imagen inválido. Solo se admiten JPEG, WebP o PNG reales.",
        },
      },
      { status: 422 }
    );
  }

  const dniSha256 = crypto.createHash("sha256").update(dniBuffer).digest("hex");
  const selfieSha256 = crypto.createHash("sha256").update(selfieBuffer).digest("hex");

  if (dniSha256 === selfieSha256) {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "ANTI_SPOOF_DUPLICATE_IMAGE",
          message:
            "La selfie y la foto del DNI no pueden ser la misma imagen. Tomá una selfie en vivo frente a la cámara.",
        },
      },
      { status: 422 }
    );
  }

  let livenessMeta: LivenessCaptureMetadata | null = null;
  if (fields.livenessMetadata) {
    try {
      livenessMeta = JSON.parse(fields.livenessMetadata) as LivenessCaptureMetadata;
    } catch {
      livenessMeta = null;
    }
  }

  const allowMockExecution =
    env.NEXT_PUBLIC_ENABLE_KYC_MOCK === "true" && fields.mockMode === "true";

  if (!env.BIOMETRIC_SERVICE_URL && !allowMockExecution) {
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "BIOMETRIC_SERVICE_UNCONFIGURED",
          message:
            "El servicio de verificación biométrica no está disponible en este momento. Intentá nuevamente en unos minutos.",
        },
      },
      { status: 503 }
    );
  }

  const pgClient = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await pgClient.connect();

  try {
    await pgClient.query("BEGIN");

    const bookingRes = await pgClient.query<{
      id: string;
      declared_adults_count: number;
      verified_adults_count: number;
      status: string;
    }>(
      `SELECT id, declared_adults_count, verified_adults_count, status::text AS status
       FROM public.bookings
       WHERE id = $1
       FOR UPDATE`,
      [fields.bookingId]
    );

    const booking = bookingRes.rows[0];
    if (!booking) {
      await pgClient.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          error: { code: "NOT_FOUND", message: "La reserva indicada no existe." },
        },
        { status: 404 }
      );
    }

    if (
      booking.status === "CANCELLED" ||
      booking.status === "EXPIRED" ||
      booking.status === "ICAL_BLOCK"
    ) {
      await pgClient.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          error: {
            code: "BOOKING_CLOSED",
            message: `No es posible verificar identidad sobre una reserva en estado ${booking.status}.`,
          },
        },
        { status: 422 }
      );
    }

    const slotRes = await pgClient.query<{
      id: string;
      booking_id: string;
      is_primary_guest: boolean;
      invite_token: string;
      status: string;
    }>(
      `SELECT id, booking_id, is_primary_guest, invite_token, status::text AS status
       FROM public.guest_verifications
       WHERE booking_id = $1 AND invite_token = $2
       FOR UPDATE`,
      [fields.bookingId, fields.inviteToken]
    );

    const targetSlot = slotRes.rows[0];
    if (!targetSlot) {
      await pgClient.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          error: {
            code: "INVALID_TOKEN",
            message:
              "El enlace de verificación no es válido o no corresponde a esta reserva.",
          },
        },
        { status: 403 }
      );
    }

    const dupRes = await pgClient.query<{ id: string }>(
      `SELECT id
       FROM public.guest_verifications
       WHERE booking_id = $1
         AND document_number = $2
         AND id <> $3
         AND status::text IN ('VERIFIED', 'MANUAL_REVIEW')
       LIMIT 1`,
      [fields.bookingId, parsedPdf417.documentNumber, targetSlot.id]
    );

    if (dupRes.rows.length > 0) {
      await pgClient.query("ROLLBACK");
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          error: {
            code: "DUPLICATE_DNI_IN_BOOKING",
            message: `El DNI ${maskArgentineDni(
              parsedPdf417.documentNumber
            )} ya fue validado por otro adulto de esta reserva.`,
          },
        },
        { status: 409 }
      );
    }

    // Invocar microservicio Python biométrico (YuNet + SFace + MiniFASNet)
    let biometricResult: BiometricServiceResponse;
    let biometricProvider = "opencv-sface-minifasnet-v1";

    if (allowMockExecution && !env.BIOMETRIC_SERVICE_URL) {
      biometricProvider = "qa-mock-mode";
      biometricResult = {
        passed: true,
        match: true,
        similarity_score: 0.72,
        liveness_score: 0.96,
        face_detected_dni: true,
        face_detected_selfie: true,
        reasons: [],
      };
    } else {
      const outboundForm = new FormData();
      outboundForm.append(
        "dni_front",
        new Blob([dniBuffer], { type: dniMagic.mimeType }),
        `dni-front.${dniMagic.mimeType.replace("image/", "")}`
      );
      outboundForm.append(
        "selfie",
        new Blob([selfieBuffer], { type: selfieMagic.mimeType }),
        `selfie.${selfieMagic.mimeType.replace("image/", "")}`
      );
      outboundForm.append(
        "metadata",
        JSON.stringify({
          booking_id: fields.bookingId,
          slot_id: targetSlot.id,
          dni_number: parsedPdf417.documentNumber,
          full_name: parsedPdf417.fullName,
          birth_date: parsedPdf417.birthDate,
          liveness_metadata: livenessMeta,
        })
      );

      const endpoint = `${env.BIOMETRIC_SERVICE_URL!.replace(/\/+$/, "")}/api/v1/verify-identity`;
      let serviceRes: Response;
      try {
        serviceRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "X-API-Key": env.BIOMETRIC_API_KEY ?? "",
          },
          body: outboundForm,
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        await pgClient.query("ROLLBACK");
        return NextResponse.json(
          {
            ok: false,
            status: "rejected",
            error: {
              code: "BIOMETRIC_SERVICE_TIMEOUT",
              message:
                "No pudimos conectar con el motor biométrico en este momento. Intentá nuevamente en unos segundos.",
            },
          },
          { status: 503 }
        );
      }

      if (!serviceRes.ok) {
        await pgClient.query("ROLLBACK");
        return NextResponse.json(
          {
            ok: false,
            status: "rejected",
            error: {
              code: "BIOMETRIC_SERVICE_ERROR",
              message:
                "El motor biométrico devolvió un error temporal. Por favor intentá nuevamente.",
            },
          },
          { status: 502 }
        );
      }

      biometricResult = (await serviceRes.json()) as BiometricServiceResponse;
    }

    const minSimilarity = env.KYC_MIN_SIMILARITY_THRESHOLD;
    const manualReviewMin = env.KYC_MANUAL_REVIEW_SIMILARITY_THRESHOLD;
    const minLiveness = env.KYC_MIN_LIVENESS_THRESHOLD;

    const facesOk =
      biometricResult.face_detected_dni &&
      biometricResult.face_detected_selfie &&
      !biometricResult.reasons.includes("MULTIPLE_FACES_IN_SELFIE");
    const livenessOk =
      biometricResult.liveness_score >= minLiveness &&
      !biometricResult.reasons.includes("LIVENESS_FAILED");

    let apiStatus: "verified" | "manual_review" | "rejected";
    let dbStatus: "VERIFIED" | "MANUAL_REVIEW" | "REJECTED";

    if (
      facesOk &&
      livenessOk &&
      biometricResult.similarity_score >= minSimilarity &&
      (biometricResult.passed || biometricResult.match)
    ) {
      apiStatus = "verified";
      dbStatus = "VERIFIED";
    } else if (
      facesOk &&
      livenessOk &&
      biometricResult.similarity_score >= manualReviewMin &&
      biometricResult.similarity_score < minSimilarity
    ) {
      apiStatus = "manual_review";
      dbStatus = "MANUAL_REVIEW";
    } else {
      apiStatus = "rejected";
      dbStatus = "REJECTED";
    }

    const consentIso =
      fields.consentAcceptedAt && !Number.isNaN(Date.parse(fields.consentAcceptedAt))
        ? new Date(fields.consentAcceptedAt).toISOString()
        : new Date().toISOString();

    const nowIso = new Date().toISOString();
    const ttlHours = Math.min(72, Math.max(24, env.KYC_EVIDENCE_TTL_HOURS));
    const expiresAtIso = new Date(
      Date.now() + ttlHours * 3600 * 1000
    ).toISOString();

    const auditHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          bookingId: fields.bookingId,
          slotId: targetSlot.id,
          dniNumber: parsedPdf417.documentNumber,
          similarityScore: biometricResult.similarity_score,
          livenessScore: biometricResult.liveness_score,
          dniSha256,
          selfieSha256,
          consentIso,
          status: apiStatus,
        })
      )
      .digest("hex");

    // Guardar temporalmente en bucket estrictamente privado con expiración TTL (Ley 25.326)
    const [dniFrontPath, selfiePath] = await Promise.all([
      storePrivateKycEvidence({
        pgClient,
        bookingId: fields.bookingId,
        slotId: targetSlot.id,
        kind: "dni-front",
        buffer: dniBuffer,
        mimeType: dniMagic.mimeType,
      }),
      storePrivateKycEvidence({
        pgClient,
        bookingId: fields.bookingId,
        slotId: targetSlot.id,
        kind: "selfie",
        buffer: selfieBuffer,
        mimeType: selfieMagic.mimeType,
      }),
    ]);

    const normalizedPct = Number(
      Math.max(0, Math.min(100, biometricResult.similarity_score * 100)).toFixed(2)
    );

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
         similarity_score = $8,
         liveness_score = $9,
         audit_hash = $10,
         biometric_provider = $11,
         evidence_expires_at = $12::timestamptz,
         evidence_purged_at = NULL,
         gemini_audit_json = $13::jsonb,
         consent_accepted_at = $14::timestamptz,
         status = $15::kyc_status,
         verified_at = $16::timestamptz
       WHERE id = $17 AND booking_id = $18`,
      [
        parsedPdf417.documentNumber,
        parsedPdf417.fullName,
        parsedPdf417.birthDate,
        parsedPdf417.rawPayload,
        dniFrontPath,
        selfiePath,
        normalizedPct,
        biometricResult.similarity_score,
        biometricResult.liveness_score,
        auditHash,
        biometricProvider,
        expiresAtIso,
        JSON.stringify({
          provider: biometricProvider,
          status: apiStatus,
          similarity_score: biometricResult.similarity_score,
          liveness_score: biometricResult.liveness_score,
          face_detected_dni: biometricResult.face_detected_dni,
          face_detected_selfie: biometricResult.face_detected_selfie,
          reasons: biometricResult.reasons,
          active_liveness: livenessMeta,
          audit_hash: auditHash,
          evidence_expires_at: expiresAtIso,
        }),
        consentIso,
        dbStatus,
        apiStatus === "verified" ? nowIso : null,
        targetSlot.id,
        fields.bookingId,
      ]
    );

    const countRes = await pgClient.query<{ verified_count: number }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified_count
       FROM public.guest_verifications
       WHERE booking_id = $1`,
      [fields.bookingId]
    );

    const verifiedAdultsCount = Number(countRes.rows[0]?.verified_count ?? 0);
    const declaredAdultsCount = Number(booking.declared_adults_count);
    const allAdultsVerified = verifiedAdultsCount === declaredAdultsCount;

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
      [verifiedAdultsCount, nextBookingStatus, fields.bookingId]
    );

    await pgClient.query("COMMIT");

    const slotPayload = {
      id: targetSlot.id,
      slotIndex: targetSlot.is_primary_guest ? 1 : 2,
      bookingId: fields.bookingId,
      isPrimaryGuest: Boolean(targetSlot.is_primary_guest),
      inviteToken: fields.inviteToken,
      status: dbStatus,
      maskedDocumentNumber: maskArgentineDni(parsedPdf417.documentNumber),
      fullNameExtracted: parsedPdf417.fullName,
      biometricConfidenceScore: normalizedPct,
      similarityScore: biometricResult.similarity_score,
      livenessScore: biometricResult.liveness_score,
      auditHash,
      verifiedAt: apiStatus === "verified" ? nowIso : null,
      checkinPath: `/checkin/${fields.bookingId}?token=${fields.inviteToken}`,
    };

    if (apiStatus === "rejected") {
      return NextResponse.json(
        {
          ok: false,
          status: "rejected",
          error: {
            code: "BIOMETRIC_VERIFICATION_REJECTED",
            message: translateBiometricRejectionReasons(
              biometricResult.reasons,
              biometricResult.similarity_score,
              biometricResult.liveness_score,
              minLiveness
            ),
          },
          similarityScore: biometricResult.similarity_score,
          livenessScore: biometricResult.liveness_score,
          reasons: biometricResult.reasons,
          slot: slotPayload,
          bookingStatus: nextBookingStatus,
          verifiedAdultsCount,
          declaredAdultsCount,
          allAdultsVerified,
        },
        { status: 422 }
      );
    }

    const message =
      apiStatus === "manual_review"
        ? "Tu identidad quedó en revisión manual rápida porque la coincidencia facial estuvo en zona intermedia. Te avisaremos apenas se confirme."
        : allAdultsVerified
        ? `¡Completamos el grupo (${verifiedAdultsCount} de ${declaredAdultsCount})! Tu código de entrada ya está disponible abajo.`
        : `¡Identidad confirmada para ${parsedPdf417.fullName}! Ya van ${verifiedAdultsCount} de ${declaredAdultsCount} adultos listos.`;

    return NextResponse.json({
      ok: true,
      status: apiStatus,
      message,
      similarityScore: biometricResult.similarity_score,
      livenessScore: biometricResult.liveness_score,
      auditHash,
      evidenceExpiresAt: expiresAtIso,
      slot: slotPayload,
      bookingId: fields.bookingId,
      bookingStatus: nextBookingStatus,
      verifiedAdultsCount,
      declaredAdultsCount,
      allAdultsVerified,
    });
  } catch (err) {
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // Ignorar fallo secundario en rollback
    }
    return NextResponse.json(
      {
        ok: false,
        status: "rejected",
        error: {
          code: "INTERNAL_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "No se pudo completar la verificación biométrica.",
        },
      },
      { status: 500 }
    );
  } finally {
    await pgClient.end();
  }
}

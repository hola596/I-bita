import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Module from "node:module";
import { Client } from "pg";

// Permitir que tsx cargue módulos marcados con `import "server-only"` en el runner CLI de verificación
const origLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load =
  function (request: string, ...rest: unknown[]) {
    if (request === "server-only") {
      return {};
    }
    return origLoad.call(this, request, ...rest);
  };

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

/**
 * Construye una imagen PNG válida en memoria con firma mágica `89 50 4E 47 0D 0A 1A 0A`
 * y contenido único determinista para las pruebas de verificación biométrica.
 */
function createValidPngDataUrl(seedLabel: string): string {
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61,
  ]);
  const payload = Buffer.from(`IBITA-KYC-EVIDENCE:${seedLabel}`, "utf8");
  const combined = Buffer.concat([pngHeader, payload]);
  return `data:image/png;base64,${combined.toString("base64")}`;
}

async function runVerifyStory32() {
  loadEnvLocal();
  const { env } = await import("../../src/env");
  const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
  const {
    parseArgentineDniPdf417,
    createZxingPdf417Hints,
  } = await import("../../src/modules/consortium/pdf417-parser");
  const { GeminiBiometricAuditSchema } = await import(
    "../../src/modules/consortium/gemini-kyc"
  );
  const {
    verifyGuestBiometricsAction,
    getBookingCheckinStateAction,
    resolveDemoOrBookingCheckinStateAction,
  } = await import("../../src/modules/consortium/actions");
  const { createBookingRequestAction } = await import(
    "../../src/modules/bookings/actions"
  );

  console.log(
    "=== [STORY 3.2 QA] Starting Mobile Pre-Check-in PDF417 (@zxing) & Gemini 2.5 Flash Verification ==="
  );

  // 1. Auditar fronteras `server-only`, uso real de `@zxing` y `@google/generative-ai`, y CERO `setTimeout`/mocks (Subtarea 3.2.5)
  const pdf417Src = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/consortium/pdf417-parser.ts"),
    "utf8"
  );
  const geminiKycSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/consortium/gemini-kyc.ts"),
    "utf8"
  );
  const consortiumActionsSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/consortium/actions.ts"),
    "utf8"
  );
  const checkinFlowSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/kyc/BiometricCheckinFlow.tsx"),
    "utf8"
  );

  if (
    !geminiKycSrc.includes('import "server-only"') ||
    !consortiumActionsSrc.includes('import "server-only"')
  ) {
    throw new Error(
      'Missing `import "server-only"` in gemini-kyc.ts or consortium/actions.ts!'
    );
  }

  if (
    !pdf417Src.includes('from "@zxing/library"') ||
    !pdf417Src.includes('from "@zxing/browser"') ||
    !pdf417Src.includes("PDF417Reader")
  ) {
    throw new Error(
      "src/modules/consortium/pdf417-parser.ts must integrate @zxing/library and @zxing/browser!"
    );
  }

  if (
    !geminiKycSrc.includes('from "@google/generative-ai"') ||
    !geminiKycSrc.includes("gemini-2.5-flash")
  ) {
    throw new Error(
      "src/modules/consortium/gemini-kyc.ts must integrate @google/generative-ai with gemini-2.5-flash!"
    );
  }

  if (
    pdf417Src.includes("setTimeout") ||
    geminiKycSrc.includes("setTimeout") ||
    consortiumActionsSrc.includes("setTimeout") ||
    checkinFlowSrc.includes("setTimeout")
  ) {
    throw new Error(
      "PROHIBITED: Found `setTimeout` in KYC modules! Zero fake simulations allowed."
    );
  }

  const hints = createZxingPdf417Hints();
  if (hints.size < 2) {
    throw new Error("createZxingPdf417Hints failed to configure @zxing hints.");
  }

  console.log(
    "[OK] 1/5 Security & Zero-Simulation audit passed -> `server-only`, `@zxing/library`, `@zxing/browser`, `@google/generative-ai` (`gemini-2.5-flash`) active and zero `setTimeout`."
  );

  // 2. Verificar parser determinista de trama PDF417 RENAPER y rechazo de menores de 18 años (Subtarea 3.2.1 & AC-1)
  const adult1Raw =
    "00548291034@GONZALEZ@VALENTINA SOFIA@F@38941205@A@14/06/1995@22/09/2022@207";
  const parsedAdult1 = parseArgentineDniPdf417(adult1Raw);

  if (
    parsedAdult1.documentNumber !== "38941205" ||
    parsedAdult1.lastName !== "GONZALEZ" ||
    parsedAdult1.firstName !== "VALENTINA SOFIA" ||
    parsedAdult1.fullName !== "VALENTINA SOFIA GONZALEZ" ||
    parsedAdult1.gender !== "F" ||
    parsedAdult1.birthDate !== "1995-06-14" ||
    parsedAdult1.issueDate !== "2022-09-22" ||
    parsedAdult1.tramiteNumber !== "00548291034" ||
    parsedAdult1.isAdult !== true ||
    parsedAdult1.ageYears < 18
  ) {
    throw new Error(
      `parseArgentineDniPdf417 mismatch on standard RENAPER payload: ${JSON.stringify(parsedAdult1)}`
    );
  }

  // Formato primera generación RENAPER (con `@` inicial)
  const legacyAdultRaw =
    "@36418920@B@1@FERNANDEZ@LUCAS MATIAS@ARGENTINA@08/11/1992@M@15/03/2021@00619482731";
  const parsedLegacy = parseArgentineDniPdf417(legacyAdultRaw);
  if (
    parsedLegacy.documentNumber !== "36418920" ||
    parsedLegacy.fullName !== "LUCAS MATIAS FERNANDEZ" ||
    parsedLegacy.birthDate !== "1992-11-08" ||
    parsedLegacy.isAdult !== true
  ) {
    throw new Error(
      `parseArgentineDniPdf417 mismatch on legacy RENAPER payload: ${JSON.stringify(parsedLegacy)}`
    );
  }

  // Rechazo de trama corrupta
  let corruptRejected = false;
  try {
    parseArgentineDniPdf417("TRAMA-CORRUPTA-SIN-FORMATO-RENAPER");
  } catch {
    corruptRejected = true;
  }
  if (!corruptRejected) {
    throw new Error(
      "parseArgentineDniPdf417 should have rejected corrupt non-RENAPER payload!"
    );
  }

  // Rechazo de menor de 18 años en slot de adulto
  let minorRejected = false;
  try {
    parseArgentineDniPdf417(
      "00912345678@PEREZ@TOMAS@M@54123456@A@10/05/2015@12/06/2023@201"
    );
  } catch {
    minorRejected = true;
  }
  if (!minorRejected) {
    throw new Error(
      "parseArgentineDniPdf417 should have rejected minor (< 18 years old) in adult slot!"
    );
  }

  console.log(
    "[OK] 2/5 AC-1 verified -> `parseArgentineDniPdf417` extracts RENAPER fields deterministically and rejects corrupt payloads & minors (< 18)."
  );

  // 3. Prueba de integración real en Supabase Cloud PostgreSQL (Subtareas 3.2.2, 3.2.3, AC-2 & AC-3)
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const testHostId = crypto.randomUUID();
  const testGuestId = crypto.randomUUID();
  const testPropertyId = crypto.randomUUID();
  const testSlug = `e3s2-kyc-${testPropertyId.slice(0, 8)}`;
  const secretPin = "PIN-ZERO-TRUST-E3S2-5519";
  const encryptedPin = encryptAccessCode(secretPin, testPropertyId);

  try {
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES
         ($1, $2, '{"full_name":"Host Story 3.2"}'::jsonb, NOW(), NOW()),
         ($3, $4, '{"full_name":"Guest Story 3.2"}'::jsonb, NOW(), NOW())`,
      [
        testHostId,
        `host-32-${testHostId}@i-bita.ar`,
        testGuestId,
        `guest-32-${testGuestId}@i-bita.ar`,
      ]
    );

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES ($1, $2, 'Host Story 3.2', 'HOST', '20-12345678-6', '0000003100012345678901')`,
      [testHostId, `host-32-${testHostId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES (
         $1, $2, $3, 'Torre Libertador · Pre-Check-in Biométrico E3-S2',
         'Departamento con validación biométrica obligatoria PDF417 + Gemini 2.5 Flash.',
         'CABA', 'Av. del Libertador 3100, Palermo Chico', 'Piso 11 A',
         3, 'USD', 90.00, 20.00, TRUE, TRUE, 500,
         $4, $5, $6, TRUE
       )`,
      [
        testPropertyId,
        testHostId,
        testSlug,
        encryptedPin.ciphertext,
        encryptedPin.iv,
        encryptedPin.authTag,
      ]
    );

    await client.query(
      `INSERT INTO public.consortium_configs (
         property_id, consortium_name, consortium_cuit, porteria_whatsapp, admin_email, micro_canon_pct, active
       ) VALUES ($1, 'Consorcio Av. del Libertador 3100', '30-71234567-1', '+5491144556677', 'admin@libertador3100.com.ar', 1.50, TRUE)`,
      [testPropertyId]
    );

    // Crear reserva con 2 adultos declarados
    const bookingRes = await createBookingRequestAction({
      propertyId: testPropertyId,
      checkIn: "2027-11-05",
      checkOut: "2027-11-10",
      declaredAdultsCount: 2,
      paymentCurrency: "ARS",
      guestId: testGuestId,
    });

    if (!bookingRes.ok) {
      throw new Error(
        `Failed to create booking for Story 3.2 test: ${JSON.stringify(bookingRes.error)}`
      );
    }

    const { booking, guestVerifications } = bookingRes.data;
    const slot1 = guestVerifications[0]!;
    const slot2 = guestVerifications[1]!;

    // Verificar estado inicial en /checkin/[bookingId] y ausencia absoluta de `access_code_*`
    const initialCheckinState = await getBookingCheckinStateAction(
      booking.id,
      slot1.inviteToken
    );
    if (!initialCheckinState.ok) {
      throw new Error(
        `getBookingCheckinStateAction failed: ${JSON.stringify(initialCheckinState.error)}`
      );
    }

    const serializedState = JSON.stringify(initialCheckinState.data);
    if (
      serializedState.includes(secretPin) ||
      serializedState.includes(encryptedPin.ciphertext) ||
      serializedState.includes("access_code_")
    ) {
      throw new Error(
        "CRITICAL: getBookingCheckinStateAction leaked access_code_* data!"
      );
    }

    if (
      initialCheckinState.data.booking.verifiedAdultsCount !== 0 ||
      initialCheckinState.data.booking.declaredAdultsCount !== 2 ||
      initialCheckinState.data.booking.allAdultsVerified !== false ||
      initialCheckinState.data.booking.accessCodeLocked !== true
    ) {
      throw new Error(
        `Unexpected initial check-in state: ${serializedState}`
      );
    }

    // 3a. Verificar que anti-spoofing rechace si se envía el mismo buffer para Frente DNI y Selfie
    const duplicatedImage = createValidPngDataUrl("same-image-spoof");
    const spoofRes = await verifyGuestBiometricsAction({
      bookingId: booking.id,
      inviteToken: slot1.inviteToken,
      consentAccepted: true,
      pdf417RawPayload: adult1Raw,
      dniFrontBase64: duplicatedImage,
      dniFrontMimeType: "image/png",
      selfieBase64: duplicatedImage,
      selfieMimeType: "image/png",
    });

    if (spoofRes.ok) {
      throw new Error(
        "verifyGuestBiometricsAction should have rejected identical DNI Front and Selfie buffers (anti-spoofing)!"
      );
    }

    // 3b. Verificar Adulto #1 (Titular) con PDF417 RENAPER + imágenes diferenciadas + Gemini 2.5 Flash
    const verify1Res = await verifyGuestBiometricsAction({
      bookingId: booking.id,
      inviteToken: slot1.inviteToken,
      consentAccepted: true,
      pdf417RawPayload: adult1Raw,
      dniFrontBase64: createValidPngDataUrl(`dni-front-${slot1.id}`),
      dniFrontMimeType: "image/png",
      selfieBase64: createValidPngDataUrl(`selfie-live-${slot1.id}`),
      selfieMimeType: "image/png",
    });

    if (!verify1Res.ok) {
      throw new Error(
        `verifyGuestBiometricsAction failed for Adult #1: ${JSON.stringify(verify1Res.error)}`
      );
    }

    // Con 1/2 adultos verificados, la reserva NO debe pasar aún a ALL_ADULTS_VERIFIED (AC-3)
    if (
      verify1Res.data.verifiedAdultsCount !== 1 ||
      verify1Res.data.declaredAdultsCount !== 2 ||
      verify1Res.data.allAdultsVerified !== false ||
      verify1Res.data.bookingStatus === "ALL_ADULTS_VERIFIED" ||
      verify1Res.data.slot.status !== "VERIFIED" ||
      verify1Res.data.slot.maskedDocumentNumber !== "•••.•••.205"
    ) {
      throw new Error(
        `Partial verification (1/2) state mismatch: ${JSON.stringify(verify1Res.data)}`
      );
    }

    console.log(
      `[OK] 3/5 Adult #1 verified (1/2) -> slot.status="VERIFIED", confidence=${verify1Res.data.auditSummary.confidenceScore}%, bookingStatus="${verify1Res.data.bookingStatus}" (Zero-Trust Gate remains locked at 1/2).`
    );

    // 4. Verificar que el Adulto #2 no pueda reutilizar el mismo DNI del Adulto #1
    const duplicateDniAttempt = await verifyGuestBiometricsAction({
      bookingId: booking.id,
      inviteToken: slot2.inviteToken,
      consentAccepted: true,
      pdf417RawPayload: adult1Raw, // mismo DNI 38941205
      dniFrontBase64: createValidPngDataUrl(`dni-front-${slot2.id}`),
      dniFrontMimeType: "image/png",
      selfieBase64: createValidPngDataUrl(`selfie-live-${slot2.id}`),
      selfieMimeType: "image/png",
    });

    if (
      duplicateDniAttempt.ok ||
      duplicateDniAttempt.error.code !== "VALIDATION_ERROR"
    ) {
      throw new Error(
        "verifyGuestBiometricsAction should have rejected duplicate DNI across different adult slots in the same booking!"
      );
    }

    // 5. Verificar Adulto #2 (Acompañante) y comprobar la transición atómica a `ALL_ADULTS_VERIFIED` (2/2)
    const adult2Raw =
      "00619482731@FERNANDEZ@LUCAS MATIAS@M@36418920@B@08/11/1992@15/03/2021@209";
    const verify2Res = await verifyGuestBiometricsAction({
      bookingId: booking.id,
      inviteToken: slot2.inviteToken,
      consentAccepted: true,
      pdf417RawPayload: adult2Raw,
      dniFrontBase64: createValidPngDataUrl(`dni-front-${slot2.id}`),
      dniFrontMimeType: "image/png",
      selfieBase64: createValidPngDataUrl(`selfie-live-${slot2.id}`),
      selfieMimeType: "image/png",
    });

    if (!verify2Res.ok) {
      throw new Error(
        `verifyGuestBiometricsAction failed for Adult #2: ${JSON.stringify(verify2Res.error)}`
      );
    }

    if (
      verify2Res.data.verifiedAdultsCount !== 2 ||
      verify2Res.data.declaredAdultsCount !== 2 ||
      verify2Res.data.allAdultsVerified !== true ||
      verify2Res.data.bookingStatus !== "ALL_ADULTS_VERIFIED"
    ) {
      throw new Error(
        `Expected atomic transition to ALL_ADULTS_VERIFIED on 2/2 adults, got: ${JSON.stringify(verify2Res.data)}`
      );
    }

    // Comprobar físicamente en PostgreSQL los registros en `public.guest_verifications`, `public.bookings` y `storage.buckets`
    const dbCheck = await client.query<{
      status: string;
      dni_front_storage_path: string;
      selfie_storage_path: string;
      biometric_confidence_score: string;
      gemini_audit_json: unknown;
      consent_accepted_at: Date | null;
    }>(
      `SELECT
         status::text AS status,
         dni_front_storage_path,
         selfie_storage_path,
         biometric_confidence_score::text AS biometric_confidence_score,
         gemini_audit_json,
         consent_accepted_at
       FROM public.guest_verifications
       WHERE booking_id = $1`,
      [booking.id]
    );

    if (dbCheck.rows.length !== 2) {
      throw new Error(`Expected 2 rows in guest_verifications, got ${dbCheck.rows.length}`);
    }

    for (const row of dbCheck.rows) {
      if (
        row.status !== "VERIFIED" ||
        !row.dni_front_storage_path.startsWith("kyc-documents/") ||
        !row.selfie_storage_path.startsWith("kyc-documents/") ||
        Number(row.biometric_confidence_score) < 85 ||
        !row.consent_accepted_at
      ) {
        throw new Error(
          `Database row in guest_verifications missing required KYC evidence fields: ${JSON.stringify(row)}`
        );
      }
      const parsedAudit = GeminiBiometricAuditSchema.safeParse(
        row.gemini_audit_json
      );
      if (!parsedAudit.success) {
        throw new Error(
          `Stored gemini_audit_json does not match GeminiBiometricAuditSchema: ${JSON.stringify(parsedAudit.error.issues)}`
        );
      }
    }

    const bucketRes = await client.query<{ public: boolean }>(
      `SELECT public FROM storage.buckets WHERE id = 'kyc-documents' LIMIT 1`
    );
    if (bucketRes.rows[0] && bucketRes.rows[0].public !== false) {
      throw new Error("CRITICAL: Bucket `kyc-documents` must have public = FALSE!");
    }

    // Verificar que la ruta de prueba interactiva `/checkin/demo` resuelva correctamente
    const demoState = await resolveDemoOrBookingCheckinStateAction("demo");
    if (!demoState.ok) {
      throw new Error(
        `resolveDemoOrBookingCheckinStateAction("demo") failed: ${JSON.stringify(demoState.error)}`
      );
    }

    console.log(
      "[OK] 4/5 AC-2 verified -> Private storage paths (`kyc-documents/`, `public: false`), Ley 25.326 consent timestamp & `GeminiBiometricAuditSchema` JSON persisted in PostgreSQL."
    );
    console.log(
      `[OK] 5/5 AC-3 verified -> Adult #2 verified (2/2) -> Atomic transition to booking.status="${verify2Res.data.bookingStatus}" and /checkin/demo ready for browser testing.`
    );
    console.log(
      "=== [PASS] STORY 3.2 VERIFIED: Mobile Pre-Check-in PDF417 (@zxing) & Gemini 2.5 Flash Audit OK ==="
    );
  } finally {
    await client.query("DELETE FROM public.bookings WHERE property_id = $1", [
      testPropertyId,
    ]);
    await client.query(
      "DELETE FROM public.consortium_configs WHERE property_id = $1",
      [testPropertyId]
    );
    await client.query("DELETE FROM public.properties WHERE id = $1", [
      testPropertyId,
    ]);
    await client.query("DELETE FROM auth.users WHERE id IN ($1, $2)", [
      testHostId,
      testGuestId,
    ]);
    await client.end();
  }
}

runVerifyStory32().catch((err) => {
  console.error("=== [FAIL] STORY 3.2 VERIFICATION FAILED ===", err);
  process.exit(1);
});

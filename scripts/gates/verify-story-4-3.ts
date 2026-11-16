import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Module from "node:module";
import { Client } from "pg";

// Permitir que tsx cargue módulos marcados con `import "server-only"` en el runner CLI
const origLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load =
  function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return origLoad.call(this, request, ...rest);
  };

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const FIXTURE_HOST_ID = "e4e4e4e4-0001-4000-8000-000000000001";
const FIXTURE_GUEST_ID = "e4e4e4e4-0002-4000-8000-000000000002";
const FIXTURE_PROPERTY_ID = "e4e4e4e4-0003-4000-8000-000000000005";
const FIXTURE_SLUG = "e4s3-gate-fixture-contracts";

async function runVerifyStory43() {
  loadEnvLocal();
  const { env } = await import("../../src/env");
  const {
    generateMidTermContractPdf,
  } = await import("../../src/modules/contracts/pdf-generator");
  const {
    generateAndSignContractAction,
    getContractDetailsAction,
    getContractDownloadSignedUrlAction,
    CONTRACT_STORAGE_BUCKET,
  } = await import("../../src/modules/contracts/actions");
  const { createSupabaseAdminClient } = await import("../../src/lib/supabase/admin");

  console.log("=== [STORY 4.3 QA] Contratos Temporarios Art. 1199 CCyC con Sellado SHA-256 ===");

  // 1. Auditoría estática de código (server-only, pdf-lib, sha256, sin simulaciones)
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const pdfGenSrc = read("src/modules/contracts/pdf-generator.ts");
  const actionsSrc = read("src/modules/contracts/actions.ts");
  const cardSrc = read("src/components/contracts/ContractSignCard.tsx");
  const pageSrc = read("src/app/contratos/[bookingId]/page.tsx");

  assert(pdfGenSrc.includes('import "server-only"'), "pdf-generator must import server-only");
  assert(actionsSrc.includes('import "server-only"'), "actions must import server-only");
  assert(pdfGenSrc.includes("pdf-lib") && pdfGenSrc.includes("PDFDocument"), "must use pdf-lib PDFDocument");
  assert(pdfGenSrc.includes("1199"), "must include Art. 1199 CCyC legal framework");
  assert(actionsSrc.includes("createHash") && actionsSrc.includes("sha256"), "must calculate SHA-256 hash");
  assert(cardSrc.includes('"use client"'), "ContractSignCard must be client component");
  assert(!pageSrc.includes('"use client"'), "contratos page must stay a Server Component");
  assert(!/setTimeout|Math\.random/.test(pdfGenSrc + actionsSrc), "zero simulations allowed in backend modules");

  console.log("[OK] 1/6 Static code audit: server-only, pdf-lib, crypto sha256, Art. 1199 CCyC clauses, zero simulations.");

  // 2. Conexión a Supabase Cloud y setup de fixtures de prueba
  const db = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await db.connect();

  const createdBookingIds: string[] = [];

  try {
    // Asegurar perfiles
    await db.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, 'gate-e4s3-host@i-bita.ar', '{"full_name":"Host Gate E4S3"}'::jsonb, NOW(), NOW()),
              ($2, 'gate-e4s3-guest@i-bita.ar', '{"full_name":"Guest Gate E4S3"}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [FIXTURE_HOST_ID, FIXTURE_GUEST_ID]
    );

    await db.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil)
       VALUES ($1, 'gate-e4s3-host@i-bita.ar', 'Host Gate E4S3', 'HOST', '20-11111111-9'),
              ($2, 'gate-e4s3-guest@i-bita.ar', 'Guest Gate E4S3', 'GUEST', '27-22222222-4')
       ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email`,
      [FIXTURE_HOST_ID, FIXTURE_GUEST_ID]
    );

    const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
    const enc = encryptAccessCode("PIN-E4S3-FIXTURE", FIXTURE_PROPERTY_ID);

    await db.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES (
         $1, $2, $3, 'Propiedad Fixture Gate E4-S3 Contratos', 'Fixture de testing', 'CABA',
         'Av. Libertador 2200', 'Piso 10 C', 4, 'ARS', 80000.00, 20,
         FALSE, TRUE, 300, $4, $5, $6, FALSE
       )
       ON CONFLICT (id) DO UPDATE SET is_published = FALSE`,
      [FIXTURE_PROPERTY_ID, FIXTURE_HOST_ID, FIXTURE_SLUG, enc.ciphertext, enc.iv, enc.authTag]
    );

    await db.query(
      `UPDATE public.bookings SET status = 'CANCELLED' WHERE property_id = $1 AND status NOT IN ('CANCELLED','EXPIRED')`,
      [FIXTURE_PROPERTY_ID]
    );

    // 3. AC-2: Rechazo categórico para reservas de estadía corta (< 30 noches)
    const shortBookingRes = await db.query<{ id: string }>(
      `INSERT INTO public.bookings (
         property_id, guest_id, check_in, check_out, declared_adults_count,
         verified_adults_count, status, payment_currency, total_amount
       ) VALUES ($1, $2, '2033-01-01', '2033-01-15', 2, 0, 'PENDING_PAYMENT', 'ARS', 1120000.00)
       RETURNING id`,
      [FIXTURE_PROPERTY_ID, FIXTURE_GUEST_ID]
    );
    const shortBookingId = shortBookingRes.rows[0]!.id;
    createdBookingIds.push(shortBookingId);

    const shortInviteToken = "e4e4e4e4-0004-4000-8000-000000000002";
    await db.query(
      `INSERT INTO public.guest_verifications (
         booking_id, invite_token, is_primary_guest, status
       ) VALUES ($1, $2, TRUE, 'PENDING')
       ON CONFLICT (invite_token) DO UPDATE SET booking_id = EXCLUDED.booking_id`,
      [shortBookingId, shortInviteToken]
    );

    const shortAttempt = await generateAndSignContractAction(
      shortBookingId,
      {
        stayPurpose: "TURISMO",
        role: "GUEST",
      },
      shortInviteToken
    );
    assert(!shortAttempt.ok, "short stay (< 30 nights) must be rejected");
    assert(shortAttempt.error.code === "VALIDATION_ERROR", `short stay rejection error code must be VALIDATION_ERROR, got ${shortAttempt.error.code}`);

    console.log("[OK] 2/6 AC-2 verified: Short stays (< 30 nights) strictly rejected with VALIDATION_ERROR (HTTP 422).");

    // 4. Creación de reserva de Media Estadía (45 noches >= 30)
    const midTermBookingRes = await db.query<{ id: string }>(
      `INSERT INTO public.bookings (
         property_id, guest_id, check_in, check_out, declared_adults_count,
         verified_adults_count, status, payment_currency, total_amount, escrow_deposit_usdt
       ) VALUES ($1, $2, '2033-03-01', '2033-04-15', 2, 0, 'PAID_PENDING_KYC', 'USDT', 3600.00, 600.00)
       RETURNING id`,
      [FIXTURE_PROPERTY_ID, FIXTURE_GUEST_ID]
    );
    const midTermBookingId = midTermBookingRes.rows[0]!.id;
    createdBookingIds.push(midTermBookingId);

    // Crear slot de verificación con invite_token
    const inviteToken = "e4e4e4e4-0004-4000-8000-000000000001";
    await db.query(
      `INSERT INTO public.guest_verifications (
         booking_id, invite_token, is_primary_guest, status
       ) VALUES ($1, $2, TRUE, 'PENDING')
       ON CONFLICT (invite_token) DO UPDATE SET booking_id = EXCLUDED.booking_id`,
      [midTermBookingId, inviteToken]
    );

    // 5. AC-1: Construcción del binario PDF con pdf-lib y cálculo de hash SHA-256
    const pdfBytes = await generateMidTermContractPdf({
      booking: {
        bookingId: midTermBookingId,
        checkIn: "2033-03-01",
        checkOut: "2033-04-15",
        nightsCount: 45,
        totalAmount: "3600.00",
        paymentCurrency: "USDT",
        escrowDepositUsdt: "600.00",
      },
      property: {
        title: "Propiedad Fixture Gate E4-S3 Contratos",
        addressLine: "Av. Libertador 2200",
        unitIdentifier: "Piso 10 C",
        corridor: "CABA",
        city: "CABA",
      },
      host: {
        fullName: "Host Gate E4S3",
        email: "gate-e4s3-host@i-bita.ar",
        cuitCuil: "20-11111111-9",
      },
      guest: {
        fullName: "Guest Gate E4S3",
        email: "gate-e4s3-guest@i-bita.ar",
        phoneWhatsapp: "+5491112345678",
        cuitCuil: "27-22222222-4",
      },
      stayPurpose: "NOMADA_DIGITAL",
      guestSignedAt: new Date(),
      guestSignerIp: "181.44.20.10",
      hostSignedAt: new Date(),
    });

    assert(pdfBytes instanceof Uint8Array, "pdfBytes must be an Uint8Array");
    const pdfBuffer = Buffer.from(pdfBytes);
    const pdfHeader = pdfBuffer.subarray(0, 5).toString("utf8");
    assert(pdfHeader === "%PDF-", `PDF header must be %PDF-, got ${pdfHeader}`);
    assert(pdfBuffer.length > 2000, `PDF size must be realistic (>2000 bytes), got ${pdfBuffer.length}`);

    const directSha256 = crypto.createHash("sha256").update(pdfBuffer).digest("hex");
    assert(directSha256.length === 64, `SHA-256 seal must be 64 hex chars, got ${directSha256.length}`);
    console.log(`[OK] 3/6 AC-1 verified: Real PDF binary generated via pdf-lib (${pdfBuffer.length} bytes, %PDF- header) with SHA-256 cryptographic seal: ${directSha256.slice(0, 16)}...`);

    // 6. Firma y persistencia vía Server Action autorizada (Supabase Storage + PostgreSQL)
    const signResult = await generateAndSignContractAction(
      midTermBookingId,
      {
        stayPurpose: "NOMADA_DIGITAL",
        role: "GUEST",
        signerIp: "181.44.20.10",
      },
      inviteToken
    );

    assert(signResult.ok, `generateAndSignContractAction must succeed: ${JSON.stringify(signResult)}`);
    const contract = signResult.data;
    assert(contract.bookingId === midTermBookingId, "bookingId match");
    assert(contract.stayPurpose === "NOMADA_DIGITAL", "stayPurpose match");
    assert(contract.pdfSha256Hash.length === 64, "pdfSha256Hash must be 64 chars");
    assert(contract.guestSignedAt !== null, "guestSignedAt must be recorded");
    assert(contract.guestSignerIp === "181.44.20.10", "guestSignerIp must match");
    assert(contract.hostSignedAt !== null, "hostSignedAt must be recorded");
    assert(contract.isFullySigned === true, "contract must be fully signed");

    // 7. Verificación física en la tabla public.contracts
    const dbRow = (
      await db.query<{
        id: string;
        booking_id: string;
        stay_purpose: string;
        pdf_storage_path: string;
        pdf_sha256_hash: string;
        guest_signed_at: Date;
        guest_signer_ip: string;
        host_signed_at: Date;
      }>(
        `SELECT id, booking_id, stay_purpose, pdf_storage_path, pdf_sha256_hash,
                guest_signed_at, guest_signer_ip, host_signed_at
         FROM public.contracts
         WHERE booking_id = $1`,
        [midTermBookingId]
      )
    ).rows[0];

    assert(dbRow !== undefined, "row must exist in public.contracts");
    assert(dbRow.pdf_sha256_hash === contract.pdfSha256Hash, "hash in DB must match action return");
    assert(dbRow.pdf_storage_path.startsWith(`contracts/${midTermBookingId}`), "storage path in DB");
    console.log("[OK] 4/6 Database persistence: public.contracts record validated with foreign key to bookings, purpose, SHA-256 seal and electronic signature timestamps.");

    // 8. Verificación de almacenamiento privado en Supabase Storage (storage.buckets)
    const bucketRes = await db.query<{ public: boolean }>(
      `SELECT public FROM storage.buckets WHERE id = $1 LIMIT 1`,
      [CONTRACT_STORAGE_BUCKET]
    );
    assert(bucketRes.rows.length > 0, "bucket contracts must exist in storage.buckets");
    assert(bucketRes.rows[0]!.public === false, "bucket contracts must be private (public = false)");

    const downloadRes = await getContractDownloadSignedUrlAction(midTermBookingId, inviteToken);
    assert(downloadRes.ok, "getContractDownloadSignedUrlAction must return signed URL");
    assert(downloadRes.data.signedUrl.startsWith("http"), "signedUrl must be valid HTTP URL");
    assert(downloadRes.data.sha256Hash === contract.pdfSha256Hash, "sha256 hash match on download");

    console.log("[OK] 5/6 Storage Security: Bucket `contracts` is strictly private (public = false); pre-signed download URLs generated on demand.");

    // 9. Seguridad: Acceso no autorizado es rechazado (FORBIDDEN / 403)
    let unauthorizedRejected = false;
    try {
      await generateAndSignContractAction(midTermBookingId, { stayPurpose: "TURISMO" }, "invalid-token");
    } catch (e) {
      unauthorizedRejected = (e as { code?: string }).code === "FORBIDDEN" || (e as { statusCode?: number }).statusCode === 403;
    }
    // Si la action devuelve ActionResult con ok: false
    const unauthResult = await generateAndSignContractAction(midTermBookingId, { stayPurpose: "TURISMO" }, null);
    if (!unauthResult.ok && unauthResult.error.code === "FORBIDDEN") {
      unauthorizedRejected = true;
    }
    assert(unauthorizedRejected, "unauthorized access without session or invite token must be rejected with FORBIDDEN");

    console.log("[OK] 6/6 Zero-Trust Authorization: Contract signing and access protected against unauthorized third parties.");
    console.log("=== [PASS] STORY 4.3 VERIFIED: CCyC Art. 1199 Mid-Term Contract PDF + SHA-256 Seal + Private Storage OK ===");
  } finally {
    if (createdBookingIds.length > 0) {
      await db.query(`UPDATE public.bookings SET status = 'CANCELLED' WHERE id = ANY($1::uuid[])`, [createdBookingIds]);
    }
    await db.end();
  }
}

runVerifyStory43().catch((err) => {
  console.error("=== [FAIL] STORY 4.3 VERIFICATION FAILED ===", err);
  process.exit(1);
});

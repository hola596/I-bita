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

async function runGate() {
  loadEnvLocal();
  const { env } = await import("../../src/env");
  const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
  const { verifyPorteriaPassJws } = await import("../../src/lib/crypto/porteria-jws");
  const {
    getBookingAccessDetailsAction,
    issuePorteriaPassAction,
    verifyPorteriaPassTokenAction,
  } = await import("../../src/modules/consortium/actions");
  const { createBookingRequestAction } = await import("../../src/modules/bookings/actions");

  console.log("=== [GATE EPIC 3] Zero-Trust KYC + Pase Digital de Portería ===");

  // 0. Auditoría estática de fronteras server-only y librerías obligatorias
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const jwsSrc = read("src/lib/crypto/porteria-jws.ts");
  const actionsSrc = read("src/modules/consortium/actions.ts");
  assert(jwsSrc.includes('import "server-only"'), "porteria-jws.ts must import server-only");
  assert(actionsSrc.includes('import "server-only"'), "consortium/actions.ts must import server-only");
  assert(
    jwsSrc.includes('from "jose"') && jwsSrc.includes('from "qrcode"'),
    "porteria-jws.ts must use jose + qrcode"
  );
  assert(!/setTimeout|Math\.random/.test(jwsSrc), "no simulations allowed in porteria-jws.ts");
  const verifySrc = read("src/app/verify/[token]/page.tsx");
  assert(!verifySrc.includes("access_code") && !verifySrc.includes("accessCode"), "verify page must never touch the PIN");
  console.log("[OK] 0/6 server-only, jose, qrcode and no-PIN verifier page audited.");

  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const hostId = crypto.randomUUID();
  const guestId = crypto.randomUUID();
  const propertyId = crypto.randomUUID();
  const slug = `e3s3-gate-${propertyId.slice(0, 8)}`;
  const secretPin = "PIN-E3S3-GATE-7741";
  const enc = encryptAccessCode(secretPin, propertyId);

  try {
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, $2, '{"full_name":"Host E3S3"}'::jsonb, NOW(), NOW()),
              ($3, $4, '{"full_name":"Guest E3S3"}'::jsonb, NOW(), NOW())`,
      [hostId, `host-33-${hostId}@i-bita.ar`, guestId, `guest-33-${guestId}@i-bita.ar`]
    );
    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES ($1, $2, 'Host E3S3', 'HOST', '20-12345678-6', '0000003100012345678901')`,
      [hostId, `host-33-${hostId}@i-bita.ar`]
    );
    await client.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES ($1, $2, $3, 'Torre Gate E3-S3', 'Gate Epic 3', 'CABA',
         'Av. Gate 3300, Palermo', 'Piso 3 C', 3, 'USD', 80.00, 20.00, TRUE, TRUE, 300,
         $4, $5, $6, TRUE)`,
      [propertyId, hostId, slug, enc.ciphertext, enc.iv, enc.authTag]
    );
    await client.query(
      `INSERT INTO public.consortium_configs (
         property_id, consortium_name, consortium_cuit, porteria_whatsapp, admin_email, micro_canon_pct, active
       ) VALUES ($1, 'Consorcio Av. Gate 3300', '30-71234567-1', '+5491100000000', 'admin@gate3300.com.ar', 1.00, TRUE)`,
      [propertyId]
    );

    const bookingRes = await createBookingRequestAction({
      propertyId,
      checkIn: "2027-12-05",
      checkOut: "2027-12-10",
      declaredAdultsCount: 2,
      paymentCurrency: "ARS",
      guestId,
    });
    assert(bookingRes.ok, `createBookingRequestAction failed: ${JSON.stringify(!bookingRes.ok && bookingRes.error)}`);
    const { booking, guestVerifications } = bookingRes.data;
    const slot1 = guestVerifications[0]!;
    const slot2 = guestVerifications[1]!;

    // Autorización: sin sesión ni invite token → FORBIDDEN
    const noAuth = await getBookingAccessDetailsAction(booking.id);
    assert(!noAuth.ok && noAuth.error.code === "FORBIDDEN", "access without session/invite token must be FORBIDDEN");
    const wrongToken = await getBookingAccessDetailsAction(booking.id, crypto.randomUUID());
    assert(!wrongToken.ok && wrongToken.error.code === "FORBIDDEN", "wrong invite token must be FORBIDDEN");

    // Verificar adulto 1/2 directamente en BD (la biometría real se prueba en verify:3.2)
    await client.query(
      `UPDATE public.guest_verifications
       SET status = 'VERIFIED', document_number = '38941205',
           full_name_extracted = 'VALENTINA SOFIA GONZALEZ',
           biometric_confidence_score = 97.50, verified_at = NOW(), consent_accepted_at = NOW()
       WHERE id = $1`,
      [slot1.id]
    );
    await client.query(
      `UPDATE public.bookings SET verified_adults_count = 1, status = 'PAID_PENDING_KYC' WHERE id = $1`,
      [booking.id]
    );

    // AC-1: 1/2 → accessCode null, porteriaPass null, sin fuga
    const locked = await getBookingAccessDetailsAction(booking.id, slot1.inviteToken);
    assert(locked.ok, "locked state call must succeed");
    assert(
      locked.data.accessCode === null &&
        locked.data.porteriaPass === null &&
        locked.data.verifiedAdultsCount === 1 &&
        locked.data.declaredAdultsCount === 2,
      `1/2 must be locked: ${JSON.stringify(locked.data)}`
    );
    const lockedJson = JSON.stringify(locked.data);
    assert(
      !lockedJson.includes(secretPin) && !lockedJson.includes(enc.ciphertext),
      "locked response leaked PIN or ciphertext"
    );
    const lockedIssue = await issuePorteriaPassAction(booking.id, slot1.inviteToken);
    assert(
      !lockedIssue.ok && lockedIssue.error.code === "ZERO_TRUST_ACCESS_LOCKED",
      "issuePorteriaPassAction must be locked at 1/2"
    );
    const passRows1 = await client.query(`SELECT 1 FROM public.porteria_passes WHERE booking_id = $1`, [booking.id]);
    assert(passRows1.rowCount === 0, "no pass may be persisted at 1/2");
    console.log("[OK] 1/6 AC-1: 1/2 adults -> accessCode=null, porteriaPass=null, no leaks, no pass persisted.");

    // Estado inconsistente: reserva marcada ALL_ADULTS_VERIFIED pero 1 cupo sin verificar → sigue bloqueado
    await client.query(
      `UPDATE public.bookings SET verified_adults_count = 2, status = 'ALL_ADULTS_VERIFIED' WHERE id = $1`,
      [booking.id]
    );
    const tampered = await getBookingAccessDetailsAction(booking.id, slot1.inviteToken);
    assert(
      tampered.ok && tampered.data.accessCode === null && tampered.data.porteriaPass === null,
      "booking flag alone must not open the gate when a guest_verifications row is not VERIFIED"
    );
    console.log("[OK] 2/6 Gate cross-checks 100% of public.guest_verifications (inconsistent booking flag stays locked).");

    // Adulto 2/2
    await client.query(
      `UPDATE public.guest_verifications
       SET status = 'VERIFIED', document_number = '36418920',
           full_name_extracted = 'LUCAS MATIAS FERNANDEZ',
           biometric_confidence_score = 96.00, verified_at = NOW(), consent_accepted_at = NOW()
       WHERE id = $1`,
      [slot2.id]
    );

    // AC-2: 2/2 → PIN exacto + pase JWS/QR
    const open = await getBookingAccessDetailsAction(booking.id, slot2.inviteToken);
    assert(open.ok, `open state call failed: ${JSON.stringify(!open.ok && open.error)}`);
    assert(open.data.accessCode === secretPin, "AES-256-GCM decrypted PIN must match the original");
    assert(open.data.porteriaPass !== null, "porteriaPass must be issued at 2/2");
    const pass = open.data.porteriaPass;
    assert(pass.qrDataUrl.startsWith("data:image/png;base64,"), "QR must be a PNG data URL");

    const stored = await client.query<{ jws_token: string; revoked: boolean }>(
      `SELECT jws_token, revoked FROM public.porteria_passes WHERE booking_id = $1`,
      [booking.id]
    );
    assert(stored.rowCount === 1 && stored.rows[0]!.revoked === false, "pass must be persisted, not revoked");
    const jws = stored.rows[0]!.jws_token;

    const verifiedJws = await verifyPorteriaPassJws(jws);
    assert(verifiedJws.algorithm === "HS256", "JWS must be HS256");
    assert(
      verifiedJws.claims.bookingId === booking.id &&
        verifiedJws.claims.propertyId === propertyId &&
        verifiedJws.claims.verifiedGuests.length === 2,
      "JWS claims mismatch"
    );
    assert(!JSON.stringify(verifiedJws.claims).includes(secretPin), "JWS must never embed the PIN");
    assert(!jws.includes(secretPin), "JWS raw token must never contain the PIN");
    assert(
      pass.verificationUrl.endsWith(`/verify/${encodeURIComponent(jws)}`),
      "QR verification URL must point to /verify/[token]"
    );

    // Idempotencia: segunda consulta reutiliza el mismo pase
    const again = await getBookingAccessDetailsAction(booking.id, slot1.inviteToken);
    assert(again.ok && again.data.porteriaPass?.verificationUrl === pass.verificationUrl, "pass issuance must be idempotent");
    console.log("[OK] 3/6 AC-2: 2/2 adults -> exact PIN decrypted (AES-256-GCM), JWS(HS256)+QR issued, persisted & idempotent.");

    // AC-3: verificador de portería
    const okVerify = await verifyPorteriaPassTokenAction(jws);
    assert(okVerify.ok, `verifier rejected valid token: ${JSON.stringify(!okVerify.ok && okVerify.error)}`);
    assert(
      okVerify.data.unitIdentifier === "Piso 3 C" &&
        okVerify.data.verifiedGuests.every((g) => g.maskedDni.startsWith("•••.•••.")),
      "verifier must expose unit and masked DNIs"
    );
    const verifierJson = JSON.stringify(okVerify.data);
    assert(!verifierJson.includes("38941205") && !verifierJson.includes("36418920"), "verifier leaked a full DNI");
    assert(!verifierJson.includes(secretPin), "verifier leaked the PIN");

    const parts = jws.split(".");
    const sig = parts[2]!;
    const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
    const forged = await verifyPorteriaPassTokenAction(`${parts[0]}.${parts[1]}.${flipped}`);
    assert(!forged.ok && forged.error.code === "CRYPTO_INTEGRITY_ERROR", "forged signature must be rejected");
    console.log("[OK] 4/6 AC-3: verifier accepts valid JWS (masked DNIs, no PIN) and rejects forged signature.");

    // Revocación
    await client.query(`UPDATE public.porteria_passes SET revoked = TRUE WHERE booking_id = $1`, [booking.id]);
    const revokedVerify = await verifyPorteriaPassTokenAction(jws);
    assert(!revokedVerify.ok && revokedVerify.error.code === "ZERO_TRUST_ACCESS_LOCKED", "revoked pass must be rejected");
    const revokedAccess = await getBookingAccessDetailsAction(booking.id, slot1.inviteToken);
    assert(!revokedAccess.ok, "revoked pass must not be re-issued");
    console.log("[OK] 5/6 Revoked pass (`revoked = TRUE`) rejected by verifier and never re-issued.");

    console.log("[OK] 6/6 Zero leaks: PIN/ciphertext only ever returned after 100% verification.");
    console.log("[PASS] GATE EPIC 3 VERIFIED");
  } finally {
    await client.query("DELETE FROM public.bookings WHERE property_id = $1", [propertyId]);
    await client.query("DELETE FROM public.consortium_configs WHERE property_id = $1", [propertyId]);
    await client.query("DELETE FROM public.properties WHERE id = $1", [propertyId]);
    await client.query("DELETE FROM auth.users WHERE id IN ($1, $2)", [hostId, guestId]);
    await client.end();
  }
}

runGate().catch((err) => {
  console.error("[FAIL] GATE EPIC 3 FAILED", err);
  process.exit(1);
});

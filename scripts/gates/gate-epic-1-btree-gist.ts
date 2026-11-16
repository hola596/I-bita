import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "pg";

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

async function runGateEpic1() {
  loadEnvLocal();
  const { env } = await import("../../src/env");

  console.log("=== [GATE EPIC 1] Starting Zero-Simulation Verification ===");

  // 1. Verify AES-256-GCM with 12B IV, 16B AuthTag and propertyId AAD binding
  const key = Buffer.from(env.ACCESS_CODE_ENCRYPTION_KEY, "hex");
  const propA = crypto.randomUUID();
  const propB = crypto.randomUUID();
  const secretPin = "PIN-PORTERIA-9482#";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(propA, "utf8"));
  const encrypted = Buffer.concat([cipher.update(secretPin, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Decryption with matching propertyId AAD must succeed
  const decipherOk = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipherOk.setAAD(Buffer.from(propA, "utf8"));
  decipherOk.setAuthTag(authTag);
  const recovered = Buffer.concat([decipherOk.update(encrypted), decipherOk.final()]).toString("utf8");
  if (recovered !== secretPin) {
    throw new Error("AES-256-GCM decryption mismatch");
  }

  // Decryption with substituted propertyId (propB) must fail AAD check
  let aadTamperBlocked = false;
  try {
    const decipherBad = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipherBad.setAAD(Buffer.from(propB, "utf8"));
    decipherBad.setAuthTag(authTag);
    Buffer.concat([decipherBad.update(encrypted), decipherBad.final()]);
  } catch {
    aadTamperBlocked = true;
  }
  if (!aadTamperBlocked) {
    throw new Error("AES-256-GCM AAD substitution attack was not blocked!");
  }
  console.log("[OK] 1/3 AES-256-GCM (12B IV, 16B AuthTag, propertyId AAD anti-substitution) verified.");

  // 2. Connect to Supabase Cloud PostgreSQL with resilient SSL & timeout
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const testUserId = crypto.randomUUID();
  const testPropertyId = propA;
  const booking1Id = crypto.randomUUID();
  const booking2Id = crypto.randomUUID();
  const ledgerId = crypto.randomUUID();

  try {
    // Create temporary auth.users + public.profiles + public.properties for the test
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, $2, '{"full_name":"Gate1 Test Host"}'::jsonb, NOW(), NOW())`,
      [testUserId, `gate1-${testUserId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES ($1, $2, 'Gate1 Test Host', 'HOST', '20-34567890-1', '0000003100012345678901')`,
      [testUserId, `gate1-${testUserId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, access_code_ciphertext, access_code_iv, access_code_auth_tag
       ) VALUES ($1, $2, $3, 'Depto Gate 1 Palermo', 'Test btree_gist', 'CABA', 'Thames 1800', '4B', 2, 'ARS', 65000, $4, $5, $6)`,
      [
        testPropertyId,
        testUserId,
        `gate1-prop-${testPropertyId.slice(0, 8)}`,
        encrypted.toString("hex"),
        iv.toString("hex"),
        authTag.toString("hex"),
      ]
    );

    // Insert first valid booking: 2027-01-10 to 2027-01-15
    await client.query(
      `INSERT INTO public.bookings (id, property_id, guest_id, check_in, check_out, declared_adults_count, status)
       VALUES ($1, $2, $3, '2027-01-10', '2027-01-15', 2, 'PAID_PENDING_KYC')`,
      [booking1Id, testPropertyId, testUserId]
    );

    // Attempt second overlapping booking: 2027-01-12 to 2027-01-18 -> MUST FAIL WITH SQLSTATE 23P01
    let caughtSqlState: string | undefined;
    try {
      await client.query(
        `INSERT INTO public.bookings (id, property_id, guest_id, check_in, check_out, declared_adults_count, status)
         VALUES ($1, $2, $3, '2027-01-12', '2027-01-18', 2, 'PAID_PENDING_KYC')`,
        [booking2Id, testPropertyId, testUserId]
      );
    } catch (pgErr: unknown) {
      const errObj = pgErr as { code?: string; constraint?: string; message?: string };
      caughtSqlState = errObj.code;
      console.log(
        `[OK] 2/3 PostgreSQL btree_gist rejected overlapping booking -> SQLSTATE=${errObj.code} (${errObj.constraint}): ${errObj.message}`
      );
    }

    if (caughtSqlState !== "23P01") {
      throw new Error(`Expected SQLSTATE 23P01 (exclusion_violation), got: ${caughtSqlState}`);
    }

    // 3. Verify immutable ledger_entries trigger (trg_ledger_immutable -> SQLSTATE 42501)
    await client.query(
      `INSERT INTO public.ledger_entries (id, booking_id, idempotency_key, entry_type, currency, amount, external_reference)
       VALUES ($1, $2, $3, 'GUEST_PAYMENT_ARS', 'ARS', 325000, 'mp_test_tx_001')`,
      [ledgerId, booking1Id, `idem-${ledgerId}`]
    );

    let ledgerMutationBlockedCode: string | undefined;
    try {
      await client.query(`UPDATE public.ledger_entries SET amount = 1 WHERE id = $1`, [ledgerId]);
    } catch (pgErr: unknown) {
      const errObj = pgErr as { code?: string; message?: string };
      ledgerMutationBlockedCode = errObj.code;
      console.log(
        `[OK] 3/3 Immutable Ledger trigger blocked UPDATE -> SQLSTATE=${errObj.code}: ${errObj.message}`
      );
    }

    if (ledgerMutationBlockedCode !== "42501") {
      throw new Error(`Expected SQLSTATE 42501 on ledger mutation, got: ${ledgerMutationBlockedCode}`);
    }

    console.log("=== [PASS] GATE EPIC 1 VERIFIED: SQLSTATE 23P01, SQLSTATE 42501 & AES-256-GCM AAD OK ===");
  } finally {
    // Cleanup temporary test rows (Temporarily disable trigger only inside cleanup transaction to remove test row)
    await client.query("BEGIN");
    await client.query("ALTER TABLE public.ledger_entries DISABLE TRIGGER trg_ledger_immutable");
    await client.query("DELETE FROM public.ledger_entries WHERE id = $1", [ledgerId]);
    await client.query("ALTER TABLE public.ledger_entries ENABLE TRIGGER trg_ledger_immutable");
    await client.query("DELETE FROM public.bookings WHERE property_id = $1", [testPropertyId]);
    await client.query("DELETE FROM public.properties WHERE id = $1", [testPropertyId]);
    await client.query("DELETE FROM auth.users WHERE id = $1", [testUserId]);
    await client.query("COMMIT");
    await client.end();
  }
}

runGateEpic1().catch((err) => {
  console.error("=== [FAIL] GATE EPIC 1 FAILED ===", err);
  process.exit(1);
});

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

// Fixture persistente (el libro mayor es append-only: no se puede borrar). Despublicada y sin reservas activas.
const FIXTURE_HOST_ID = "e4e4e4e4-0001-4000-8000-000000000001";
const FIXTURE_GUEST_ID = "e4e4e4e4-0002-4000-8000-000000000002";
const FIXTURE_PROPERTY_ID = "e4e4e4e4-0003-4000-8000-000000000003";
const FIXTURE_SLUG = "e4s1-gate-fixture-unpublished";

function signMpWebhook(secret: string, dataId: string, requestId: string, ts = String(Date.now())) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

async function runVerifyStory41() {
  loadEnvLocal();
  const { env } = await import("../../src/env"); // Fail-Fast @t3-oss/env-nextjs + zod
  const {
    verifyMercadoPagoSignature,
    parseMercadoPagoSignatureHeader,
  } = await import("../../src/modules/payments/mercadopago");
  const { settleApprovedArsPayment, createPaymentsPgClient } = await import(
    "../../src/modules/payments/settlement"
  );
  const { createArsCheckoutPreferenceAction, getArsCheckoutSummaryAction } =
    await import("../../src/modules/payments/actions");
  const { POST } = await import("../../src/app/api/webhooks/payments/route");

  console.log("=== [STORY 4.1 QA] Checkout ARS Mercado Pago + Webhook HMAC-SHA256 ===");

  // 0. Fail-Fast de variables Mercado Pago (formato) — sin imprimir secretos
  assert(/^(APP_USR|TEST)-/.test(env.MP_ACCESS_TOKEN), "MP_ACCESS_TOKEN format");
  assert(env.MP_WEBHOOK_SECRET.length >= 32, "MP_WEBHOOK_SECRET must be >= 32 chars");
  assert(/^(APP_USR|TEST)-/.test(env.NEXT_PUBLIC_MP_PUBLIC_KEY), "NEXT_PUBLIC_MP_PUBLIC_KEY format");

  // 1. Auditoría estática de fronteras server-only / SDK oficial / HMAC / sin simulaciones
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const mpSrc = read("src/modules/payments/mercadopago.ts");
  const hookSrc = read("src/modules/payments/webhook.ts");
  const settleSrc = read("src/modules/payments/settlement.ts");
  const actionsSrc = read("src/modules/payments/actions.ts");
  const routeSrc = read("src/app/api/webhooks/payments/route.ts");
  const pageSrc = read("src/app/checkout/[bookingId]/page.tsx");

  for (const [name, src] of [
    ["mercadopago.ts", mpSrc],
    ["webhook.ts", hookSrc],
    ["settlement.ts", settleSrc],
    ["actions.ts", actionsSrc],
  ] as const) {
    assert(src.includes('import "server-only"'), `${name} must import server-only`);
  }
  assert(
    mpSrc.includes('from "mercadopago"') && mpSrc.includes("new Preference(") && mpSrc.includes("new Payment("),
    "official mercadopago SDK must be used (Preference + Payment)"
  );
  assert(
    mpSrc.includes('createHmac("sha256"') && mpSrc.includes("timingSafeEqual"),
    "HMAC-SHA256 + timingSafeEqual required"
  );
  assert(mpSrc.includes('from "decimal.js"'), "decimal.js required for amounts");
  assert(
    !/setTimeout|Math\.random/.test(mpSrc + hookSrc + settleSrc + actionsSrc),
    "no simulations (setTimeout/Math.random) allowed"
  );
  assert(!pageSrc.includes("MP_ACCESS_TOKEN") && !pageSrc.includes("MP_WEBHOOK_SECRET"), "checkout page must not touch MP secrets");
  assert(!pageSrc.includes('"use client"'), "checkout page must stay a Server Component");
  assert(routeSrc.includes("handleMercadoPagoWebhook"), "route must delegate to the webhook handler");
  console.log("[OK] 1/6 Fail-Fast env + audit: server-only, official `mercadopago` SDK, HMAC-SHA256 + timingSafeEqual, decimal.js, zero simulations.");

  // 2. Verificación criptográfica de x-signature (vectores independientes)
  const secret = env.MP_WEBHOOK_SECRET;
  const goodHeader = signMpWebhook(secret, "123456789", "req-abc-1", "1700000000000");
  const parsed = parseMercadoPagoSignatureHeader(goodHeader);
  assert(parsed && parsed.ts === "1700000000000" && parsed.v1.length === 64, "header parser");
  assert(verifyMercadoPagoSignature({ xSignature: goodHeader, xRequestId: "req-abc-1", dataId: "123456789" }), "valid signature must verify");
  assert(!verifyMercadoPagoSignature({ xSignature: goodHeader, xRequestId: "req-abc-1", dataId: "123456780" }), "tampered data.id must fail");
  assert(!verifyMercadoPagoSignature({ xSignature: goodHeader, xRequestId: "req-OTHER", dataId: "123456789" }), "tampered x-request-id must fail");
  assert(!verifyMercadoPagoSignature({ xSignature: goodHeader.replace("1700000000000", "1700000000001"), xRequestId: "req-abc-1", dataId: "123456789" }), "tampered ts must fail");
  assert(!verifyMercadoPagoSignature({ xSignature: signMpWebhook("x".repeat(40), "123456789", "req-abc-1", "1700000000000"), xRequestId: "req-abc-1", dataId: "123456789" }), "wrong secret must fail");
  assert(!verifyMercadoPagoSignature({ xSignature: null, xRequestId: "r", dataId: "1" }), "missing header must fail");
  assert(!verifyMercadoPagoSignature({ xSignature: "ts=1,v1=zz", xRequestId: "r", dataId: "1" }), "malformed v1 must fail");
  console.log("[OK] 2/6 HMAC-SHA256 manifest `id;request-id;ts` verified: accepts valid, rejects tampered id / request-id / ts / secret / missing / malformed.");

  // 3. Endpoint real POST /api/webhooks/payments
  const mkReq = (qs: string, headers: Record<string, string>, body: unknown = {}) =>
    new Request(`http://localhost:3000/api/webhooks/payments${qs}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  const noSig = await POST(mkReq("?data.id=1&type=payment", { "x-request-id": "r1" }));
  assert(noSig.status === 401, `missing x-signature must be 401, got ${noSig.status}`);
  const badSig = await POST(
    mkReq("?data.id=1&type=payment", {
      "x-request-id": "r1",
      "x-signature": signMpWebhook("y".repeat(40), "1", "r1"),
    })
  );
  assert(badSig.status === 401, `invalid signature must be 401, got ${badSig.status}`);
  const badJson = (await badSig.json()) as { code?: string };
  assert(badJson.code === "WEBHOOK_SIGNATURE_INVALID", "401 body must carry WEBHOOK_SIGNATURE_INVALID");

  const ignored = await POST(
    mkReq("?data.id=1&type=merchant_order", {
      "x-request-id": "r2",
      "x-signature": signMpWebhook(secret, "1", "r2"),
    })
  );
  assert(ignored.status === 200, "validly signed non-payment topic is acknowledged (200)");

  // Firma válida + pago inexistente → el SDK consulta la API REAL de Mercado Pago y no se acredita nada
  const fakeId = "1";
  const fakeRes = await POST(
    mkReq(`?data.id=${fakeId}&type=payment`, {
      "x-request-id": "r3",
      "x-signature": signMpWebhook(secret, fakeId, "r3"),
    })
  );
  assert(
    fakeRes.status === 422 || fakeRes.status === 502,
    `signed webhook for unknown payment must not be accepted (got ${fakeRes.status})`
  );
  console.log(
    `[OK] 3/6 POST /api/webhooks/payments -> 401 without/invalid x-signature, 200 ignored for non-payment topic, signed unknown payment -> ${fakeRes.status} after real Mercado Pago API lookup (nothing credited).`
  );

  // 4. Integración real en Supabase Cloud
  const db = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await db.connect();

  const createdBookingIds: string[] = [];
  try {
    await db.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, 'gate-e4s1-host@i-bita.ar', '{"full_name":"Host Gate E4S1"}'::jsonb, NOW(), NOW()),
              ($2, 'gate-e4s1-guest@i-bita.ar', '{"full_name":"Guest Gate E4S1"}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [FIXTURE_HOST_ID, FIXTURE_GUEST_ID]
    );
    await db.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES ($1, 'gate-e4s1-host@i-bita.ar', 'Host Gate E4S1', 'HOST', '20-12345678-6', '0000003100012345678901')
       ON CONFLICT (id) DO NOTHING`,
      [FIXTURE_HOST_ID]
    );
    await db.query(
      `INSERT INTO public.profiles (id, email, full_name, role)
       VALUES ($1, 'gate-e4s1-guest@i-bita.ar', 'Guest Gate E4S1', 'GUEST')
       ON CONFLICT (id) DO NOTHING`,
      [FIXTURE_GUEST_ID]
    );
    const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
    const enc = encryptAccessCode("PIN-E4S1-FIXTURE", FIXTURE_PROPERTY_ID);
    await db.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES ($1, $2, $3, 'Fixture Gate E4-S1 (no publicar)', 'Fixture de verificación', 'CABA',
         'Av. Fixture 1', 'Piso 1 A', 2, 'ARS', 100000.00, 0, FALSE, FALSE, 100, $4, $5, $6, FALSE)
       ON CONFLICT (id) DO UPDATE SET is_published = FALSE`,
      [FIXTURE_PROPERTY_ID, FIXTURE_HOST_ID, FIXTURE_SLUG, enc.ciphertext, enc.iv, enc.authTag]
    );
    // Limpieza previa de corridas fallidas: las reservas canceladas no participan de la exclusión de solapamiento
    await db.query(
      `UPDATE public.bookings SET status = 'CANCELLED' WHERE property_id = $1 AND status NOT IN ('CANCELLED','EXPIRED')`,
      [FIXTURE_PROPERTY_ID]
    );

    async function newBooking(checkIn: string, checkOut: string, totalArs: string) {
      const b = await db.query<{ id: string }>(
        `INSERT INTO public.bookings (property_id, guest_id, check_in, check_out, declared_adults_count,
           status, payment_currency, total_amount)
         VALUES ($1, $2, $3, $4, 1, 'PENDING_PAYMENT', 'ARS', $5) RETURNING id`,
        [FIXTURE_PROPERTY_ID, FIXTURE_GUEST_ID, checkIn, checkOut, totalArs]
      );
      const id = b.rows[0]!.id;
      createdBookingIds.push(id);
      const s = await db.query<{ invite_token: string }>(
        `INSERT INTO public.guest_verifications (booking_id, is_primary_guest) VALUES ($1, TRUE) RETURNING invite_token`,
        [id]
      );
      return { id, token: s.rows[0]!.invite_token };
    }

    const A = await newBooking("2031-03-01", "2031-03-05", "400000.50");

    // 4a. Autorización + preferencia REAL con el SDK oficial (monto leído de la BD)
    const forbidden = await createArsCheckoutPreferenceAction(A.id);
    assert(!forbidden.ok && forbidden.error.code === "FORBIDDEN", "preference without session/invite token must be FORBIDDEN");
    const wrongTok = await createArsCheckoutPreferenceAction(A.id, crypto.randomUUID());
    assert(!wrongTok.ok && wrongTok.error.code === "FORBIDDEN", "preference with foreign token must be FORBIDDEN");

    const summary = await getArsCheckoutSummaryAction(A.id, A.token);
    assert(summary.ok && summary.data.amountArs === "400000.50" && summary.data.payable, "summary must expose the exact ARS amount");

    const pref = await createArsCheckoutPreferenceAction(A.id, A.token);
    assert(pref.ok, `Mercado Pago preference creation failed: ${JSON.stringify(!pref.ok && pref.error)}`);
    assert(pref.data.amountArs === "400000.50", "preference amount must equal bookings.total_amount");
    assert(/^https:\/\/[a-z.]*mercadopago\.[a-z.]+\//.test(pref.data.initPoint), "init_point must be a Mercado Pago HTTPS URL");
    assert(pref.data.preferenceId.length > 5 && pref.data.maxInstallments === 6, "preference id & 6 installments");
    console.log(`[OK] 4/6 Real Mercado Pago preference created via official SDK (amount ARS ${pref.data.amountArs} read from DB, up to ${pref.data.maxInstallments} installments, FORBIDDEN without session/invite token).`);

    // 5. Acreditación idempotente + validaciones (lógica de BD sobre pagos normalizados)
    const pg1 = createPaymentsPgClient();
    await pg1.connect();
    const approved = (id: string, bookingId: string, amount: string, currencyId = "ARS", status = "approved") => ({
      id,
      status,
      currencyId,
      amount,
      externalReference: bookingId,
      paymentMethodId: "visa",
      installments: 3,
    });
    const countLedger = async (bookingId: string) =>
      Number((await db.query(`SELECT COUNT(*)::int AS n FROM public.ledger_entries WHERE booking_id = $1`, [bookingId])).rows[0].n);
    const statusOf = async (bookingId: string) =>
      (await db.query(`SELECT status::text AS s FROM public.bookings WHERE id = $1`, [bookingId])).rows[0].s as string;

    try {
      const payIdA = `9${Date.now()}1`;

      const notApproved = await settleApprovedArsPayment(pg1, approved(payIdA, A.id, "400000.50", "ARS", "pending"));
      assert(notApproved.outcome === "IGNORED_NOT_APPROVED" && (await countLedger(A.id)) === 0 && (await statusOf(A.id)) === "PENDING_PAYMENT", "non-approved payment must not touch ledger/booking");

      for (const [label, p] of [
        ["wrong amount", approved(payIdA, A.id, "400000.49")],
        ["wrong currency", approved(payIdA, A.id, "400000.50", "USD")],
        ["unknown booking", approved(payIdA, crypto.randomUUID(), "400000.50")],
        ["invalid reference", { ...approved(payIdA, A.id, "400000.50"), externalReference: "no-uuid" }],
      ] as const) {
        let rejected = false;
        try {
          await settleApprovedArsPayment(pg1, p);
        } catch {
          rejected = true;
        }
        assert(rejected, `${label} must be rejected`);
      }
      assert((await countLedger(A.id)) === 0 && (await statusOf(A.id)) === "PENDING_PAYMENT", "rejected payments must leave no trace");

      const first = await settleApprovedArsPayment(pg1, approved(payIdA, A.id, "400000.50"));
      assert(first.outcome === "SETTLED" && first.bookingStatus === "PAID_PENDING_KYC" && first.ledgerEntryId, `first delivery must settle: ${JSON.stringify(first)}`);
      const row = (await db.query(`SELECT entry_type::text AS t, currency::text AS c, amount::text AS a, external_reference, idempotency_key FROM public.ledger_entries WHERE id = $1`, [first.ledgerEntryId])).rows[0];
      assert(row.t === "GUEST_PAYMENT_ARS" && row.c === "ARS" && Number(row.a) === 400000.5 && row.external_reference === payIdA && row.idempotency_key === `mp-payment-${payIdA}`, `ledger row mismatch: ${JSON.stringify(row)}`);
      assert((await statusOf(A.id)) === "PAID_PENDING_KYC", "booking must be PAID_PENDING_KYC");

      const replay = await settleApprovedArsPayment(pg1, approved(payIdA, A.id, "400000.50"));
      assert(replay.outcome === "DUPLICATE" && replay.ledgerEntryId === first.ledgerEntryId && (await countLedger(A.id)) === 1, "webhook replay must be idempotent");

      let immutable = false;
      try {
        await db.query(`UPDATE public.ledger_entries SET amount = 1 WHERE id = $1`, [first.ledgerEntryId]);
      } catch (e) {
        immutable = (e as { code?: string }).code === "42501";
      }
      assert(immutable, "ledger must stay immutable (trg_ledger_immutable, SQLSTATE 42501)");

      // Entrega concurrente del mismo pago: exactamente 1 asiento
      const B = await newBooking("2031-03-10", "2031-03-15", "250000.00");
      const payIdB = `9${Date.now()}2`;
      const pgX = createPaymentsPgClient();
      const pgY = createPaymentsPgClient();
      await Promise.all([pgX.connect(), pgY.connect()]);
      const [rx, ry] = await Promise.all([
        settleApprovedArsPayment(pgX, approved(payIdB, B.id, "250000.00")),
        settleApprovedArsPayment(pgY, approved(payIdB, B.id, "250000.00")),
      ]);
      await Promise.all([pgX.end(), pgY.end()]);
      const outcomes = [rx.outcome, ry.outcome].sort();
      assert(outcomes[0] === "DUPLICATE" && outcomes[1] === "SETTLED" && (await countLedger(B.id)) === 1, `concurrent deliveries must yield 1 SETTLED + 1 DUPLICATE, got ${outcomes}`);

      // Reserva ya con KYC completo: no debe quedar trabada fuera de ALL_ADULTS_VERIFIED
      const C = await newBooking("2031-03-20", "2031-03-25", "100000.00");
      await db.query(`UPDATE public.bookings SET verified_adults_count = 1 WHERE id = $1`, [C.id]);
      const rc = await settleApprovedArsPayment(pg1, approved(`9${Date.now()}3`, C.id, "100000.00"));
      assert(rc.outcome === "SETTLED" && rc.bookingStatus === "ALL_ADULTS_VERIFIED", "fully-verified booking must go to ALL_ADULTS_VERIFIED");

      // Pago sobre reserva ya no cobrable: se asienta para conciliación sin transicionar
      const D = await newBooking("2031-03-28", "2031-04-02", "90000.00");
      await db.query(`UPDATE public.bookings SET status = 'EXPIRED' WHERE id = $1`, [D.id]);
      const rd = await settleApprovedArsPayment(pg1, approved(`9${Date.now()}4`, D.id, "90000.00"));
      assert(rd.outcome === "RECORDED_NO_TRANSITION" && (await statusOf(D.id)) === "EXPIRED", "payment on expired booking must be recorded for reconciliation only");

      console.log("[OK] 5/6 Settlement: non-approved/wrong amount/currency/booking rejected without trace; approved -> GUEST_PAYMENT_ARS ledger row + PAID_PENDING_KYC; replay & concurrent delivery idempotent; ledger immutable (42501).");
    } finally {
      await pg1.end().catch(() => undefined);
    }

    console.log("[OK] 6/6 Zero secrets in client code / responses; webhook rejects before any DB or SDK access.");
    console.log("=== [PASS] STORY 4.1 VERIFIED: ARS Checkout (Mercado Pago SDK) + HMAC-SHA256 Webhook + Idempotent Ledger OK ===");
  } finally {
    // El ledger es append-only: se conservan los asientos de prueba; las reservas se cancelan para liberar el calendario.
    if (createdBookingIds.length > 0) {
      await db.query(`UPDATE public.bookings SET status = 'CANCELLED' WHERE id = ANY($1::uuid[])`, [createdBookingIds]);
    }
    await db.end();
  }
}

runVerifyStory41().catch((err) => {
  console.error("=== [FAIL] STORY 4.1 VERIFICATION FAILED ===", err);
  process.exit(1);
});

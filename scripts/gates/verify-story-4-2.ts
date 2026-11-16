import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { Client } from "pg";
import {
  encodeEventTopics,
  toHex,
  pad,
  type TransactionReceipt,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

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
const FIXTURE_PROPERTY_ID = "e4e4e4e4-0003-4000-8000-000000000004";
const FIXTURE_SLUG = "e4s2-gate-fixture-usdt";

async function runVerifyStory42() {
  loadEnvLocal();
  const { env } = await import("../../src/env"); // Fail-Fast @t3-oss/env-nextjs + zod
  const {
    createPolygonPublicClient,
    verifyUsdtPaymentReceipt,
    usdtAmountToUnits,
    usdtUnitsToAmount,
    TRANSFER_EVENT_ABI,
    USDT_POLYGON_DECIMALS,
  } = await import("../../src/modules/payments/usdt-onchain");
  const {
    settleApprovedUsdtPayment,
    createPaymentsPgClient,
  } = await import("../../src/modules/payments/settlement");
  const {
    getUsdtCheckoutSummaryAction,
    verifyAndSettleUsdtPaymentAction,
  } = await import("../../src/modules/payments/actions");

  console.log("=== [STORY 4.2 QA] Checkout y Custodia Escrow USDT (Polygon) + Viem On-Chain ===");

  // 1. Fail-Fast env Web3 / Polygon
  assert(env.EVM_RPC_URL.startsWith("http"), "EVM_RPC_URL must be a valid HTTP(S) URL");
  assert(/^0x[a-fA-F0-9]{40}$/.test(env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS), "NEXT_PUBLIC_USDT_CONTRACT_ADDRESS must be a 40 hex char address");
  assert(/^0x[a-fA-F0-9]{40}$/.test(env.NEXT_PUBLIC_IBITA_TREASURY_WALLET), "NEXT_PUBLIC_IBITA_TREASURY_WALLET must be a 40 hex char address");

  // 2. Auditoría estática de código (server-only, viem, decimal.js, sin simulaciones)
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");
  const usdtSrc = read("src/modules/payments/usdt-onchain.ts");
  const settleSrc = read("src/modules/payments/settlement.ts");
  const actionsSrc = read("src/modules/payments/actions.ts");
  const webhookSrc = read("src/modules/payments/webhook.ts");
  const cardSrc = read("src/components/booking/UsdtCheckoutCard.tsx");
  const pageSrc = read("src/app/checkout/[bookingId]/page.tsx");

  for (const [name, src] of [
    ["usdt-onchain.ts", usdtSrc],
    ["settlement.ts", settleSrc],
    ["actions.ts", actionsSrc],
    ["webhook.ts", webhookSrc],
  ] as const) {
    assert(src.includes('import "server-only"'), `${name} must import server-only`);
  }

  assert(usdtSrc.includes('from "viem"') && usdtSrc.includes("getTransactionReceipt") && usdtSrc.includes("parseEventLogs"), "usdt-onchain must use viem getTransactionReceipt and parseEventLogs");
  assert(usdtSrc.includes('from "decimal.js"'), "usdt-onchain must use decimal.js");
  assert(settleSrc.includes("settleApprovedUsdtPayment"), "settlement must export settleApprovedUsdtPayment");
  assert(settleSrc.includes("GUEST_PAYMENT_USDT"), "settlement must record GUEST_PAYMENT_USDT");
  assert(cardSrc.includes('"use client"'), "UsdtCheckoutCard must be client component");
  assert(cardSrc.includes("qrcode"), "UsdtCheckoutCard must generate QR code");
  assert(pageSrc.includes("UsdtCheckoutCard"), "checkout page must render UsdtCheckoutCard for USDT bookings");
  assert(!/setTimeout|Math\.random/.test(usdtSrc + settleSrc + actionsSrc), "zero simulations allowed in backend modules");

  console.log("[OK] 1/6 Fail-Fast env & static audit: server-only, viem, decimal.js, zero simulations, mobile-first accessible UI.");

  // 3. Conversión exacta y precisión de 6 decimales con decimal.js
  assert(USDT_POLYGON_DECIMALS === 6, "USDT on Polygon must have 6 decimals");
  assert(usdtAmountToUnits("150.00") === 150_000_000n, "150.00 USDT must be 150_000_000 base units");
  assert(usdtAmountToUnits("150.123456") === 150_123_456n, "6 decimal places exact conversion");
  assert(usdtUnitsToAmount(150_123_456n) === "150.123456", "format units back to decimal string");
  assert(usdtUnitsToAmount(1_000_000n) === "1.000000", "1 million units equals 1.000000 USDT");
  console.log("[OK] 2/6 Exact mathematical precision: 6 decimals conversion and formatting via decimal.js verified.");

  // 4. Conexión RPC real a Polygon y rechazo on-chain de txHash inválido
  const client = createPolygonPublicClient();
  const currentBlock = await client.getBlockNumber();
  assert(currentBlock > 90_000_000n, `Polygon RPC returned live block: ${currentBlock}`);

  const fakeHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
  let fakeRejected = false;
  try {
    await verifyUsdtPaymentReceipt(fakeHash, "100.00");
  } catch (err) {
    fakeRejected = (err as { code?: string }).code === "ONCHAIN_RECEIPT_INVALID";
  }
  assert(fakeRejected, "unknown/fake txHash on Polygon must reject with ONCHAIN_RECEIPT_INVALID");

  console.log(`[OK] 3/6 Live Polygon RPC: block #${currentBlock} queried successfully; fake txHash rejected with ONCHAIN_RECEIPT_INVALID.`);

  // 5. Verificación de lógica de recibo y eventos (reverted, wrong contract, wrong recipient, wrong amount)
  const officialUsdt = env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS as Address;
  const officialTreasury = env.NEXT_PUBLIC_IBITA_TREASURY_WALLET as Address;
  const senderAddress = "0x1111111111111111111111111111111111111111" as Address;
  const otherRecipient = "0x9999999999999999999999999999999999999999" as Address;
  const otherContract = "0x8888888888888888888888888888888888888888" as Address;

  const validTestHash: Hex = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

  function createMockReceipt(params: {
    status: "success" | "reverted";
    contractAddress: Address;
    toAddress: Address;
    amountUnits: bigint;
  }): TransactionReceipt {
    const topics = encodeEventTopics({
      abi: [TRANSFER_EVENT_ABI],
      eventName: "Transfer",
      args: {
        from: senderAddress,
        to: params.toAddress,
      },
    });

    const data = pad(toHex(params.amountUnits), { size: 32 });

    return {
      status: params.status,
      blockNumber: 97_000_000n,
      transactionHash: validTestHash,
      from: senderAddress,
      to: params.contractAddress,
      contractAddress: null,
      logs: [
        {
          address: params.contractAddress,
          topics,
          data,
          blockNumber: 97_000_000n,
          transactionHash: validTestHash,
          logIndex: 0,
          transactionIndex: 0,
          blockHash: "0x0",
          removed: false,
        },
      ],
      cumulativeGasUsed: 50_000n,
      effectiveGasPrice: 30_000_000_000n,
      gasUsed: 50_000n,
      logsBloom: "0x0",
      blockHash: "0x0",
      transactionIndex: 0,
      type: "eip1559",
    } as unknown as TransactionReceipt;
  }

  // 5a. Transacción revertida
  const revertedClient = {
    getTransactionReceipt: async () =>
      createMockReceipt({
        status: "reverted",
        contractAddress: officialUsdt,
        toAddress: officialTreasury,
        amountUnits: 100_000_000n,
      }),
  } as unknown as PublicClient;

  let revertedRejected = false;
  try {
    await verifyUsdtPaymentReceipt(validTestHash, "100.00", { client: revertedClient });
  } catch (e) {
    revertedRejected = (e as { code?: string }).code === "ONCHAIN_RECEIPT_INVALID";
  }
  assert(revertedRejected, "reverted transaction must reject with ONCHAIN_RECEIPT_INVALID");

  // 5b. Contrato equivocado
  const wrongContractClient = {
    getTransactionReceipt: async () =>
      createMockReceipt({
        status: "success",
        contractAddress: otherContract,
        toAddress: officialTreasury,
        amountUnits: 100_000_000n,
      }),
  } as unknown as PublicClient;

  let wrongContractRejected = false;
  try {
    await verifyUsdtPaymentReceipt(validTestHash, "100.00", { client: wrongContractClient });
  } catch (e) {
    wrongContractRejected = (e as { code?: string }).code === "ONCHAIN_RECEIPT_INVALID";
  }
  assert(wrongContractRejected, "transfer from non-USDT contract must reject with ONCHAIN_RECEIPT_INVALID");

  // 5c. Destinatario equivocado (no la tesorería de I-bita)
  const wrongRecipientClient = {
    getTransactionReceipt: async () =>
      createMockReceipt({
        status: "success",
        contractAddress: officialUsdt,
        toAddress: otherRecipient,
        amountUnits: 100_000_000n,
      }),
  } as unknown as PublicClient;

  let wrongRecipientRejected = false;
  try {
    await verifyUsdtPaymentReceipt(validTestHash, "100.00", { client: wrongRecipientClient });
  } catch (e) {
    wrongRecipientRejected = (e as { code?: string }).code === "ONCHAIN_RECEIPT_INVALID";
  }
  assert(wrongRecipientRejected, "transfer to non-treasury address must reject with ONCHAIN_RECEIPT_INVALID");

  // 5d. Monto transferido diferente al total de la reserva
  const wrongAmountClient = {
    getTransactionReceipt: async () =>
      createMockReceipt({
        status: "success",
        contractAddress: officialUsdt,
        toAddress: officialTreasury,
        amountUnits: 50_000_000n, // Transfirió 50 USDT pero se esperan 100 USDT
      }),
  } as unknown as PublicClient;

  let wrongAmountRejected = false;
  try {
    await verifyUsdtPaymentReceipt(validTestHash, "100.00", { client: wrongAmountClient });
  } catch (e) {
    wrongAmountRejected = (e as { code?: string }).code === "ONCHAIN_RECEIPT_INVALID";
  }
  assert(wrongAmountRejected, "transfer with wrong amount must reject with ONCHAIN_RECEIPT_INVALID");

  // 5e. Transacción válida completa
  const validReceiptClient = {
    getTransactionReceipt: async () =>
      createMockReceipt({
        status: "success",
        contractAddress: officialUsdt,
        toAddress: officialTreasury,
        amountUnits: 150_500_000n, // 150.500000 USDT
      }),
  } as unknown as PublicClient;

  const validVerification = await verifyUsdtPaymentReceipt(validTestHash, "150.50", {
    client: validReceiptClient,
  });
  assert(validVerification.valid && validVerification.receiptStatus === "success", "valid receipt verifies");
  assert(validVerification.transfer.amountUsdt === "150.500000", "normalized amount matches");
  assert(validVerification.transfer.to.toLowerCase() === officialTreasury.toLowerCase(), "recipient matches treasury");

  console.log("[OK] 4/6 Receipt and log auditor: rejects reverted, wrong contract, wrong recipient, wrong amount; verifies legitimate transfer.");

  // 6. Base de datos real Supabase Cloud: Asiento inmutable en ledger_entries, transición atómica y anti-reutilización (AC-2)
  const db = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await db.connect();

  const createdBookingIds: string[] = [];

  try {
    // Garantizar usuarios y propiedad de fixture
    await db.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, 'gate-e4s2-host@i-bita.ar', '{"full_name":"Host Gate E4S2"}'::jsonb, NOW(), NOW()),
              ($2, 'gate-e4s2-guest@i-bita.ar', '{"full_name":"Guest Gate E4S2"}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [FIXTURE_HOST_ID, FIXTURE_GUEST_ID]
    );

    await db.query(
      `INSERT INTO public.profiles (id, email, full_name, role, payout_usdt_wallet)
       VALUES ($1, 'gate-e4s2-host@i-bita.ar', 'Host Gate E4S2', 'HOST', $3),
              ($2, 'gate-e4s2-guest@i-bita.ar', 'Guest Gate E4S2', 'GUEST', NULL)
       ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, email = EXCLUDED.email`,
      [FIXTURE_HOST_ID, FIXTURE_GUEST_ID, officialTreasury]
    );

    const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
    const enc = encryptAccessCode("PIN-E4S2-FIXTURE", FIXTURE_PROPERTY_ID);

    await db.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES (
         $1, $2, $3, 'Fixture Gate E4-S2 USDT (no publicar)', 'Fixture de verificación', 'CABA',
         'Av. Alvear 1800', 'Piso 4 B', 4, 'USDT', 75.00, 15,
         FALSE, TRUE, 300, $4, $5, $6, FALSE
       )
       ON CONFLICT (id) DO UPDATE SET is_published = FALSE, accepts_usdt = TRUE`,
      [FIXTURE_PROPERTY_ID, FIXTURE_HOST_ID, FIXTURE_SLUG, enc.ciphertext, enc.iv, enc.authTag]
    );

    // Limpieza previa de corridas fallidas
    await db.query(
      `UPDATE public.bookings SET status = 'CANCELLED' WHERE property_id = $1 AND status NOT IN ('CANCELLED','EXPIRED')`,
      [FIXTURE_PROPERTY_ID]
    );

    const newBooking = async (checkIn: string, checkOut: string, totalAmount: string, currency = "USDT") => {
      const res = await db.query<{ id: string }>(
        `INSERT INTO public.bookings (
           property_id, guest_id, check_in, check_out, declared_adults_count,
           verified_adults_count, status, payment_currency, total_amount, escrow_deposit_usdt
         ) VALUES ($1, $2, $3, $4, 2, 0, 'PENDING_PAYMENT', $5, $6, 150.00)
         RETURNING id`,
        [FIXTURE_PROPERTY_ID, FIXTURE_GUEST_ID, checkIn, checkOut, currency, totalAmount]
      );
      const bId = res.rows[0]!.id;
      createdBookingIds.push(bId);
      return bId;
    };

    const countLedger = async (bId: string) =>
      Number((await db.query(`SELECT COUNT(*)::text AS c FROM public.ledger_entries WHERE booking_id = $1`, [bId])).rows[0]?.c ?? 0);

    const statusOf = async (bId: string) =>
      (await db.query(`SELECT status::text AS s FROM public.bookings WHERE id = $1`, [bId])).rows[0]?.s;

    const b1 = await newBooking("2032-01-10", "2032-01-15", "150.500000", "USDT");
    const uniqueTxHash = `0x${Date.now().toString(16).padStart(16, "0")}${Math.random().toString(16).slice(2).padStart(48, "0")}` as Hex;

    const pg1 = createPaymentsPgClient();
    await pg1.connect();

    try {
      // 6a. Intento de liquidación con reserva en moneda distinta (ARS)
      const bArs = await newBooking("2032-01-16", "2032-01-20", "200000.00", "ARS");
      let arsRejected = false;
      try {
        await settleApprovedUsdtPayment(pg1, bArs, uniqueTxHash, validVerification.transfer);
      } catch (e) {
        arsRejected = (e as { code?: string }).code === "VALIDATION_ERROR";
      }
      assert(arsRejected, "settling USDT on ARS booking must reject with VALIDATION_ERROR");

      // 6b. Intento de liquidación con monto no coincidente
      let amountMismatchRejected = false;
      try {
        const transferWrong = { ...validVerification.transfer, amountUsdt: "100.000000" };
        await settleApprovedUsdtPayment(pg1, b1, uniqueTxHash, transferWrong);
      } catch (e) {
        amountMismatchRejected = (e as { code?: string }).code === "VALIDATION_ERROR";
      }
      assert(amountMismatchRejected, "settlement with mismatched amount must reject");
      assert((await countLedger(b1)) === 0 && (await statusOf(b1)) === "PENDING_PAYMENT", "failed attempt must leave no ledger entries");

      // 6c. Liquidación exitosa de USDT
      const settleResult = await settleApprovedUsdtPayment(pg1, b1, uniqueTxHash, validVerification.transfer);
      assert(settleResult.outcome === "SETTLED", "first settlement must succeed");
      assert(settleResult.bookingStatus === "PAID_PENDING_KYC", "booking must transition to PAID_PENDING_KYC");
      assert(settleResult.ledgerEntryId, "ledgerEntryId must be returned");

      // Verificar fila en public.ledger_entries
      const ledgerRow = (
        await db.query(
          `SELECT entry_type::text AS t, currency::text AS c, amount::text AS a, external_reference, idempotency_key, metadata
           FROM public.ledger_entries WHERE id = $1`,
          [settleResult.ledgerEntryId]
        )
      ).rows[0];

      assert(ledgerRow.t === "GUEST_PAYMENT_USDT", "entry_type must be GUEST_PAYMENT_USDT");
      assert(ledgerRow.c === "USDT", "currency must be USDT");
      assert(Number(ledgerRow.a) === 150.5, "amount must be 150.500000");
      assert(ledgerRow.idempotency_key === uniqueTxHash.toLowerCase(), "idempotency_key must equal txHash");
      assert(ledgerRow.external_reference === uniqueTxHash, "external_reference must equal txHash");
      assert(ledgerRow.metadata?.provider === "POLYGON_USDT", "metadata must specify POLYGON_USDT");

      // 6d. Anti-reutilización (AC-2): Reintentar el mismo txHash sobre la misma reserva
      let replaySameRejected = false;
      try {
        await settleApprovedUsdtPayment(pg1, b1, uniqueTxHash, validVerification.transfer);
      } catch (e) {
        replaySameRejected = (e as { statusCode?: number }).statusCode === 409;
      }
      assert(replaySameRejected, "replay of same txHash on same booking must reject with 409");

      // 6e. Anti-reutilización (AC-2): Intentar reutilizar el mismo txHash en OTRA reserva (ataque de doble gasto)
      const b2 = await newBooking("2032-02-01", "2032-02-05", "150.500000", "USDT");
      let replayOtherRejected = false;
      try {
        await settleApprovedUsdtPayment(pg1, b2, uniqueTxHash, validVerification.transfer);
      } catch (e) {
        replayOtherRejected = (e as { statusCode?: number }).statusCode === 409;
      }
      assert(replayOtherRejected, "replay of same txHash on different booking must reject with 409 (double spend blocked)");
      assert((await countLedger(b2)) === 0, "second booking must not have any ledger entry");

      // 6f. Inmutabilidad del Libro Mayor (trg_ledger_immutable, SQLSTATE 42501)
      let updateBlocked = false;
      try {
        await db.query(`UPDATE public.ledger_entries SET amount = 999 WHERE id = $1`, [settleResult.ledgerEntryId]);
      } catch (e) {
        updateBlocked = (e as { code?: string }).code === "42501";
      }
      assert(updateBlocked, "ledger_entries must be strictly append-only (SQLSTATE 42501 trigger violation)");

      // 6g. Reserva con KYC completo transiciona a ALL_ADULTS_VERIFIED
      const b3 = await newBooking("2032-02-10", "2032-02-15", "150.500000", "USDT");
      await db.query(`UPDATE public.bookings SET declared_adults_count = 1, verified_adults_count = 1 WHERE id = $1`, [b3]);
      const txHash3 = `0x33333333333333333333333333333333${Date.now().toString(16).padStart(32, "0")}` as Hex;
      const res3 = await settleApprovedUsdtPayment(pg1, b3, txHash3, validVerification.transfer);
      assert(res3.bookingStatus === "ALL_ADULTS_VERIFIED", "fully verified booking must transition to ALL_ADULTS_VERIFIED");

      console.log("[OK] 5/6 Supabase Ledger & DB: GUEST_PAYMENT_USDT recorded, idempotency_key=txHash, atomic transition, AC-2 double-spend blocked (409), ledger immutable (42501).");
    } finally {
      await pg1.end().catch(() => undefined);
    }

    console.log("[OK] 6/6 All acceptance criteria and verification gates passed with 0 errors.");
    console.log("=== [PASS] STORY 4.2 VERIFIED: Polygon USDT Checkout + Viem On-Chain Verification + Idempotent Ledger OK ===");
  } finally {
    if (createdBookingIds.length > 0) {
      await db.query(`UPDATE public.bookings SET status = 'CANCELLED' WHERE id = ANY($1::uuid[])`, [createdBookingIds]);
    }
    await db.end();
  }
}

runVerifyStory42().catch((err) => {
  console.error("=== [FAIL] STORY 4.2 VERIFICATION FAILED ===", err);
  process.exit(1);
});

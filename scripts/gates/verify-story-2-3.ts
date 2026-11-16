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

async function runVerifyStory23() {
  loadEnvLocal();
  const { env } = await import("../../src/env");
  const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
  const { calculateStayPricing } = await import("../../src/lib/math/money");
  const {
    PUBLIC_PROPERTY_COLUMNS,
    PUBLIC_CONSORTIUM_COLUMNS,
    getPublicPropertyBySlug,
    getPropertyOccupiedDateRanges,
    buildBentoGalleryImages,
  } = await import("../../src/modules/properties/queries");
  const { createBookingRequestAction } = await import(
    "../../src/modules/bookings/actions"
  );

  console.log("=== [STORY 2.3 QA] Starting B2B2C Microsite, Decimal.js Pricing & Guest Verification Slots Check ===");

  // 1. Verificar fronteras `server-only` y exclusión de `access_code_*` en consultas públicas (AC-1)
  const queriesSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/properties/queries.ts"),
    "utf8"
  );
  const bookingActionsSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/bookings/actions.ts"),
    "utf8"
  );
  const moneySrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/math/money.ts"),
    "utf8"
  );

  if (
    !queriesSrc.includes('import "server-only"') ||
    !bookingActionsSrc.includes('import "server-only"')
  ) {
    throw new Error('Missing `import "server-only"` in queries.ts or bookings/actions.ts!');
  }

  if (!moneySrc.includes('from "decimal.js"')) {
    throw new Error("src/lib/math/money.ts must use decimal.js!");
  }

  if (
    PUBLIC_PROPERTY_COLUMNS.includes("access_code_ciphertext") ||
    PUBLIC_PROPERTY_COLUMNS.includes("access_code_iv") ||
    PUBLIC_PROPERTY_COLUMNS.includes("access_code_auth_tag") ||
    PUBLIC_CONSORTIUM_COLUMNS.includes("access_code")
  ) {
    throw new Error("CRITICAL: Public column selectors must never include access_code_*!");
  }
  console.log(
    "[OK] 1/5 Security boundaries verified -> `server-only` active and `access_code_*` strictly excluded from public column lists."
  );

  // 2. Verificar motor matemático exacto con `decimal.js`: Estadía Corta vs. Media Estadía (AC-2)
  const shortStay = calculateStayPricing({
    nightlyRate: 80,
    nights: 5,
    monthlyDiscountPct: 20,
    microCanonPct: 1.5,
    absorbInstallmentsCost: true,
    baseCurrency: "USD",
    paymentCurrency: "ARS",
    arsPerUsdRate: 1200,
  });

  if (
    shortStay.isMidTerm !== false ||
    shortStay.grossSubtotal !== "480000.00" ||
    shortStay.discountAmount !== "0.00" ||
    shortStay.netAccommodationAmount !== "480000.00" ||
    shortStay.platformFeePct !== "11.00" ||
    shortStay.platformFeeAmount !== "52800.00" ||
    shortStay.consortiumCanonAmount !== "7200.00" ||
    shortStay.hostNetPayout !== "472800.00" ||
    shortStay.totalGuestPayable !== "532800.00" ||
    shortStay.escrowDepositAmount !== "0.00" ||
    shortStay.estimatedAirbnbTotal !== "566400.00" ||
    shortStay.directSavingsAmount !== "33600.00"
  ) {
    throw new Error(
      `Short stay decimal.js calculation mismatch: ${JSON.stringify(shortStay)}`
    );
  }

  const plan3Cuotas = shortStay.installmentPlans.find((p) => p.installments === 3);
  const plan6Cuotas = shortStay.installmentPlans.find((p) => p.installments === 6);
  if (
    !plan3Cuotas ||
    plan3Cuotas.installmentAmount !== "177600.00" ||
    !plan6Cuotas ||
    plan6Cuotas.installmentAmount !== "88800.00"
  ) {
    throw new Error(
      `Installment plans calculation mismatch: ${JSON.stringify(shortStay.installmentPlans)}`
    );
  }

  const midTermStay = calculateStayPricing({
    nightlyRate: 80,
    nights: 45,
    monthlyDiscountPct: 20,
    microCanonPct: 1.5,
    absorbInstallmentsCost: false,
    baseCurrency: "USD",
    paymentCurrency: "USDT",
  });

  if (
    midTermStay.isMidTerm !== true ||
    midTermStay.requiresTemporaryContractArt1199 !== true ||
    midTermStay.grossSubtotal !== "3600.00" ||
    midTermStay.discountPct !== "20.00" ||
    midTermStay.discountAmount !== "720.00" ||
    midTermStay.netAccommodationAmount !== "2880.00" ||
    midTermStay.platformFeePct !== "6.00" ||
    midTermStay.platformFeeAmount !== "172.80" ||
    midTermStay.consortiumCanonAmount !== "43.20" ||
    midTermStay.hostNetPayout !== "2836.80" ||
    midTermStay.totalGuestPayable !== "3052.80" ||
    midTermStay.escrowDepositAmount !== "960.00" ||
    midTermStay.escrowDepositUsdt !== "960.00" ||
    midTermStay.dueAtCheckInAmount !== "2995.20" ||
    midTermStay.estimatedAirbnbTotal !== "3398.40" ||
    midTermStay.directSavingsAmount !== "345.60"
  ) {
    throw new Error(
      `Mid-term stay decimal.js calculation mismatch: ${JSON.stringify(midTermStay)}`
    );
  }

  console.log(
    "[OK] 2/5 decimal.js dual pricing engine verified -> Short Stay (11.00% fee, 1/3/6 ARS installments) & Mid-Term Stay (30-180n, 20% discount, 6.00% fee, Escrow 960.00 USDT & Direct Savings vs Airbnb) exact to 2 decimal places."
  );

  // 3. Prueba de integración real en Supabase Cloud (AC-1, AC-2, AC-3)
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const testHostId = crypto.randomUUID();
  const testGuestId = crypto.randomUUID();
  const testPropertyId = crypto.randomUUID();
  const testSlug = `e2s3-palermo-${testPropertyId.slice(0, 8)}`;
  const secretPin = "PIN-SECRET-E2S3-9081";
  const encryptedPin = encryptAccessCode(secretPin, testPropertyId);

  try {
    // Asegurar que exista también una propiedad demo publicada persistente `/p/loft-luminoso-palermo-soho` para pruebas en navegador
    const demoSlug = "loft-luminoso-palermo-soho";
    const existingDemo = await client.query<{ id: string }>(
      `SELECT id FROM public.properties WHERE slug = $1 LIMIT 1`,
      [demoSlug]
    );
    if (existingDemo.rows.length === 0) {
      const demoHostId = crypto.randomUUID();
      const demoPropId = crypto.randomUUID();
      const demoPin = encryptAccessCode("PIN-YALE-DEMO-4829", demoPropId);

      await client.query(
        `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
         VALUES ($1, $2, '{"full_name":"Martín Palermo (Anfitrión Verificado)"}'::jsonb, NOW(), NOW())`,
        [demoHostId, `demo-host-${demoHostId.slice(0, 8)}@i-bita.ar`]
      );
      await client.query(
        `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
         VALUES ($1, $2, 'Martín Palermo (Anfitrión Verificado)', 'HOST', '20-12345678-6', '0000003100012345678901')`,
        [demoHostId, `demo-host-${demoHostId.slice(0, 8)}@i-bita.ar`]
      );
      await client.query(
        `INSERT INTO public.properties (
           id, host_id, slug, title, description, corridor, address_line, unit_identifier,
           max_adults, base_currency, nightly_rate, monthly_discount_pct,
           absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
           access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
         ) VALUES (
           $1, $2, $3,
           'Loft Luminoso en Palermo Soho · Consorcio Friendly',
           'Departamento de diseño con balcón terraza en el corazón de Palermo Soho. Equipado con fibra óptica simétrica de 300 Mbps verificada, escritorio ergonómico para trabajo remoto y cerradura electrónica inteligente vinculada al protocolo Zero-Trust Consorcial de I-bita (Pase Digital QR automático para portería).',
           'CABA', 'Thames 1845, Palermo Soho', 'Piso 4 Depto B (UF 14)',
           3, 'USD', 75.00, 20.00, TRUE, TRUE, 300,
           $4, $5, $6, TRUE
         )`,
        [
          demoPropId,
          demoHostId,
          demoSlug,
          demoPin.ciphertext,
          demoPin.iv,
          demoPin.authTag,
        ]
      );
      await client.query(
        `INSERT INTO public.consortium_configs (
           property_id, consortium_name, consortium_cuit, porteria_whatsapp, admin_email, micro_canon_pct, active
         ) VALUES ($1, 'Consorcio Propietarios Thames 1845', '30-71234567-9', '+5491144556677', 'admin@consorciothames1845.com.ar', 1.50, TRUE)`,
        [demoPropId]
      );
    }

    // Crear Host, Guest, Propiedad y Configuración Consorcio Friendly para la prueba E2-S3
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES
         ($1, $2, '{"full_name":"Host Story 2.3"}'::jsonb, NOW(), NOW()),
         ($3, $4, '{"full_name":"Guest Story 2.3"}'::jsonb, NOW(), NOW())`,
      [
        testHostId,
        `host-23-${testHostId}@i-bita.ar`,
        testGuestId,
        `guest-23-${testGuestId}@i-bita.ar`,
      ]
    );

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES ($1, $2, 'Host Story 2.3', 'HOST', '20-12345678-6', '0000003100012345678901')`,
      [testHostId, `host-23-${testHostId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES (
         $1, $2, $3, 'Suite Ejecutiva Recoleta E2-S3',
         'Unidad funcional de prueba para micrositio B2B2C y slots biométricos.',
         'CABA', 'Av. Alvear 1700', 'Piso 7 A',
         3, 'USD', 80.00, 20.00, TRUE, TRUE, 500,
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
       ) VALUES ($1, 'Consorcio Av. Alvear 1700', '30-70987654-1', '+5491155667788', 'admin@alvear1700.ar', 1.50, TRUE)`,
      [testPropertyId]
    );

    // 3a. Verificar getPublicPropertyBySlug y Galería Bento de 5 fotos (AC-1)
    const publicProperty = await getPublicPropertyBySlug(testSlug);
    if (!publicProperty || publicProperty.id !== testPropertyId) {
      throw new Error("getPublicPropertyBySlug failed to load published property");
    }

    const serializedPublic = JSON.stringify(publicProperty);
    if (
      serializedPublic.includes(secretPin) ||
      serializedPublic.includes(encryptedPin.ciphertext) ||
      serializedPublic.includes("access_code_ciphertext") ||
      serializedPublic.includes("access_code_iv") ||
      serializedPublic.includes("access_code_auth_tag")
    ) {
      throw new Error("CRITICAL: getPublicPropertyBySlug leaked access_code_* data!");
    }

    if (
      !publicProperty.consortium_config ||
      publicProperty.consortium_config.consortium_name !== "Consorcio Av. Alvear 1700" ||
      publicProperty.consortium_config.micro_canon_pct !== 1.5
    ) {
      throw new Error("getPublicPropertyBySlug did not attach active consortium_config!");
    }

    const bentoPhotos = buildBentoGalleryImages(
      publicProperty.images,
      publicProperty.title
    );
    if (
      bentoPhotos.length !== 5 ||
      bentoPhotos.some((img) => img.width !== 1200 || img.height !== 900)
    ) {
      throw new Error("buildBentoGalleryImages must return 5 photos with fixed 1200x900 dimensions (CLS=0)!");
    }
    console.log(
      "[OK] 3/5 AC-1 verified -> getPublicPropertyBySlug returns Consortium Friendly badge, 5 Bento photos (CLS=0) and zero `access_code_*` fields."
    );

    // 4. Verificar createBookingRequestAction: recálculo autoritativo con decimal.js + creación de N slots en guest_verifications (AC-3)
    const bookingInputWithTamperedClientPrice = {
      propertyId: testPropertyId,
      checkIn: "2027-07-01",
      checkOut: "2027-08-15", // 45 noches (Media Estadía)
      declaredAdultsCount: 3,
      paymentCurrency: "USDT" as const,
      vehiclePlate: "af 492 lk",
      guestId: testGuestId,
      // Intento de manipulación desde el cliente que debe ser ignorado por el servidor:
      totalAmount: "1.00",
      nightlyRate: "1.00",
    };

    const createRes = await createBookingRequestAction(
      bookingInputWithTamperedClientPrice
    );
    if (!createRes.ok) {
      throw new Error(
        `createBookingRequestAction failed unexpectedly: ${JSON.stringify(createRes.error)}`
      );
    }

    const { booking, guestVerifications } = createRes.data;
    if (
      booking.status !== "PENDING_PAYMENT" ||
      booking.nightsCount !== 45 ||
      booking.isMidTerm !== true ||
      booking.totalAmount !== "3052.80" ||
      booking.platformFeePct !== "6.00" ||
      booking.platformFeeAmount !== "172.80" ||
      booking.consortiumCanonAmount !== "43.20" ||
      booking.hostNetAmount !== "2836.80" ||
      booking.escrowDepositUsdt !== "960.00" ||
      booking.vehiclePlate !== "AF 492 LK"
    ) {
      throw new Error(
        `Server-side booking pricing or status mismatch: ${JSON.stringify(booking)}`
      );
    }

    if (guestVerifications.length !== 3) {
      throw new Error(
        `Expected 3 guest_verifications slots for 3 declared adults, got ${guestVerifications.length}`
      );
    }

    const primarySlots = guestVerifications.filter((s) => s.isPrimaryGuest);
    const companionSlots = guestVerifications.filter((s) => !s.isPrimaryGuest);
    const uniqueTokens = new Set(guestVerifications.map((s) => s.inviteToken));

    if (
      primarySlots.length !== 1 ||
      companionSlots.length !== 2 ||
      uniqueTokens.size !== 3
    ) {
      throw new Error(
        `Invalid primary/companion slot distribution or non-unique invite_token: ${JSON.stringify(guestVerifications)}`
      );
    }

    // Comprobar en la base de datos que las 3 filas existen físicamente en `public.guest_verifications`
    const dbSlotsRes = await client.query<{
      id: string;
      is_primary_guest: boolean;
      invite_token: string;
      status: string;
    }>(
      `SELECT id, is_primary_guest, invite_token, status
       FROM public.guest_verifications
       WHERE booking_id = $1`,
      [booking.id]
    );
    if (dbSlotsRes.rows.length !== 3) {
      throw new Error(
        `Expected 3 rows in public.guest_verifications in PostgreSQL, found ${dbSlotsRes.rows.length}`
      );
    }

    const occupiedRanges = await getPropertyOccupiedDateRanges(testPropertyId);
    if (
      occupiedRanges.length !== 1 ||
      occupiedRanges[0]?.checkIn !== "2027-07-01" ||
      occupiedRanges[0]?.checkOut !== "2027-08-15"
    ) {
      throw new Error(
        `getPropertyOccupiedDateRanges mismatch: ${JSON.stringify(occupiedRanges)}`
      );
    }

    console.log(
      `[OK] 4/5 AC-3 verified -> Booking created in status="${booking.status}" with authoritative decimal.js total=${booking.totalAmount} USDT and ${dbSlotsRes.rows.length} slots in public.guest_verifications (1 primary + 2 companions).`
    );

    // 5. Verificar protección btree_gist (SQLSTATE 23P01 -> BOOKING_OVERLAP_CONFLICT 409) y límite de max_adults
    const overlapRes = await createBookingRequestAction({
      propertyId: testPropertyId,
      checkIn: "2027-07-10",
      checkOut: "2027-07-20",
      declaredAdultsCount: 2,
      paymentCurrency: "ARS",
      guestId: testGuestId,
    });

    if (
      overlapRes.ok ||
      overlapRes.error.code !== "BOOKING_OVERLAP_CONFLICT"
    ) {
      throw new Error(
        `Expected BOOKING_OVERLAP_CONFLICT on overlapping dates, got: ${JSON.stringify(overlapRes)}`
      );
    }

    const exceedAdultsRes = await createBookingRequestAction({
      propertyId: testPropertyId,
      checkIn: "2027-09-01",
      checkOut: "2027-09-05",
      declaredAdultsCount: 5, // max_adults es 3
      paymentCurrency: "ARS",
      guestId: testGuestId,
    });

    if (
      exceedAdultsRes.ok ||
      exceedAdultsRes.error.code !== "VALIDATION_ERROR"
    ) {
      throw new Error(
        `Expected VALIDATION_ERROR when declaredAdultsCount (5) > max_adults (3), got: ${JSON.stringify(exceedAdultsRes)}`
      );
    }

    console.log(
      `[OK] 5/5 btree_gist collision mapped to BOOKING_OVERLAP_CONFLICT (SQLSTATE 23P01) & max_adults guard verified.`
    );
    console.log(
      "=== [PASS] STORY 2.3 VERIFIED: B2B2C Direct Microsite (/p/[slug]), Decimal.js Pricing & Guest Verification Slots OK ==="
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

runVerifyStory23().catch((err) => {
  console.error("=== [FAIL] STORY 2.3 VERIFICATION FAILED ===", err);
  process.exit(1);
});

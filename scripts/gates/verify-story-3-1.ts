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

async function runVerifyStory31() {
  loadEnvLocal();
  const { env } = await import("../../src/env");
  const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
  const { calculateStayPricing } = await import("../../src/lib/math/money");
  const {
    UpsertConsortiumConfigSchema,
    ALLOWED_MICRO_CANON_PCTS,
  } = await import("../../src/modules/consortium/validators");
  const {
    upsertConsortiumConfigAction,
    getHostConsortiumConfigAction,
    listHostConsortiumConfigsAction,
  } = await import("../../src/modules/consortium/actions");
  const {
    PUBLIC_CONSORTIUM_COLUMNS,
    FORBIDDEN_PRIVATE_CONSORTIUM_COLUMNS,
    getPublicPropertyBySlug,
    listPublicProperties,
  } = await import("../../src/modules/properties/queries");
  const { createBookingRequestAction } = await import(
    "../../src/modules/bookings/actions"
  );

  console.log(
    '=== [STORY 3.1 QA] Starting "Consorcio Friendly" Profile & Micro-Canon (1%-2%) Verification ==='
  );

  // 1. Verificar fronteras `server-only`, validación Zod y uso de `decimal.js`
  const consortiumActionsSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/consortium/actions.ts"),
    "utf8"
  );
  const consortiumValidatorsSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/consortium/validators.ts"),
    "utf8"
  );
  const consortiumPanelSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/components/properties/ConsortiumConfigPanel.tsx"),
    "utf8"
  );

  if (!consortiumActionsSrc.includes('import "server-only"')) {
    throw new Error('Missing `import "server-only"` in src/modules/consortium/actions.ts!');
  }
  if (!consortiumValidatorsSrc.includes('from "zod"')) {
    throw new Error("src/modules/consortium/validators.ts must use zod!");
  }
  if (
    !consortiumPanelSrc.includes('from "decimal.js"') ||
    !consortiumPanelSrc.includes("calculateStayPricing")
  ) {
    throw new Error(
      "src/components/properties/ConsortiumConfigPanel.tsx must use decimal.js and calculateStayPricing!"
    );
  }

  for (const privCol of FORBIDDEN_PRIVATE_CONSORTIUM_COLUMNS) {
    if (PUBLIC_CONSORTIUM_COLUMNS.includes(privCol)) {
      throw new Error(
        `CRITICAL: PUBLIC_CONSORTIUM_COLUMNS must never expose private column "${privCol}"!`
      );
    }
  }

  console.log(
    "[OK] 1/5 Security & architectural boundaries verified -> `server-only`, `zod`, `decimal.js` and private column exclusion active."
  );

  // 2. Verificar esquema Zod `UpsertConsortiumConfigSchema` (Subtarea 3.1.1 & AC-1)
  const samplePropUuid = crypto.randomUUID();
  for (const allowedPct of ALLOWED_MICRO_CANON_PCTS) {
    const okRes = UpsertConsortiumConfigSchema.safeParse({
      propertyId: samplePropUuid,
      consortiumName: "Consorcio Propietarios Libertador 2400",
      consortiumCuit: "30712345671", // se normaliza a 30-71234567-1 (Módulo 11 válido)
      porteriaWhatsapp: "5491144556677", // se normaliza a +5491144556677
      adminEmail: "ADMIN@LIBERTADOR2400.COM.AR",
      microCanonPct: allowedPct,
      consortiumCbuAlias: "consorcio.libertador.2400",
      active: true,
    });
    if (!okRes.success) {
      throw new Error(
        `UpsertConsortiumConfigSchema rejected valid microCanonPct=${allowedPct}: ${JSON.stringify(okRes.error.issues)}`
      );
    }
    if (
      okRes.data.consortiumCuit !== "30-71234567-1" ||
      okRes.data.porteriaWhatsapp !== "+5491144556677" ||
      okRes.data.adminEmail !== "admin@libertador2400.com.ar"
    ) {
      throw new Error(
        `Normalization mismatch in UpsertConsortiumConfigSchema: ${JSON.stringify(okRes.data)}`
      );
    }
  }

  const invalidPcts = [-1, 0.5, 1.25, 2.5, 3, 10];
  for (const badPct of invalidPcts) {
    const badRes = UpsertConsortiumConfigSchema.safeParse({
      propertyId: samplePropUuid,
      consortiumName: "Consorcio Test",
      porteriaWhatsapp: "+5491144556677",
      adminEmail: "admin@test.ar",
      microCanonPct: badPct,
    });
    if (badRes.success) {
      throw new Error(
        `UpsertConsortiumConfigSchema should have rejected invalid microCanonPct=${badPct}!`
      );
    }
  }

  const badCuitRes = UpsertConsortiumConfigSchema.safeParse({
    propertyId: samplePropUuid,
    consortiumName: "Consorcio Test",
    consortiumCuit: "30-71234567-9", // Dígito verificador inválido (debe ser 1)
    porteriaWhatsapp: "+5491144556677",
    adminEmail: "admin@test.ar",
    microCanonPct: 1.5,
  });
  if (badCuitRes.success) {
    throw new Error(
      "UpsertConsortiumConfigSchema should have rejected CUIT with invalid Modulo 11 check digit!"
    );
  }

  console.log(
    "[OK] 2/5 UpsertConsortiumConfigSchema (Zod) verified -> Allows strictly {0, 1, 1.5, 2}% Micro-Canon, E.164 WhatsApp & Modulo 11 CUIT."
  );

  // 3. Prueba de integración real en Supabase Cloud PostgreSQL (Subtareas 3.1.2, 3.1.4, AC-1 & AC-2)
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const testHostId = crypto.randomUUID();
  const otherHostId = crypto.randomUUID();
  const testGuestId = crypto.randomUUID();
  const testPropertyId = crypto.randomUUID();
  const testSlug = `e3s1-consorcio-${testPropertyId.slice(0, 8)}`;
  const encryptedPin = encryptAccessCode("PIN-E3S1-7741", testPropertyId);

  try {
    // Actualizar también el CUIT de la propiedad demo persistente si tenía el dígito verificador antiguo
    await client.query(
      `UPDATE public.consortium_configs
       SET consortium_cuit = '30-71234567-1', consortium_cbu_alias = COALESCE(consortium_cbu_alias, 'consorcio.thames.1845')
       WHERE consortium_cuit = '30-71234567-9'`
    );

    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES
         ($1, $2, '{"full_name":"Host Legítimo E3-S1"}'::jsonb, NOW(), NOW()),
         ($3, $4, '{"full_name":"Otro Host No Autorizado E3-S1"}'::jsonb, NOW(), NOW()),
         ($5, $6, '{"full_name":"Huésped E3-S1"}'::jsonb, NOW(), NOW())`,
      [
        testHostId,
        `host-31-${testHostId}@i-bita.ar`,
        otherHostId,
        `other-31-${otherHostId}@i-bita.ar`,
        testGuestId,
        `guest-31-${testGuestId}@i-bita.ar`,
      ]
    );

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES
         ($1, $2, 'Host Legítimo E3-S1', 'HOST', '20-12345678-6', '0000003100012345678901'),
         ($3, $4, 'Otro Host No Autorizado E3-S1', 'HOST', '20-12345678-6', '0000003100012345678902')`,
      [
        testHostId,
        `host-31-${testHostId}@i-bita.ar`,
        otherHostId,
        `other-31-${otherHostId}@i-bita.ar`,
      ]
    );

    await client.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES (
         $1, $2, $3, 'Departamento Belgrano R · Consorcio Friendly E3-S1',
         'Unidad funcional de prueba para configuración Consorcio Friendly y regla de Micro-Canon.',
         'CABA', 'Av. Crámer 2100, Belgrano', 'Piso 6 C (UF 22)',
         2, 'USD', 100.00, 20.00, TRUE, TRUE, 300,
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

    // 3a. Verificar que otro Anfitrión NO dueño reciba FORBIDDEN al intentar modificar o leer datos de administración
    const forbiddenUpsert = await upsertConsortiumConfigAction({
      propertyId: testPropertyId,
      consortiumName: "Intento Intruso",
      porteriaWhatsapp: "+5491199887766",
      adminEmail: "intruso@malicioso.com",
      microCanonPct: 2,
      active: true,
      hostId: otherHostId,
    });

    if (forbiddenUpsert.ok || forbiddenUpsert.error.code !== "FORBIDDEN") {
      throw new Error(
        `Expected FORBIDDEN when non-owner host attempts upsertConsortiumConfigAction, got: ${JSON.stringify(forbiddenUpsert)}`
      );
    }

    // 3b. Guardar configuración inicial con Micro-Canon = 1.50% por el Anfitrión dueño
    const initialUpsert = await upsertConsortiumConfigAction({
      propertyId: testPropertyId,
      consortiumName: "Consorcio Propietarios Av. Crámer 2100",
      consortiumCuit: "30-71234567-1",
      porteriaWhatsapp: "+5491155443322",
      adminEmail: "administracion@cramer2100.com.ar",
      microCanonPct: 1.5,
      consortiumCbuAlias: "consorcio.cramer.2100",
      active: true,
      hostId: testHostId,
    });

    if (!initialUpsert.ok) {
      throw new Error(
        `upsertConsortiumConfigAction failed for legitimate host: ${JSON.stringify(initialUpsert.error)}`
      );
    }

    if (
      initialUpsert.data.consortium_name !==
        "Consorcio Propietarios Av. Crámer 2100" ||
      initialUpsert.data.consortium_cuit !== "30-71234567-1" ||
      initialUpsert.data.porteria_whatsapp !== "+5491155443322" ||
      initialUpsert.data.admin_email !== "administracion@cramer2100.com.ar" ||
      initialUpsert.data.micro_canon_pct !== 1.5 ||
      initialUpsert.data.consortium_cbu_alias !== "consorcio.cramer.2100" ||
      initialUpsert.data.active !== true
    ) {
      throw new Error(
        `Saved consortium config mismatch: ${JSON.stringify(initialUpsert.data)}`
      );
    }

    // Verificar que otro Anfitrión NO pueda leer los datos privados de administración (getHostConsortiumConfigAction)
    const forbiddenRead = await getHostConsortiumConfigAction(
      testPropertyId,
      otherHostId
    );
    if (forbiddenRead.ok || forbiddenRead.error.code !== "FORBIDDEN") {
      throw new Error(
        `Expected FORBIDDEN when non-owner host attempts getHostConsortiumConfigAction, got: ${JSON.stringify(forbiddenRead)}`
      );
    }

    // Verificar que el Anfitrión dueño sí pueda leer su configuración completa
    const ownerRead = await getHostConsortiumConfigAction(
      testPropertyId,
      testHostId
    );
    if (
      !ownerRead.ok ||
      !ownerRead.data ||
      ownerRead.data.porteria_whatsapp !== "+5491155443322"
    ) {
      throw new Error(
        `getHostConsortiumConfigAction failed for owner: ${JSON.stringify(ownerRead)}`
      );
    }

    const hostListRes = await listHostConsortiumConfigsAction(testHostId);
    if (!hostListRes.ok || !hostListRes.data[testPropertyId]) {
      throw new Error(
        `listHostConsortiumConfigsAction did not return property config for host: ${JSON.stringify(hostListRes)}`
      );
    }

    console.log(
      "[OK] 3/5 AC-1 verified -> upsertConsortiumConfigAction & getHostConsortiumConfigAction enforce host ownership (FORBIDDEN on non-owner) and persist in public.consortium_configs."
    );

    // 4. Verificar impacto inmediato en `/p/[slug]` (`getPublicPropertyBySlug`) y que CERO datos privados de administración se filtren (Subtarea 3.1.4 & AC-2)
    const publicProp15 = await getPublicPropertyBySlug(testSlug);
    if (
      !publicProp15 ||
      !publicProp15.consortium_config ||
      publicProp15.consortium_config.active !== true ||
      publicProp15.consortium_config.consortium_name !==
        "Consorcio Propietarios Av. Crámer 2100" ||
      publicProp15.consortium_config.micro_canon_pct !== 1.5
    ) {
      throw new Error(
        `getPublicPropertyBySlug did not reflect active consortium_config (1.5%): ${JSON.stringify(publicProp15)}`
      );
    }

    const serializedPublic = JSON.stringify(publicProp15);
    if (
      serializedPublic.includes("consortium_cuit") ||
      serializedPublic.includes("30-71234567-1") ||
      serializedPublic.includes("porteria_whatsapp") ||
      serializedPublic.includes("+5491155443322") ||
      serializedPublic.includes("admin_email") ||
      serializedPublic.includes("administracion@cramer2100.com.ar") ||
      serializedPublic.includes("consortium_cbu_alias") ||
      serializedPublic.includes("consorcio.cramer.2100") ||
      serializedPublic.includes("access_code_")
    ) {
      throw new Error(
        "CRITICAL SECURITY LEAK: getPublicPropertyBySlug leaked private consortium administration data or access_code_*!"
      );
    }

    // Actualizar mediante ON CONFLICT (property_id) DO UPDATE el Micro-Canon de 1.5% a 2.0%
    const updatedUpsert = await upsertConsortiumConfigAction({
      propertyId: testPropertyId,
      consortiumName: "Consorcio Propietarios Av. Crámer 2100",
      consortiumCuit: "30-71234567-1",
      porteriaWhatsapp: "+5491155443322",
      adminEmail: "administracion@cramer2100.com.ar",
      microCanonPct: 2,
      consortiumCbuAlias: "consorcio.cramer.2100",
      active: true,
      hostId: testHostId,
    });

    if (!updatedUpsert.ok || updatedUpsert.data.micro_canon_pct !== 2) {
      throw new Error(
        `ON CONFLICT DO UPDATE failed to update micro_canon_pct to 2%: ${JSON.stringify(updatedUpsert)}`
      );
    }

    const publicProp20 = await getPublicPropertyBySlug(testSlug);
    if (
      !publicProp20?.consortium_config ||
      publicProp20.consortium_config.micro_canon_pct !== 2
    ) {
      throw new Error(
        "getPublicPropertyBySlug did not immediately reflect updated micro_canon_pct = 2%!"
      );
    }

    const listedPublic = await listPublicProperties({ corridor: "CABA" });
    const listedMatch = listedPublic.find((p) => p.id === testPropertyId);
    if (
      !listedMatch?.consortium_config ||
      listedMatch.consortium_config.micro_canon_pct !== 2
    ) {
      throw new Error(
        "listPublicProperties did not include updated consortium_config!"
      );
    }

    console.log(
      "[OK] 4/5 Subtarea 3.1.4 verified -> ON CONFLICT DO UPDATE immediately updates /p/[slug] and Marketplace badge while stripping all private administration fields (CUIT, WhatsApp, Email, CBU)."
    );

    // 5. Verificar cálculo de Split con `decimal.js` en `calculateStayPricing` y `createBookingRequestAction` (AC-2)
    // Estadía de 10 noches a 100 USDT/noche = 1000.00 USDT alojamiento neto.
    // Con Micro-Canon = 2.00% -> consortiumCanonAmount = 20.00 USDT, hostNetPayout = 980.00 USDT, totalGuestPayable = 1110.00 USDT (sin recargo al huésped).
    const pricingZeroCanon = calculateStayPricing({
      nightlyRate: 100,
      nights: 10,
      microCanonPct: 0,
      baseCurrency: "USD",
      paymentCurrency: "USDT",
    });

    const bookingRes = await createBookingRequestAction({
      propertyId: testPropertyId,
      checkIn: "2027-10-01",
      checkOut: "2027-10-11", // 10 noches
      declaredAdultsCount: 2,
      paymentCurrency: "USDT",
      guestId: testGuestId,
    });

    if (!bookingRes.ok) {
      throw new Error(
        `createBookingRequestAction failed on Consortium Friendly property: ${JSON.stringify(bookingRes.error)}`
      );
    }

    const { booking, pricing } = bookingRes.data;
    if (
      pricing.consortiumCanonPct !== "2.00" ||
      booking.consortiumCanonAmount !== "20.00" ||
      booking.hostNetAmount !== "980.00" ||
      booking.platformFeeAmount !== "110.00" ||
      booking.totalAmount !== "1110.00" ||
      booking.totalAmount !== pricingZeroCanon.totalGuestPayable
    ) {
      throw new Error(
        `Micro-Canon decimal.js split mismatch: expected canon=20.00, hostNet=980.00, total=1110.00, got: ${JSON.stringify(booking)}`
      );
    }

    console.log(
      `[OK] 5/5 AC-2 verified -> decimal.js Micro-Canon Split exact: Net=1000.00 USDT, Consortium Canon (2.00%)=${booking.consortiumCanonAmount} USDT, Host Net=${booking.hostNetAmount} USDT, Guest Total=${booking.totalAmount} USDT (0% extra cost to guest).`
    );
    console.log(
      '=== [PASS] STORY 3.1 VERIFIED: "Consorcio Friendly" Profile & Micro-Canon (1%-2%) OK ==='
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
    await client.query("DELETE FROM auth.users WHERE id IN ($1, $2, $3)", [
      testHostId,
      otherHostId,
      testGuestId,
    ]);
    await client.end();
  }
}

runVerifyStory31().catch((err) => {
  console.error("=== [FAIL] STORY 3.1 VERIFICATION FAILED ===", err);
  process.exit(1);
});

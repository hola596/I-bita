import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Module from "node:module";
import { Client } from "pg";
import { NextRequest } from "next/server";

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

async function runGateEpic2() {
  loadEnvLocal();
  const { env } = await import("../../src/env");
  const { AppError } = await import("../../src/lib/errors/app-error");
  const { encryptAccessCode } = await import("../../src/lib/crypto/aes-gcm");
  const { assertSafeExternalUrl } = await import("../../src/modules/ical/ssrf-guard");
  const {
    syncExternalIcalAction,
    parseIcalContentWithNodeIcalAction,
    ingestNormalizedIcalEventsAction,
    generatePropertyIcalFeedAction,
  } = await import("../../src/modules/ical/actions");
  const { GET: getIcalRouteHandler } = await import(
    "../../src/app/api/ical/[propertyId]/route"
  );

  console.log("=== [GATE EPIC 2] Starting iCal Bidirectional Sync & Anti-SSRF Verification ===");

  // 0. Verificar presencia de `import "server-only"` en módulos sensibles de iCal
  const ssrfGuardSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/ical/ssrf-guard.ts"),
    "utf8"
  );
  const icalActionsSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/ical/actions.ts"),
    "utf8"
  );
  if (
    !ssrfGuardSrc.includes('import "server-only"') ||
    !icalActionsSrc.includes('import "server-only"')
  ) {
    throw new Error('Missing `import "server-only"` in src/modules/ical modules!');
  }

  // 1. AC-1 & AC-4: Verificar bloqueo inmediato de SSRF ante loopback, rangos privados y Cloud Metadata
  const mandatorySsrfPayloads = [
    "http://127.0.0.1:5432/calendar.ics",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost:3000/api/internal",
    "http://10.0.0.42/private-feed.ics",
    "http://172.16.20.5/private-feed.ics",
    "http://192.168.1.1/admin.ics",
    "http://0.0.0.0:8080/feed.ics",
    "http://[::1]:5432/calendar.ics",
    "http://[::ffff:169.254.169.254]/latest/meta-data",
  ];

  const dummyPropId = crypto.randomUUID();

  for (const maliciousUrl of mandatorySsrfPayloads) {
    // 1a. Probar directamente assertSafeExternalUrl
    let guardBlockedCode: string | null = null;
    let guardStatus: number | null = null;
    try {
      await assertSafeExternalUrl(maliciousUrl);
    } catch (err) {
      if (err instanceof AppError) {
        guardBlockedCode = err.code;
        guardStatus = err.statusCode;
      }
    }

    if (guardBlockedCode !== "SSRF_BLOCKED_ERROR" || guardStatus !== 422) {
      throw new Error(
        `assertSafeExternalUrl DID NOT block malicious URL "${maliciousUrl}" with SSRF_BLOCKED_ERROR (422). Got: ${guardBlockedCode} (${guardStatus})`
      );
    }

    // 1b. Probar pasando la URL al sincronizador syncExternalIcalAction
    let actionBlockedCode: string | null = null;
    try {
      const res = await syncExternalIcalAction(dummyPropId, maliciousUrl, "Airbnb");
      if (!res.ok) {
        actionBlockedCode = res.error.code;
      }
    } catch (err) {
      if (err instanceof AppError) {
        actionBlockedCode = err.code;
      }
    }

    if (actionBlockedCode !== "SSRF_BLOCKED_ERROR") {
      throw new Error(
        `syncExternalIcalAction DID NOT block malicious URL "${maliciousUrl}" with SSRF_BLOCKED_ERROR. Got: ${actionBlockedCode}`
      );
    }
  }

  // 1c. Probar simulación de DNS Rebinding (dominio externo que resuelve a 169.254.169.254 o 127.0.0.1)
  let dnsRebindBlocked = false;
  try {
    await assertSafeExternalUrl(
      "https://rebind-attacker.example.com/calendar.ics",
      async () => [{ address: "169.254.169.254", family: 4 }]
    );
  } catch (err) {
    if (err instanceof AppError && err.code === "SSRF_BLOCKED_ERROR") {
      dnsRebindBlocked = true;
    }
  }
  if (!dnsRebindBlocked) {
    throw new Error("DNS Rebinding to 169.254.169.254 was not blocked by assertSafeExternalUrl!");
  }

  console.log(
    "[OK] 1/4 Anti-SSRF Pre-Flight Shield verified -> 127.0.0.1:5432, 169.254.169.254, localhost, 10/8, 172.16/12, 192.168/16, ::1 & DNS Rebinding blocked with SSRF_BLOCKED_ERROR (422)."
  );

  // 2. AC-2: Verificar parseo RFC 5545 con node-ical en zona America/Argentina/Buenos_Aires,
  //    ingesta idempotente por external_ical_uid y captura de colisiones SQLSTATE 23P01 (btree_gist)
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const testHostId = crypto.randomUUID();
  const testPropertyId = crypto.randomUUID();
  const existingBookingId = crypto.randomUUID();
  const testSlug = `gate2-palermo-${testPropertyId.slice(0, 8)}`;
  const secretPin = "PIN-GATE2-SECRET-7741";
  const encryptedPin = encryptAccessCode(secretPin, testPropertyId);
  const uidValidBlock = `airbnb-block-${testPropertyId.slice(0, 8)}@airbnb.com`;
  const uidOverlapBlock = `airbnb-overlap-${testPropertyId.slice(0, 8)}@airbnb.com`;

  try {
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, $2, '{"full_name":"Gate2 Host"}'::jsonb, NOW(), NOW())`,
      [testHostId, `gate2-${testHostId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES ($1, $2, 'Gate2 Host', 'HOST', '20-12345678-6', '0000003100012345678901')`,
      [testHostId, `gate2-${testHostId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES ($1, $2, $3, 'Loft Gate 2 Palermo Soho', 'Test iCal Sync & Anti-SSRF', 'CABA', 'Gorriti 4800', 'Piso 3 A', 2, 'USD', 80, 20, $4, $5, $6, TRUE)`,
      [
        testPropertyId,
        testHostId,
        testSlug,
        encryptedPin.ciphertext,
        encryptedPin.iv,
        encryptedPin.authTag,
      ]
    );

    // Insertar una reserva activa en I-bita del 2027-05-10 al 2027-05-15
    await client.query(
      `INSERT INTO public.bookings (id, property_id, guest_id, check_in, check_out, declared_adults_count, status)
       VALUES ($1, $2, $3, '2027-05-10', '2027-05-15', 2, 'PAID_PENDING_KYC')`,
      [existingBookingId, testPropertyId, testHostId]
    );

    // Construir un feed .ics externo RFC 5545 con 2 eventos VEVENT:
    // - Evento 1 (2027-05-01 a 2027-05-05): libre -> debe insertarse como ICAL_BLOCK
    // - Evento 2 (2027-05-12 a 2027-05-16): se solapa con la reserva activa -> debe ser rechazado por btree_gist (SQLSTATE 23P01)
    const sampleExternalIcs = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN",
      "CALSCALE:GREGORIAN",
      "X-WR-TIMEZONE:America/Argentina/Buenos_Aires",
      "BEGIN:VEVENT",
      `UID:${uidValidBlock}`,
      "DTSTAMP:20261116T120000Z",
      "DTSTART;VALUE=DATE:20270501",
      "DTEND;VALUE=DATE:20270505",
      "SUMMARY:Airbnb (Not available)",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "BEGIN:VEVENT",
      `UID:${uidOverlapBlock}`,
      "DTSTAMP:20261116T120000Z",
      "DTSTART;TZID=America/Argentina/Buenos_Aires:20270512T150000",
      "DTEND;TZID=America/Argentina/Buenos_Aires:20270516T110000",
      "SUMMARY:Airbnb Overlapping Reservation",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const parsedEvents = await parseIcalContentWithNodeIcalAction(sampleExternalIcs);
    if (parsedEvents.length !== 2) {
      throw new Error(`Expected 2 parsed VEVENT items from node-ical, got ${parsedEvents.length}`);
    }
    if (
      parsedEvents[0]?.checkIn !== "2027-05-01" ||
      parsedEvents[0]?.checkOut !== "2027-05-05" ||
      parsedEvents[1]?.checkIn !== "2027-05-12" ||
      parsedEvents[1]?.checkOut !== "2027-05-16"
    ) {
      throw new Error(
        `Timezone normalization mismatch in America/Argentina/Buenos_Aires: ${JSON.stringify(parsedEvents)}`
      );
    }

    const firstSync = await ingestNormalizedIcalEventsAction({
      propertyId: testPropertyId,
      feedUrl: "https://www.airbnb.com.ar/calendar/ical/123456789.ics",
      sourceName: "Airbnb",
      events: parsedEvents,
    });

    if (
      firstSync.insertedCount !== 1 ||
      firstSync.overlappingConflictsCount !== 1 ||
      firstSync.conflicts[0]?.sqlState !== "23P01"
    ) {
      throw new Error(
        `Unexpected first sync result: ${JSON.stringify(firstSync)}`
      );
    }

    // Re-ejecutar la ingesta con los mismos eventos para demostrar idempotencia por external_ical_uid
    const secondSync = await ingestNormalizedIcalEventsAction({
      propertyId: testPropertyId,
      feedUrl: "https://www.airbnb.com.ar/calendar/ical/123456789.ics",
      sourceName: "Airbnb",
      events: parsedEvents,
    });

    if (
      secondSync.insertedCount !== 0 ||
      secondSync.unchangedCount !== 1 ||
      secondSync.overlappingConflictsCount !== 1
    ) {
      throw new Error(
        `Idempotency check failed on second sync: ${JSON.stringify(secondSync)}`
      );
    }

    console.log(
      `[OK] 2/4 node-ical RFC 5545 ingestion verified -> America/Argentina/Buenos_Aires normalization OK, idempotent by external_ical_uid OK, btree_gist collision captured (SQLSTATE=${firstSync.conflicts[0]?.sqlState}).`
    );

    // 3. AC-3 & AC-4: Verificar exportación con ical-generator vía Route Handler GET /api/ical/[propertyId].ics
    const mockReq = new NextRequest(
      `http://localhost:3000/api/ical/${testPropertyId}.ics`,
      { method: "GET" }
    );
    const routeRes = await getIcalRouteHandler(mockReq, {
      params: Promise.resolve({ propertyId: `${testPropertyId}.ics` }),
    });

    const contentType = routeRes.headers.get("content-type") ?? "";
    const icsBody = await routeRes.text();

    if (routeRes.status !== 200) {
      throw new Error(`Expected HTTP 200 from GET /api/ical/[propertyId].ics, got ${routeRes.status}`);
    }
    if (!contentType.toLowerCase().includes("text/calendar; charset=utf-8")) {
      throw new Error(`Expected Content-Type: text/calendar; charset=utf-8, got: ${contentType}`);
    }
    if (
      !icsBody.includes("BEGIN:VCALENDAR") ||
      !icsBody.includes("BEGIN:VEVENT") ||
      !icsBody.includes("END:VEVENT") ||
      !icsBody.includes("END:VCALENDAR") ||
      !icsBody.includes("America/Argentina/Buenos_Aires") ||
      !icsBody.includes(uidValidBlock)
    ) {
      throw new Error(`Exported .ics body failed RFC 5545 validation:\n${icsBody}`);
    }

    // Garantizar que el feed público jamás filtre el PIN en texto plano ni el ciphertext
    if (
      icsBody.includes(secretPin) ||
      icsBody.includes(encryptedPin.ciphertext)
    ) {
      throw new Error("CRITICAL SECURITY FAILURE: .ics export leaked access code data!");
    }

    const directFeed = await generatePropertyIcalFeedAction(testPropertyId);
    if (directFeed.eventsCount !== 2) {
      throw new Error(`Expected 2 active events in exported feed, got ${directFeed.eventsCount}`);
    }

    console.log(
      `[OK] 3/4 GET /api/ical/[propertyId].ics verified -> HTTP 200, Content-Type="${contentType}", events=${directFeed.eventsCount}, timezone=America/Argentina/Buenos_Aires.`
    );

    // 4. Re-parsear el calendario exportado por I-bita con node-ical (Round-Trip Bidireccional completo)
    const roundTripEvents = await parseIcalContentWithNodeIcalAction(icsBody);
    if (roundTripEvents.length !== 2) {
      throw new Error(`Round-trip parse of exported .ics expected 2 VEVENTs, got ${roundTripEvents.length}`);
    }
    console.log(
      "[OK] 4/4 Bidirectional round-trip (ical-generator export -> node-ical parse) verified with 0 data leaks."
    );

    console.log("[PASS] GATE EPIC 2 VERIFIED");
  } finally {
    await client.query("DELETE FROM public.ical_feeds WHERE property_id = $1", [
      testPropertyId,
    ]);
    await client.query("DELETE FROM public.bookings WHERE property_id = $1", [
      testPropertyId,
    ]);
    await client.query("DELETE FROM public.properties WHERE id = $1", [
      testPropertyId,
    ]);
    await client.query("DELETE FROM auth.users WHERE id = $1", [testHostId]);
    await client.end();
  }
}

runGateEpic2().catch((err) => {
  console.error("=== [FAIL] GATE EPIC 2 FAILED ===", err);
  process.exit(1);
});

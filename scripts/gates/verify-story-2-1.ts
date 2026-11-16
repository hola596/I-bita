import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Module from "node:module";
import { Client } from "pg";

// Permitir que tsx cargue módulos marcados con `import "server-only"` en entorno CLI de servidor
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

async function runVerifyStory21() {
  loadEnvLocal();
  const { env } = await import("../../src/env");
  const { encryptAccessCode, decryptAccessCode } = await import(
    "../../src/lib/crypto/aes-gcm"
  );
  const {
    CreatePropertySchema,
    validatePhotoUpload,
    MAX_IMAGE_SIZE_BYTES,
  } = await import("../../src/modules/properties/validators");
  const {
    PUBLIC_PROPERTY_COLUMNS,
    getPublicPropertyBySlug,
    listPublicProperties,
    sanitizePublicPropertyRow,
  } = await import("../../src/modules/properties/queries");

  console.log("=== [STORY 2.1 QA] Starting End-to-End Verification ===");

  // 1. Verificar que los módulos de cifrado y acciones contengan `import "server-only"`
  const aesSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/lib/crypto/aes-gcm.ts"),
    "utf8"
  );
  const actionsSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/properties/actions.ts"),
    "utf8"
  );
  const queriesSource = fs.readFileSync(
    path.resolve(process.cwd(), "src/modules/properties/queries.ts"),
    "utf8"
  );

  if (
    !aesSource.includes('import "server-only"') ||
    !actionsSource.includes('import "server-only"') ||
    !queriesSource.includes('import "server-only"')
  ) {
    throw new Error("Missing `import \"server-only\"` in sensitive server modules!");
  }
  console.log("[OK] 1/5 `server-only` boundary enforced in aes-gcm.ts, actions.ts & queries.ts.");

  // 2. Verificar validadores Zod de Unidad Funcional y validación de fotos (formatos y tamaños máximos)
  const validProp = CreatePropertySchema.safeParse({
    title: "Loft Luminoso en Palermo Soho",
    slug: "loft-luminoso-palermo-soho",
    description:
      "Unidad funcional equipada para estadía corta y media estadía con fibra simétrica 300 Mbps y seguridad 24h.",
    corridor: "CABA",
    address_line: "Thames 1845, CABA",
    unit_identifier: "Piso 4 Depto B",
    max_adults: 3,
    base_currency: "USD",
    nightly_rate: 75,
    monthly_discount_pct: 25,
    absorb_installments_cost: true,
    accepts_usdt: true,
    wifi_speed_mbps: 300,
    images: [
      {
        url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp",
        alt: "Living comedor luminoso",
        width: 1200,
        height: 900,
        mimeType: "image/webp",
        sizeBytes: 215000,
      },
    ],
    accessCodePlain: "PIN-YALE-2026-#9981",
  });

  if (!validProp.success) {
    throw new Error(
      `Valid property rejected by CreatePropertySchema: ${JSON.stringify(validProp.error.issues)}`
    );
  }

  const invalidSlug = CreatePropertySchema.safeParse({
    ...validProp.data,
    slug: "Slug Con Mayusculas Y Espacios!",
  });
  if (invalidSlug.success) {
    throw new Error("Invalid URL-unsafe slug was not rejected!");
  }

  const invalidDiscount = CreatePropertySchema.safeParse({
    ...validProp.data,
    monthly_discount_pct: 10, // Debe estar entre 15% y 50%
  });
  if (invalidDiscount.success) {
    throw new Error("Out-of-range monthly_discount_pct (10%) was not rejected!");
  }

  // Validar fotos: formato permitido y tamaño <= 5 MB
  const validPhotoMeta = validatePhotoUpload({
    fileName: "living-palermo.webp",
    mimeType: "image/webp",
    sizeBytes: 340_000,
    width: 1200,
    height: 900,
  });
  if (validPhotoMeta.width !== 1200 || validPhotoMeta.height !== 900) {
    throw new Error("Photo dimensions not preserved for CLS = 0");
  }

  let rejectedInvalidMime = false;
  try {
    validatePhotoUpload({
      fileName: "payload.svg",
      mimeType: "image/svg+xml" as "image/webp",
      sizeBytes: 12_000,
    });
  } catch {
    rejectedInvalidMime = true;
  }
  if (!rejectedInvalidMime) {
    throw new Error("Unsupported image format (SVG) was not rejected!");
  }

  let rejectedOversizedPhoto = false;
  try {
    validatePhotoUpload({
      fileName: "huge-raw-photo.png",
      mimeType: "image/png",
      sizeBytes: MAX_IMAGE_SIZE_BYTES + 1024,
    });
  } catch {
    rejectedOversizedPhoto = true;
  }
  if (!rejectedOversizedPhoto) {
    throw new Error("Oversized photo (> 5 MB) was not rejected!");
  }
  console.log(
    "[OK] 2/5 Zod validators verified -> slug URL-safe, corridor, discount (15%-50%), photo MIME & 5MB size limit OK."
  );

  // 3. Verificar cifrado y descifrado AES-256-GCM de punta a punta con propertyId como AAD
  const propIdA = crypto.randomUUID();
  const propIdB = crypto.randomUUID();
  const plainPin = "PIN-YALE-2026-#9981";

  const encrypted = encryptAccessCode(plainPin, propIdA);
  if (
    Buffer.from(encrypted.iv, "hex").byteLength !== 12 ||
    Buffer.from(encrypted.authTag, "hex").byteLength !== 16 ||
    encrypted.ciphertext.includes(plainPin)
  ) {
    throw new Error("Invalid AES-256-GCM encrypted payload structure!");
  }

  const decryptedOk = decryptAccessCode(encrypted, propIdA);
  if (decryptedOk !== plainPin) {
    throw new Error(`Decrypted PIN mismatch: expected ${plainPin}, got ${decryptedOk}`);
  }

  let aadMismatchBlocked = false;
  try {
    decryptAccessCode(encrypted, propIdB);
  } catch {
    aadMismatchBlocked = true;
  }
  if (!aadMismatchBlocked) {
    throw new Error("AES-256-GCM AAD substitution with another propertyId was not blocked!");
  }
  console.log(
    "[OK] 3/5 AES-256-GCM encryption/decryption with propertyId AAD verified end-to-end."
  );

  // 4. Verificar exclusión estricta de access_code_* en PUBLIC_PROPERTY_COLUMNS y sanitizador
  if (
    PUBLIC_PROPERTY_COLUMNS.includes("access_code_ciphertext") ||
    PUBLIC_PROPERTY_COLUMNS.includes("access_code_iv") ||
    PUBLIC_PROPERTY_COLUMNS.includes("access_code_auth_tag")
  ) {
    throw new Error("PUBLIC_PROPERTY_COLUMNS must never include access_code_* columns!");
  }

  const sanitizedSample = sanitizePublicPropertyRow({
    id: propIdA,
    host_id: crypto.randomUUID(),
    slug: "test-sanitized",
    title: "Unidad Test",
    description: "Descripción de prueba",
    corridor: "CABA",
    address_line: "Thames 1800",
    unit_identifier: "4B",
    max_adults: 2,
    base_currency: "USD",
    nightly_rate: 70,
    monthly_discount_pct: 20,
    access_code_ciphertext: encrypted.ciphertext,
    access_code_iv: encrypted.iv,
    access_code_auth_tag: encrypted.authTag,
    accessCodePlain: plainPin,
  });

  if (
    "access_code_ciphertext" in sanitizedSample ||
    "access_code_iv" in sanitizedSample ||
    "access_code_auth_tag" in sanitizedSample ||
    "accessCodePlain" in sanitizedSample
  ) {
    throw new Error("sanitizePublicPropertyRow leaked sensitive access code fields!");
  }
  console.log(
    "[OK] 4/5 AC-2 verified -> PUBLIC_PROPERTY_COLUMNS & sanitizePublicPropertyRow strip all access_code_* fields."
  );

  // 5. Prueba de integración real contra Supabase Cloud (INSERT + SELECT público + Decrypt en servidor)
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const testHostId = crypto.randomUUID();
  const testSlug = `e2s1-palermo-${propIdA.slice(0, 8)}`;

  try {
    await client.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES ($1, $2, '{"full_name":"Host Story 2.1"}'::jsonb, NOW(), NOW())`,
      [testHostId, `host-21-${testHostId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil, payout_cbu_cvu)
       VALUES ($1, $2, 'Host Story 2.1', 'HOST', '20-12345678-6', '0000003100012345678901')`,
      [testHostId, `host-21-${testHostId}@i-bita.ar`]
    );

    await client.query(
      `INSERT INTO public.properties (
         id, host_id, slug, title, description, corridor, address_line, unit_identifier,
         max_adults, base_currency, nightly_rate, monthly_discount_pct, images,
         access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, TRUE)`,
      [
        propIdA,
        testHostId,
        testSlug,
        validProp.data.title,
        validProp.data.description,
        validProp.data.corridor,
        validProp.data.address_line,
        validProp.data.unit_identifier,
        validProp.data.max_adults,
        validProp.data.base_currency,
        validProp.data.nightly_rate,
        validProp.data.monthly_discount_pct,
        JSON.stringify(validProp.data.images),
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
      ]
    );

    // Consultar mediante getPublicPropertyBySlug y listPublicProperties (AC-2)
    const publicBySlug = await getPublicPropertyBySlug(testSlug);
    if (!publicBySlug || publicBySlug.id !== propIdA) {
      throw new Error("getPublicPropertyBySlug failed to retrieve published property");
    }
    if (
      "access_code_ciphertext" in publicBySlug ||
      "access_code_iv" in publicBySlug ||
      "access_code_auth_tag" in publicBySlug
    ) {
      throw new Error("getPublicPropertyBySlug exposed access_code_* columns!");
    }

    const publicList = await listPublicProperties({ corridor: "CABA" });
    const foundInList = publicList.find((p) => p.id === propIdA);
    if (!foundInList) {
      throw new Error("listPublicProperties did not include published CABA property");
    }
    if (
      "access_code_ciphertext" in foundInList ||
      "access_code_iv" in foundInList ||
      "access_code_auth_tag" in foundInList
    ) {
      throw new Error("listPublicProperties exposed access_code_* columns!");
    }

    // Verificar en DB que el PIN cifrado desencripta exactamente con propIdA
    const dbVaultRes = await client.query<{
      access_code_ciphertext: string;
      access_code_iv: string;
      access_code_auth_tag: string;
    }>(
      `SELECT access_code_ciphertext, access_code_iv, access_code_auth_tag
       FROM public.properties WHERE id = $1`,
      [propIdA]
    );
    const vaultRow = dbVaultRes.rows[0];
    if (!vaultRow) {
      throw new Error("Property row not found in database!");
    }
    const recoveredFromDb = decryptAccessCode(
      {
        ciphertext: vaultRow.access_code_ciphertext,
        iv: vaultRow.access_code_iv,
        authTag: vaultRow.access_code_auth_tag,
      },
      propIdA
    );
    if (recoveredFromDb !== plainPin) {
      throw new Error("Decryption from Supabase PostgreSQL row failed!");
    }

    console.log(
      `[OK] 5/5 Supabase Cloud persistence, public query isolation (getPublicPropertyBySlug / listPublicProperties) & AES-256-GCM DB round-trip verified.`
    );
    console.log(
      "=== [PASS] STORY 2.1 VERIFIED: Functional Units, Optimized Photos (CLS=0) & AES-256-GCM AAD OK ==="
    );
  } finally {
    await client.query("DELETE FROM public.properties WHERE id = $1", [propIdA]);
    await client.query("DELETE FROM auth.users WHERE id = $1", [testHostId]);
    await client.end();
  }
}

runVerifyStory21().catch((err) => {
  console.error("=== [FAIL] STORY 2.1 VERIFICATION FAILED ===", err);
  process.exit(1);
});

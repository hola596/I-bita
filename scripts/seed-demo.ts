import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { Client } from "pg";
import crypto from "node:crypto";

const origLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown })._load =
  function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return origLoad.call(this, request, ...rest);
  };

// dynamic import below inside seedDemoData

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

loadEnvLocal();

const DEMO_HOST_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_GUEST_ID = "00000000-0000-4000-8000-000000000002";
const DEMO_PROPERTY_ID = "00000000-0000-4000-8000-000000000010";
export const DEMO_MID_TERM_BOOKING_ID = "00000000-0000-4000-8000-000000000100";
export const DEMO_INVITE_TOKEN = "00000000-0000-4000-8000-000000000777";

export async function seedDemoData() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is missing in .env.local");

  const db = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await db.connect();
  console.log("[SEED] Connected to Supabase PostgreSQL.");

  try {
    // 1. Usuarios en auth.users y perfiles en public.profiles
    await db.query(
      `INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
       VALUES 
         ($1, 'anfitrion@i-bita.ar', '{"full_name":"Martina Rossi (Anfitriona)"}'::jsonb, NOW(), NOW()),
         ($2, 'viajero@i-bita.ar', '{"full_name":"Lucas Benítez (Huésped)"}'::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
      [DEMO_HOST_ID, DEMO_GUEST_ID]
    );

    await db.query(
      `INSERT INTO public.profiles (id, email, full_name, role, cuit_cuil)
       VALUES 
         ($1, 'anfitrion@i-bita.ar', 'Martina Rossi', 'HOST', '27-35123456-4'),
         ($2, 'viajero@i-bita.ar', 'Lucas Benítez', 'GUEST', '20-38654321-9')
       ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name`,
      [DEMO_HOST_ID, DEMO_GUEST_ID]
    );

    // 2. Propiedad Demo publicada
    let propId = DEMO_PROPERTY_ID;
    const existingProp = await db.query<{ id: string }>(
      `SELECT id FROM public.properties WHERE slug = 'loft-luminoso-palermo-soho' LIMIT 1`
    );
    if (existingProp.rows.length > 0) {
      propId = existingProp.rows[0]!.id;
    }

    const { encryptAccessCode } = await import("../src/lib/crypto/aes-gcm");
    const enc = encryptAccessCode("PIN-4829-SOHO", propId);
    const demoImages = [
      {
        url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80",
        alt: "Living luminoso con ventanales en Palermo Soho",
        order: 1,
      },
      {
        url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80",
        alt: "Dormitorio principal con cama King",
        order: 2,
      },
      {
        url: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80",
        alt: "Cocina moderna integrada equipada",
        order: 3,
      },
      {
        url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80",
        alt: "Baño completo con ducha escocesa",
        order: 4,
      },
      {
        url: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
        alt: "Balcón aterrazado con vista abierta",
        order: 5,
      },
    ];

    if (existingProp.rows.length > 0) {
      await db.query(
        `UPDATE public.properties SET
           host_id = $1,
           title = 'Loft de Diseño en Palermo Soho · Balcón & Coworking',
           description = 'Espectacular departamento monoambiente de diseño industrial en el corazón de Palermo Soho. Equipado para estadías cortas o medias estadías de nómades digitales y profesionales (30 a 180 días). Edificio Consorcio Friendly con portería digital, WiFi de alta velocidad simétrico y cerradura inteligente.',
           corridor = 'CABA',
           address_line = 'Gorriti 4800',
           unit_identifier = 'Piso 4 Departamento B',
           max_adults = 2,
           base_currency = 'ARS',
           nightly_rate = 65000.00,
           monthly_discount_pct = 20,
           absorb_installments_cost = FALSE,
           accepts_usdt = TRUE,
           wifi_speed_mbps = 300,
           access_code_ciphertext = $2,
           access_code_iv = $3,
           access_code_auth_tag = $4,
           is_published = TRUE,
           images = $5::jsonb
         WHERE id = $6`,
        [DEMO_HOST_ID, enc.ciphertext, enc.iv, enc.authTag, JSON.stringify(demoImages), propId]
      );
    } else {
      await db.query(
        `INSERT INTO public.properties (
           id, host_id, slug, title, description, corridor, address_line, unit_identifier,
           max_adults, base_currency, nightly_rate, monthly_discount_pct,
           absorb_installments_cost, accepts_usdt, wifi_speed_mbps,
           access_code_ciphertext, access_code_iv, access_code_auth_tag, is_published, images
         ) VALUES (
           $1, $2, 'loft-luminoso-palermo-soho', 'Loft de Diseño en Palermo Soho · Balcón & Coworking',
           'Espectacular departamento monoambiente de diseño industrial en el corazón de Palermo Soho. Equipado para estadías cortas o medias estadías de nómades digitales y profesionales (30 a 180 días). Edificio Consorcio Friendly con portería digital, WiFi de alta velocidad simétrico y cerradura inteligente.',
           'CABA', 'Gorriti 4800', 'Piso 4 Departamento B', 2, 'ARS', 65000.00, 20,
           FALSE, TRUE, 300, $3, $4, $5, TRUE, $6::jsonb
         )`,
        [DEMO_PROPERTY_ID, DEMO_HOST_ID, enc.ciphertext, enc.iv, enc.authTag, JSON.stringify(demoImages)]
      );
    }

    // 3. Configuración de Consorcio Friendly
    await db.query(
      `INSERT INTO public.consortium_configs (
         id, property_id, consortium_name, consortium_cuit, porteria_whatsapp, admin_email, micro_canon_pct, consortium_cbu_alias, active
       ) VALUES (
         gen_random_uuid(), $1, 'Consorcio Edificio Gorriti 4800', '30-71234567-8', '+5491147710000', 'admin@gorriti4800.com.ar', 1.5, 'consorcio.gorriti', TRUE
       )
       ON CONFLICT (property_id) DO UPDATE SET active = TRUE, micro_canon_pct = 1.5`,
      [propId]
    );

    // 4. Reserva Demo de Media Estadía (60 noches) confirmada
    const checkIn = new Date();
    checkIn.setDate(checkIn.getDate() + 2);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkOut.getDate() + 60);

    await db.query(
      `INSERT INTO public.bookings (
         id, property_id, guest_id, check_in, check_out,
         payment_currency, total_amount, platform_fee_pct, platform_fee_amount,
         consortium_canon_amount, host_net_amount, status
       ) VALUES (
         $1, $2, $3, $4, $5,
         'ARS', 3354000.00, 6.00, 187200.00,
         46800.00, 3120000.00, 'PAID_PENDING_KYC'
       )
       ON CONFLICT (id) DO UPDATE SET 
         property_id = EXCLUDED.property_id,
         status = 'PAID_PENDING_KYC',
         total_amount = 3354000.00`,
      [
        DEMO_MID_TERM_BOOKING_ID,
        propId,
        DEMO_GUEST_ID,
        checkIn.toISOString().split("T")[0],
        checkOut.toISOString().split("T")[0],
      ]
    );

    // 5. Token de invitación de Huésped Primario para KYC y Contratos
    await db.query(
      `INSERT INTO public.guest_verifications (
         id, booking_id, invite_token, is_primary_guest, status, full_name_extracted
       ) VALUES (
         gen_random_uuid(), $1, $2, TRUE, 'PENDING', 'Lucas Benítez'
       )
       ON CONFLICT (invite_token) DO UPDATE SET 
         booking_id = EXCLUDED.booking_id,
         status = 'PENDING'`,
      [DEMO_MID_TERM_BOOKING_ID, DEMO_INVITE_TOKEN]
    );

    console.log("[SEED] Demo data successfully seeded!");
    console.log("--------------------------------------------------");
    console.log("RUTAS LISTAS PARA PROBAR EN TU NAVEGADOR:");
    console.log(`1. Propiedad Demo:     http://localhost:3000/p/loft-luminoso-palermo-soho`);
    console.log(`2. Checkout Demo:      http://localhost:3000/checkout/${DEMO_MID_TERM_BOOKING_ID}`);
    console.log(`3. Contrato Digital:   http://localhost:3000/contratos/${DEMO_MID_TERM_BOOKING_ID}?token=${DEMO_INVITE_TOKEN}`);
    console.log(`4. Pre-Checkin KYC:    http://localhost:3000/checkin/${DEMO_MID_TERM_BOOKING_ID}?token=${DEMO_INVITE_TOKEN}`);
    console.log(`5. Panel Anfitrión:    http://localhost:3000/dashboard/propiedades`);
    console.log("--------------------------------------------------");
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  seedDemoData().catch(console.error);
}

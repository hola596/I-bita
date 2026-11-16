-- ============================================================================
-- I-BITA — MIGRACIÓN INICIAL COMPLETA (DDL + btree_gist + Trigger + 10 Tablas RLS)
-- ============================================================================

-- 1. Extensiones obligatorias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- 2. Enumeraciones de Dominio (Idempotentes)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('GUEST', 'HOST', 'CONSORTIUM_ADMIN', 'SUPERADMIN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE currency_code AS ENUM ('ARS', 'USD', 'USDT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM (
    'PENDING_PAYMENT',
    'PAID_PENDING_KYC',
    'ALL_ADULTS_VERIFIED',
    'CHECKED_IN',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'ICAL_BLOCK'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kyc_status AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ledger_entry_type AS ENUM (
    'GUEST_PAYMENT_ARS',
    'GUEST_PAYMENT_USDT',
    'ESCROW_DEPOSIT_HELD',
    'ESCROW_RELEASED',
    'PLATFORM_FEE_REVENUE',
    'CONSORTIUM_CANON_PAYABLE',
    'CONSORTIUM_CANON_PAID',
    'HOST_NET_PAYABLE',
    'HOST_NET_SETTLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Tabla 1: public.profiles (FR-1, FR-2)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone_whatsapp TEXT,
  role user_role NOT NULL DEFAULT 'GUEST',
  cuit_cuil VARCHAR(13),
  payout_cbu_cvu VARCHAR(22),
  payout_usdt_wallet VARCHAR(42),
  payout_split_ars_pct NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (payout_split_ars_pct BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabla 2: public.properties (FR-4, FR-6, FR-7, AD-5)
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  slug VARCHAR(120) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  corridor VARCHAR(80) NOT NULL,
  address_line TEXT NOT NULL,
  unit_identifier VARCHAR(40) NOT NULL,
  max_adults INT NOT NULL DEFAULT 2 CHECK (max_adults >= 1 AND max_adults <= 20),
  base_currency currency_code NOT NULL DEFAULT 'USD',
  nightly_rate NUMERIC(18,2) NOT NULL CHECK (nightly_rate > 0),
  monthly_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 15.00 CHECK (monthly_discount_pct BETWEEN 0 AND 70),
  absorb_installments_cost BOOLEAN NOT NULL DEFAULT FALSE,
  accepts_usdt BOOLEAN NOT NULL DEFAULT TRUE,
  wifi_speed_mbps INT,
  images JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_code_ciphertext TEXT NOT NULL,
  access_code_iv TEXT NOT NULL,
  access_code_auth_tag TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabla 3: public.consortium_configs (FR-8)
CREATE TABLE IF NOT EXISTS public.consortium_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE,
  consortium_name TEXT NOT NULL,
  consortium_cuit VARCHAR(13),
  porteria_whatsapp VARCHAR(30) NOT NULL,
  admin_email TEXT NOT NULL,
  micro_canon_pct NUMERIC(4,2) NOT NULL DEFAULT 0.00 CHECK (micro_canon_pct IN (0.00, 1.00, 1.50, 2.00)),
  consortium_cbu_alias VARCHAR(60),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Tabla 4: public.ical_feeds (FR-5)
CREATE TABLE IF NOT EXISTS public.ical_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  source_name VARCHAR(50) NOT NULL DEFAULT 'Airbnb',
  feed_url TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Tabla 5: public.bookings con Constraint Físico Anti-Solapamiento btree_gist (AD-3, NFR-6)
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  guest_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  nights_count INT GENERATED ALWAYS AS (check_out - check_in) STORED,
  is_mid_term BOOLEAN GENERATED ALWAYS AS ((check_out - check_in) >= 30) STORED,
  declared_adults_count INT NOT NULL DEFAULT 1 CHECK (declared_adults_count >= 1),
  verified_adults_count INT NOT NULL DEFAULT 0 CHECK (verified_adults_count >= 0),
  status booking_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  payment_currency currency_code NOT NULL DEFAULT 'ARS',
  total_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 12.00,
  platform_fee_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  consortium_canon_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  host_net_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
  escrow_deposit_usdt NUMERIC(18,6) NOT NULL DEFAULT 0,
  vehicle_plate VARCHAR(20),
  external_ical_uid TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_valid_dates CHECK (check_out > check_in),
  CONSTRAINT no_overlapping_active_bookings EXCLUDE USING gist (
    property_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  ) WHERE (status NOT IN ('CANCELLED', 'EXPIRED'))
);

-- 8. Tabla 6: public.guest_verifications (FR-9, FR-10)
CREATE TABLE IF NOT EXISTS public.guest_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  is_primary_guest BOOLEAN NOT NULL DEFAULT FALSE,
  invite_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  document_type VARCHAR(20) NOT NULL DEFAULT 'DNI_ARG',
  document_number VARCHAR(40),
  full_name_extracted TEXT,
  birth_date DATE,
  pdf417_raw_payload TEXT,
  dni_front_storage_path TEXT,
  selfie_storage_path TEXT,
  biometric_confidence_score NUMERIC(5,2),
  gemini_audit_json JSONB,
  consent_accepted_at TIMESTAMPTZ,
  status kyc_status NOT NULL DEFAULT 'PENDING',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Tabla 7: public.porteria_passes (FR-11)
CREATE TABLE IF NOT EXISTS public.porteria_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  jws_token TEXT NOT NULL,
  qr_data_url TEXT NOT NULL,
  sent_whatsapp_at TIMESTAMPTZ,
  sent_email_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Tabla 8: public.contracts (FR-15)
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE RESTRICT,
  stay_purpose VARCHAR(60) NOT NULL,
  pdf_storage_path TEXT NOT NULL,
  pdf_sha256_hash CHAR(64) NOT NULL,
  guest_signed_at TIMESTAMPTZ,
  guest_signer_ip TEXT,
  host_signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Tabla 9: public.ledger_entries — Append-Only Ledger (FR-14, AD-6, NFR-7)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(140) NOT NULL UNIQUE,
  entry_type ledger_entry_type NOT NULL,
  currency currency_code NOT NULL,
  amount NUMERIC(18,6) NOT NULL,
  external_reference TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE_VIOLATION: La tabla ledger_entries es estrictamente append-only (prohibido %)', TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_immutable ON public.ledger_entries;
CREATE TRIGGER trg_ledger_immutable
BEFORE UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_ledger_mutation();

-- 12. Tabla 10: public.contact_inquiries (FR-3)
CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 13. ACTIVACIÓN DE ROW-LEVEL SECURITY (RLS) EN LAS 10 TABLAS
-- ============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consortium_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ical_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.porteria_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 14. POLÍTICAS RLS EXPLÍCITAS (CREATE POLICY) PARA CADA UNA DE LAS 10 TABLAS
-- ============================================================================

-- 14.1 Policies para public.profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 14.2 Policies para public.properties
DROP POLICY IF EXISTS "properties_select_published_or_owner" ON public.properties;
CREATE POLICY "properties_select_published_or_owner" ON public.properties
  FOR SELECT USING (is_published = TRUE OR auth.uid() = host_id);

DROP POLICY IF EXISTS "properties_insert_host" ON public.properties;
CREATE POLICY "properties_insert_host" ON public.properties
  FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "properties_update_host" ON public.properties;
CREATE POLICY "properties_update_host" ON public.properties
  FOR UPDATE USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "properties_delete_host" ON public.properties;
CREATE POLICY "properties_delete_host" ON public.properties
  FOR DELETE USING (auth.uid() = host_id);

-- 14.3 Policies para public.consortium_configs
DROP POLICY IF EXISTS "consortium_configs_select_public" ON public.consortium_configs;
CREATE POLICY "consortium_configs_select_public" ON public.consortium_configs
  FOR SELECT USING (
    active = TRUE OR
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.host_id = auth.uid())
  );

DROP POLICY IF EXISTS "consortium_configs_manage_host" ON public.consortium_configs;
CREATE POLICY "consortium_configs_manage_host" ON public.consortium_configs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.host_id = auth.uid())
  );

-- 14.4 Policies para public.ical_feeds
DROP POLICY IF EXISTS "ical_feeds_manage_host" ON public.ical_feeds;
CREATE POLICY "ical_feeds_manage_host" ON public.ical_feeds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.host_id = auth.uid())
  );

-- 14.5 Policies para public.bookings
DROP POLICY IF EXISTS "bookings_select_involved" ON public.bookings;
CREATE POLICY "bookings_select_involved" ON public.bookings
  FOR SELECT USING (
    auth.uid() = guest_id OR
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_id AND (p.host_id = auth.uid() OR p.is_published = TRUE)
    )
  );

DROP POLICY IF EXISTS "bookings_insert_authenticated" ON public.bookings;
CREATE POLICY "bookings_insert_authenticated" ON public.bookings
  FOR INSERT WITH CHECK (
    auth.uid() = guest_id OR
    (status = 'ICAL_BLOCK' AND EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.host_id = auth.uid()))
  );

DROP POLICY IF EXISTS "bookings_update_involved" ON public.bookings;
CREATE POLICY "bookings_update_involved" ON public.bookings
  FOR UPDATE USING (
    auth.uid() = guest_id OR
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.host_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = guest_id OR
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.host_id = auth.uid())
  );

-- 14.6 Policies para public.guest_verifications
DROP POLICY IF EXISTS "guest_verifications_select_involved" ON public.guest_verifications;
CREATE POLICY "guest_verifications_select_involved" ON public.guest_verifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.properties p ON p.id = b.property_id
      WHERE b.id = booking_id AND (b.guest_id = auth.uid() OR p.host_id = auth.uid())
    )
  );

-- 14.7 Policies para public.porteria_passes
DROP POLICY IF EXISTS "porteria_passes_select_involved" ON public.porteria_passes;
CREATE POLICY "porteria_passes_select_involved" ON public.porteria_passes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.properties p ON p.id = b.property_id
      WHERE b.id = booking_id AND (b.guest_id = auth.uid() OR p.host_id = auth.uid())
    )
  );

-- 14.8 Policies para public.contracts
DROP POLICY IF EXISTS "contracts_select_involved" ON public.contracts;
CREATE POLICY "contracts_select_involved" ON public.contracts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.properties p ON p.id = b.property_id
      WHERE b.id = booking_id AND (b.guest_id = auth.uid() OR p.host_id = auth.uid())
    )
  );

-- 14.9 Policies para public.ledger_entries
DROP POLICY IF EXISTS "ledger_entries_select_involved" ON public.ledger_entries;
CREATE POLICY "ledger_entries_select_involved" ON public.ledger_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.properties p ON p.id = b.property_id
      WHERE b.id = booking_id AND (b.guest_id = auth.uid() OR p.host_id = auth.uid())
    )
  );

-- 14.10 Policies para public.contact_inquiries
DROP POLICY IF EXISTS "contact_inquiries_insert_public" ON public.contact_inquiries;
CREATE POLICY "contact_inquiries_insert_public" ON public.contact_inquiries
  FOR INSERT WITH CHECK (true);

-- 15. Permisos para roles de PostgREST (sujetos estrictamente a las políticas RLS anteriores) y recarga de caché
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

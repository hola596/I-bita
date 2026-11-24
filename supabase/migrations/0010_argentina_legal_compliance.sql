-- ============================================================================
-- I-BITA — CUMPLIMIENTO LEGAL ARGENTINA (Módulos 1, 2, 3 y 4)
-- Ley 24.240 / Disp. 954/2025 · Ley 6255 (RPATT) · Ley 25.506 / Art. 288 CCCN
-- ============================================================================

-- 1. MÓDULO 1: Solicitudes de Arrepentimiento y Baja de Servicio (Disp. 954/2025)
CREATE TABLE IF NOT EXISTS public.consumer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (request_type IN ('ARREPENTIMIENTO', 'BAJA_SERVICIO')),
  tracking_code VARCHAR(32) NOT NULL UNIQUE,
  email TEXT NOT NULL,
  booking_code VARCHAR(80),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'CONFIRMED_24H', 'RESOLVED', 'REJECTED_EXCEPTION')
  ),
  ip_address TEXT,
  user_agent TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumer_requests_type_created
  ON public.consumer_requests (request_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_consumer_requests_email
  ON public.consumer_requests (LOWER(email));

ALTER TABLE public.consumer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consumer_requests_insert_public" ON public.consumer_requests;
CREATE POLICY "consumer_requests_insert_public" ON public.consumer_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "consumer_requests_select_own_or_admin" ON public.consumer_requests;
CREATE POLICY "consumer_requests_select_own_or_admin" ON public.consumer_requests
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'SUPERADMIN'
    )
  );

DROP POLICY IF EXISTS "consumer_requests_update_admin" ON public.consumer_requests;
CREATE POLICY "consumer_requests_update_admin" ON public.consumer_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'SUPERADMIN'
    )
  );

-- 2. MÓDULO 2: Jurisdicción, RPATT CABA (Ley 6255), Baja Regulatoria y DDJJ Consorcial
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS jurisdiccion TEXT NOT NULL DEFAULT 'CABA',
  ADD COLUMN IF NOT EXISTS numero_registro_turistico VARCHAR(80),
  ADD COLUMN IF NOT EXISTS estado_regulatorio TEXT NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS regulatory_suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS regulatory_suspended_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.properties
    ADD CONSTRAINT properties_estado_regulatorio_check
    CHECK (estado_regulatorio IN ('activo', 'suspendido_autoridad'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.properties
SET jurisdiccion = CASE corridor
  WHEN 'CABA' THEN 'CABA'
  WHEN 'COSTA_ATLANTICA' THEN 'PBA'
  WHEN 'CORDOBA' THEN 'CORDOBA'
  WHEN 'VACA_MUERTA' THEN 'NEUQUEN'
  ELSE jurisdiccion
END
WHERE jurisdiccion = 'CABA' AND corridor <> 'CABA';

DROP POLICY IF EXISTS "properties_select_published_or_owner" ON public.properties;
CREATE POLICY "properties_select_published_or_owner" ON public.properties
  FOR SELECT USING (
    (is_published = TRUE AND estado_regulatorio = 'activo')
    OR auth.uid() = host_id
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'SUPERADMIN'
    )
  );

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS jurisdiccion_principal TEXT,
  ADD COLUMN IF NOT EXISTS numero_registro_turistico_default VARCHAR(80),
  ADD COLUMN IF NOT EXISTS ddjj_consorcio_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ddjj_consorcio_ip TEXT,
  ADD COLUMN IF NOT EXISTS ddjj_consorcio_version VARCHAR(32),
  ADD COLUMN IF NOT EXISTS mp_seller_user_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_marketplace_connected_at TIMESTAMPTZ;

-- 3. MÓDULO 4: Registro de Auditoría Probatoria Inmutable de Contratos (Ley 25.506 / Art. 288 CCCN)
CREATE TABLE IF NOT EXISTS public.contract_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE RESTRICT,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  document_sha256_hash CHAR(64) NOT NULL,
  signer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  signer_role TEXT NOT NULL CHECK (signer_role IN ('huesped', 'anfitrion')),
  email TEXT NOT NULL,
  signed_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  otp_verified_at TIMESTAMPTZ,
  otp_channel VARCHAR(32),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_contract_audit_logs_contract
  ON public.contract_audit_logs (contract_id, signed_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_contract_audit_logs_booking
  ON public.contract_audit_logs (booking_id, signed_at_utc DESC);

CREATE OR REPLACE FUNCTION public.prevent_contract_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'CONTRACT_AUDIT_IMMUTABLE_VIOLATION: La tabla contract_audit_logs es estrictamente inmutable (prohibido %)', TG_OP
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_audit_logs_immutable ON public.contract_audit_logs;
CREATE TRIGGER trg_contract_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.contract_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_contract_audit_mutation();

ALTER TABLE public.contract_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contract_audit_logs_select_involved" ON public.contract_audit_logs;
CREATE POLICY "contract_audit_logs_select_involved" ON public.contract_audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.properties p ON p.id = b.property_id
      WHERE b.id = booking_id
        AND (b.guest_id = auth.uid() OR p.host_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'SUPERADMIN'
    )
  );

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

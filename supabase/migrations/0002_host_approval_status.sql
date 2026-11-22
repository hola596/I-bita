-- ============================================================================
-- I-BITA — MIGRACIÓN 0002: CAPA DE APROBACIÓN DE ANFITRIÓN (ADITIVA)
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE host_approval_status AS ENUM ('NONE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS host_approval_status host_approval_status NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS host_approval_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS host_approval_notes TEXT;

UPDATE public.profiles
SET host_approval_status = 'APPROVED',
    host_approval_reviewed_at = COALESCE(host_approval_reviewed_at, updated_at, NOW())
WHERE role = 'HOST' AND host_approval_status = 'NONE';

NOTIFY pgrst, 'reload schema';

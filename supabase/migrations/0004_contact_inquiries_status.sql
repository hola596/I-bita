-- ============================================================================
-- I-BITA — MIGRACIÓN 0004: BANDEJA OPERATIVA DE CONSULTAS DE AYUDA (ADITIVA)
-- ============================================================================

ALTER TABLE public.contact_inquiries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status_created
  ON public.contact_inquiries (status, created_at DESC);

NOTIFY pgrst, 'reload schema';

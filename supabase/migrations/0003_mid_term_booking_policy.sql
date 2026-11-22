-- ============================================================================
-- I-BITA — MIGRACIÓN 0003: APROBACIÓN PREVIA Y REQUISITOS ESTADÍA LARGA (ADITIVA)
-- ============================================================================

ALTER TYPE public.booking_status ADD VALUE IF NOT EXISTS 'PENDING_HOST_APPROVAL';

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS mid_term_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS mid_term_application JSONB,
  ADD COLUMN IF NOT EXISTS host_decision_notes TEXT,
  ADD COLUMN IF NOT EXISTS host_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_property_status
  ON public.bookings (property_id, status);

NOTIFY pgrst, 'reload schema';

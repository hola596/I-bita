-- ============================================================================
-- I-BITA — MIGRACIÓN 0006: INTERVALO OBLIGATORIO DE RESPUESTA DEL ANFITRIÓN
-- Y TASA DE RESPUESTA SINCRONIZADA POR RESERVA
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS response_schedule JSONB;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS host_response_schedule JSONB;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS host_response_due_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS host_responded_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS host_responded_on_time BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_bookings_host_sla
  ON public.bookings (property_id, host_response_due_at)
  WHERE status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK');

DO $$
DECLARE
  c_name TEXT;
BEGIN
  FOR c_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.conversations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%BOOKING_INTERVIEW%'
  LOOP
    EXECUTE format('ALTER TABLE public.conversations DROP CONSTRAINT %I', c_name);
  END LOOP;

  ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_kind_check
    CHECK (
      kind IN (
        'SUPPORT_INQUIRY',
        'HOST_APPROVAL',
        'BOOKING_INTERVIEW',
        'BOOKING_STAY'
      )
    );
END $$;

UPDATE public.profiles
SET response_schedule = jsonb_build_object(
  'days', jsonb_build_array('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'),
  'startHour', 9,
  'endHour', 21,
  'maxResponseHours', 2,
  'timezone', 'America/Argentina/Buenos_Aires',
  'confirmedAt', NOW()
)
WHERE id = '00000000-0000-4000-8000-000000000001'
  AND response_schedule IS NULL;

NOTIFY pgrst, 'reload schema';

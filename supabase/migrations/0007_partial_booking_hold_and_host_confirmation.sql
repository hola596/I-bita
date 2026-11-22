-- ============================================================================
-- I-BITA — MIGRACIÓN 0007: RESERVAS PARCIALES DE 1 HORA (HOLD_EXPIRES_AT)
-- Y CONFIRMACIÓN EXPLÍCITA DEL ANFITRIÓN (HOST_CONFIRMED_AT)
-- ============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS host_confirmed_at TIMESTAMPTZ;

-- Solo marcamos como confirmadas por el anfitrión las estadías heredadas ya iniciadas o finalizadas.
UPDATE public.bookings
SET host_confirmed_at = COALESCE(host_reviewed_at, updated_at, created_at)
WHERE status IN ('CHECKED_IN', 'COMPLETED')
  AND host_confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_active_hold_expiry
  ON public.bookings (property_id, hold_expires_at)
  WHERE status = 'PENDING_PAYMENT' AND hold_expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.expire_stale_booking_holds(
  p_property_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_count INT := 0;
BEGIN
  UPDATE public.bookings
  SET status = 'EXPIRED',
      updated_at = NOW()
  WHERE status = 'PENDING_PAYMENT'
    AND hold_expires_at IS NOT NULL
    AND hold_expires_at <= NOW()
    AND (p_property_id IS NULL OR property_id = p_property_id);

  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  RETURN v_expired_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_booking_holds(UUID)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

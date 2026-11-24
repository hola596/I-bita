-- ============================================================================
-- Migración 0011: Sincronización de Calendarios Nivel 1 (iCal Bidireccional)
-- + Programación automática cada 20 min vía Supabase pg_cron + pg_net + Vault
-- ============================================================================

-- 1. Preferencias de sincronización en el perfil del anfitrión (Onboarding)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_sync_preferences JSONB NOT NULL DEFAULT '{"mode":"ibita_only","selectedSources":[],"feeds":[]}'::jsonb;

-- 2. Trazabilidad y confirmación de exportación en ical_feeds
ALTER TABLE public.ical_feeds
  ADD COLUMN IF NOT EXISTS export_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_cancelled_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_message TEXT;

-- Deduplicar filas previas por (property_id, feed_url) conservando la más reciente
WITH ranked_feeds AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY property_id, feed_url
      ORDER BY last_synced_at DESC NULLS LAST, created_at DESC, id DESC
    ) AS rn
  FROM public.ical_feeds
)
DELETE FROM public.ical_feeds f
USING ranked_feeds r
WHERE f.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ical_feeds_property_url
  ON public.ical_feeds (property_id, feed_url);

-- 3. Vínculo directo de bloqueos iCal con su feed origen para reconciliar cancelaciones
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS ical_feed_id UUID REFERENCES public.ical_feeds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_ical_feed_id
  ON public.bookings (ical_feed_id)
  WHERE ical_feed_id IS NOT NULL;

-- 4. Extensiones y disparador automático en Supabase Cloud (pg_cron + pg_net + Vault)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_ibita_ical_sync()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_url TEXT;
  v_secret TEXT;
  v_request_id BIGINT;
BEGIN
  SELECT decrypted_secret
    INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'ibita_ical_sync_url'
  LIMIT 1;

  SELECT decrypted_secret
    INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'ibita_cron_secret'
  LIMIT 1;

  IF v_url IS NULL OR length(trim(v_url)) = 0
     OR v_secret IS NULL OR length(trim(v_secret)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := trim(v_url),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || trim(v_secret)
    ),
    body := '{"source":"supabase_pg_cron"}'::jsonb,
    timeout_milliseconds := 25000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_ibita_ical_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_ibita_ical_sync() FROM anon;
REVOKE ALL ON FUNCTION public.trigger_ibita_ical_sync() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ibita-ical-sync-every-20m') THEN
    PERFORM cron.unschedule('ibita-ical-sync-every-20m');
  END IF;
  PERFORM cron.schedule(
    'ibita-ical-sync-every-20m',
    '*/20 * * * *',
    $cron$SELECT public.trigger_ibita_ical_sync();$cron$
  );
END;
$$;

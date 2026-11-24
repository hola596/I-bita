-- ============================================================================
-- I-BITA — MIGRACIÓN 0009: BIOMETRÍA OPEN-SOURCE + AUDITORÍA + TTL (LEY 25.326)
-- ============================================================================

-- 1. Ampliar enum kyc_status con estado MANUAL_REVIEW para zona gris (0.30 - 0.363)
ALTER TYPE public.kyc_status ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW';

-- 2. Columnas biométricas y retención temporal (TTL) en public.guest_verifications
ALTER TABLE public.guest_verifications
  ADD COLUMN IF NOT EXISTS similarity_score NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS liveness_score NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS audit_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS biometric_provider VARCHAR(64),
  ADD COLUMN IF NOT EXISTS evidence_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evidence_purged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_guest_verifications_evidence_ttl
  ON public.guest_verifications (evidence_expires_at)
  WHERE evidence_purged_at IS NULL AND evidence_expires_at IS NOT NULL;

-- 3. Función determinista de purga automática (Ley 25.326 — Minimización de datos)
-- Elimina imágenes crudas vencidas del bucket privado `kyc-documents` y anula referencias en DB,
-- conservando únicamente `audit_hash`, puntajes y estado de cumplimiento.
CREATE OR REPLACE FUNCTION public.purge_expired_kyc_evidence()
RETURNS TABLE (
  purged_rows INT,
  deleted_objects INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_paths TEXT[] := '{}';
  v_deleted_objects INT := 0;
  v_purged_rows INT := 0;
BEGIN
  SELECT COALESCE(array_agg(obj_path), '{}')
  INTO v_paths
  FROM (
    SELECT regexp_replace(dni_front_storage_path, '^kyc-documents/', '') AS obj_path
    FROM public.guest_verifications
    WHERE evidence_expires_at IS NOT NULL
      AND evidence_expires_at <= NOW()
      AND evidence_purged_at IS NULL
      AND status::text IN ('VERIFIED', 'REJECTED')
      AND dni_front_storage_path IS NOT NULL
    UNION
    SELECT regexp_replace(selfie_storage_path, '^kyc-documents/', '') AS obj_path
    FROM public.guest_verifications
    WHERE evidence_expires_at IS NOT NULL
      AND evidence_expires_at <= NOW()
      AND evidence_purged_at IS NULL
      AND status::text IN ('VERIFIED', 'REJECTED')
      AND selfie_storage_path IS NOT NULL
  ) AS targets
  WHERE obj_path IS NOT NULL AND obj_path <> '';

  IF array_length(v_paths, 1) IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'kyc-documents'
      AND name = ANY(v_paths);
    GET DIAGNOSTICS v_deleted_objects = ROW_COUNT;
  END IF;

  UPDATE public.guest_verifications
  SET
    dni_front_storage_path = NULL,
    selfie_storage_path = NULL,
    pdf417_raw_payload = NULL,
    evidence_purged_at = NOW()
  WHERE evidence_expires_at IS NOT NULL
    AND evidence_expires_at <= NOW()
    AND evidence_purged_at IS NULL
    AND status::text IN ('VERIFIED', 'REJECTED');

  GET DIAGNOSTICS v_purged_rows = ROW_COUNT;

  RETURN QUERY SELECT v_purged_rows, v_deleted_objects;
END;
$$;

-- 4. Programación automática en Supabase pg_cron si la extensión está habilitada (04:00 UTC diario)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ibita_purge_expired_kyc_evidence')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'ibita_purge_expired_kyc_evidence'
    );
    PERFORM cron.schedule(
      'ibita_purge_expired_kyc_evidence',
      '0 4 * * *',
      $cron$SELECT public.purge_expired_kyc_evidence();$cron$
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

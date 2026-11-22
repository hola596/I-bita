-- ============================================================================
-- I-BITA — MIGRACIÓN 0008: PREPARACIÓN PARA PRODUCCIÓN (STORAGE + SUPERADMIN)
-- ============================================================================

-- 1. Asegurar bucket público de fotografías de propiedades (5 MB, formatos web)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-photos',
  'property-photos',
  TRUE,
  5242880,
  ARRAY['image/webp', 'image/avif', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = TRUE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'property_photos_public_read'
  ) THEN
    CREATE POLICY "property_photos_public_read" ON storage.objects
      FOR SELECT
      USING (bucket_id = 'property-photos');
  END IF;
END $$;

-- 2. Promover la cuenta administradora principal a SUPERADMIN para moderación en producción
-- (conservando host_approval_status = 'APPROVED' para poder administrar también sus propiedades).
UPDATE public.profiles
SET role = 'SUPERADMIN',
    updated_at = NOW()
WHERE LOWER(email) = LOWER('hola@serviciodemarketingdigital.com')
  AND role <> 'SUPERADMIN';

NOTIFY pgrst, 'reload schema';

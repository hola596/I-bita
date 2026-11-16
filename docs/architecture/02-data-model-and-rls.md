# 02. Modelo de Datos PostgreSQL, RLS e Invariantes (`AD-3`, `AD-6`)

## 1. Tablas Principales en Supabase Cloud (`trknmgnzjhrhtwloiaga`)
Archivo de migración: `supabase/migrations/0001_initial_schema_and_rls.sql`.

1. **`public.profiles`:** `id` (UUID PK), `email`, `full_name`, `phone_whatsapp`, `role` (`GUEST`, `HOST`, `CONSORTIUM_ADMIN`, `SUPERADMIN`), `cuit_cuil`, `payout_cbu_cvu` (22 dígitos), `payout_usdt_wallet` (EIP-55), `payout_split_ars_pct`.
2. **`public.properties`:** `id`, `host_id`, `slug` (UNIQUE), `title`, `description`, `corridor`, `address_line`, `unit_identifier`, `max_adults`, `base_currency`, `nightly_rate`, `monthly_discount_pct`, `absorb_installments_cost`, `accepts_usdt`, `wifi_speed_mbps`, `images` (JSONB), `access_code_ciphertext`, `access_code_iv`, `access_code_auth_tag`, `is_published`.
3. **`public.consortium_configs`:** `id`, `property_id` (UNIQUE), `consortium_name`, `consortium_cuit`, `porteria_whatsapp`, `admin_email`, `micro_canon_pct` (`0`, `1`, `1.5`, `2`), `consortium_cbu_alias`, `active`.
4. **`public.ical_feeds`:** `id`, `property_id`, `source_name`, `feed_url`, `last_synced_at`, `last_sync_status`.
5. **`public.bookings`:**
   * Incluye columnas generadas `nights_count` y `is_mid_term` (`>= 30 noches`).
   * **Invariante `AD-3` (`btree_gist`):**
     ```sql
     CONSTRAINT no_overlapping_active_bookings EXCLUDE USING gist (
       property_id WITH =,
       daterange(check_in, check_out, '[)') WITH &&
     ) WHERE (status NOT IN ('CANCELLED', 'EXPIRED'))
     ```
     Arroja `SQLSTATE 23P01 (exclusion_violation)` ante cualquier intento de doble reserva.
6. **`public.guest_verifications`:** `id`, `booking_id`, `is_primary_guest`, `invite_token` (UUID UNIQUE), `document_type`, `document_number`, `full_name_extracted`, `birth_date`, `pdf417_raw_payload`, `dni_front_storage_path`, `selfie_storage_path`, `biometric_confidence_score`, `gemini_audit_json`, `consent_accepted_at`, `status` (`PENDING`, `VERIFIED`, `REJECTED`).
7. **`public.porteria_passes`:** `id`, `booking_id`, `jws_token`, `qr_data_url`, `sent_whatsapp_at`, `sent_email_at`, `revoked`.
8. **`public.contracts`:** `id`, `booking_id`, `stay_purpose`, `pdf_storage_path`, `pdf_sha256_hash` (CHAR 64), `guest_signed_at`, `guest_signer_ip`, `host_signed_at`.
9. **`public.ledger_entries`:**
   * **Invariante `AD-6` (Append-Only):** `idempotency_key` (UNIQUE) + trigger `trg_ledger_immutable` que lanza `SQLSTATE 42501` ante cualquier `UPDATE` o `DELETE`.
10. **`public.contact_inquiries`:** `id`, `full_name`, `email`, `phone`, `subject`, `message`, `created_at`.

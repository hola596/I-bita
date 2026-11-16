import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

/**
 * REGLA ESTRICTA DE ARQUITECTURA (ANTI-BYPASS DE RLS):
 * Este cliente privilegiado (`SUPABASE_SERVICE_ROLE_KEY`) SOLO puede utilizarse en:
 * 1. Webhooks verificados criptográficamente (`POST /api/webhooks/payments` para insertar en `ledger_entries`).
 * 2. Tareas de sistema / sincronización en segundo plano y compuerta criptográfica Zero-Trust verificada.
 * 3. Scripts de Verification Gate en consola.
 * QUEDA PROHIBIDO utilizarlo en Server Components o Server Actions de usuario general para esquivar RLS.
 */
export function createSupabaseAdminClient() {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}

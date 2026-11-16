import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type PropertyCorridor,
  type PropertyCurrency,
  type PropertyImageItem,
  PropertyImageSchema,
} from "./validators";

async function getPublicSupabaseClient() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
}

/**
 * Columnas estrictamente descriptivas y tarifarias de `public.properties`.
 * Excluye físicamente `access_code_ciphertext`, `access_code_iv` y `access_code_auth_tag`
 * cumpliendo con AC-2 (AD-5, NFR-4: Zero-Trust Consorcial).
 */
export const PUBLIC_PROPERTY_COLUMNS =
  "id, host_id, slug, title, description, corridor, address_line, unit_identifier, max_adults, base_currency, nightly_rate, monthly_discount_pct, absorb_installments_cost, accepts_usdt, wifi_speed_mbps, images, is_published, created_at, updated_at" as const;

export const FORBIDDEN_ACCESS_CODE_COLUMNS = [
  "access_code_ciphertext",
  "access_code_iv",
  "access_code_auth_tag",
  "accessCodePlain",
] as const;

export interface SafePropertyRecord {
  id: string;
  host_id: string;
  slug: string;
  title: string;
  description: string;
  corridor: PropertyCorridor;
  address_line: string;
  unit_identifier: string;
  max_adults: number;
  base_currency: PropertyCurrency;
  nightly_rate: number;
  monthly_discount_pct: number;
  absorb_installments_cost: boolean;
  accepts_usdt: boolean;
  wifi_speed_mbps: number | null;
  images: PropertyImageItem[];
  is_published: boolean;
  created_at: string;
  updated_at: string;
  hasEncryptedAccessCode: true;
}

export function normalizePropertyImages(rawImages: unknown, fallbackTitle: string): PropertyImageItem[] {
  if (Array.isArray(rawImages) && rawImages.length > 0) {
    const validItems: PropertyImageItem[] = [];
    for (const item of rawImages) {
      if (typeof item === "string") {
        const parsed = PropertyImageSchema.safeParse({
          url: item,
          alt: fallbackTitle,
          width: 1200,
          height: 900,
          mimeType: "image/webp",
          sizeBytes: 220000,
        });
        if (parsed.success) validItems.push(parsed.data);
      } else {
        const parsed = PropertyImageSchema.safeParse(item);
        if (parsed.success) validItems.push(parsed.data);
      }
    }
    if (validItems.length > 0) return validItems;
  }

  return [
    {
      url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp",
      alt: `${fallbackTitle} — Vista principal optimizada`,
      width: 1200,
      height: 900,
      mimeType: "image/webp",
      sizeBytes: 215000,
    },
  ];
}

/**
 * Sanitizador defensivo que garantiza que ninguna columna criptográfica del PIN
 * viaje en respuestas generales o payloads de React Server Components.
 */
export function sanitizePublicPropertyRow(row: Record<string, unknown>): SafePropertyRecord {
  const clone = { ...row };
  for (const forbidden of FORBIDDEN_ACCESS_CODE_COLUMNS) {
    delete clone[forbidden];
  }

  const title = String(clone.title ?? "Unidad Funcional I-bita");

  return {
    id: String(clone.id),
    host_id: String(clone.host_id),
    slug: String(clone.slug),
    title,
    description: String(clone.description ?? ""),
    corridor: (clone.corridor as PropertyCorridor) ?? "CABA",
    address_line: String(clone.address_line ?? ""),
    unit_identifier: String(clone.unit_identifier ?? ""),
    max_adults: Number(clone.max_adults ?? 2),
    base_currency: (clone.base_currency as PropertyCurrency) ?? "USD",
    nightly_rate: Number(clone.nightly_rate ?? 0),
    monthly_discount_pct: Number(clone.monthly_discount_pct ?? 15),
    absorb_installments_cost: Boolean(clone.absorb_installments_cost),
    accepts_usdt: Boolean(clone.accepts_usdt ?? true),
    wifi_speed_mbps:
      clone.wifi_speed_mbps !== null && clone.wifi_speed_mbps !== undefined
        ? Number(clone.wifi_speed_mbps)
        : null,
    images: normalizePropertyImages(clone.images, title),
    is_published: Boolean(clone.is_published ?? true),
    created_at: String(clone.created_at ?? new Date().toISOString()),
    updated_at: String(clone.updated_at ?? new Date().toISOString()),
    hasEncryptedAccessCode: true,
  };
}

/**
 * Consulta una propiedad publicada por `slug` seleccionando explícitamente
 * solo las columnas descriptivas y tarifarias (`PUBLIC_PROPERTY_COLUMNS`).
 */
export async function getPublicPropertyBySlug(
  slug: string
): Promise<SafePropertyRecord | null> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) return null;

  const supabase = await getPublicSupabaseClient();

  const { data, error } = await supabase
    .from("properties")
    .select(PUBLIC_PROPERTY_COLUMNS)
    .eq("slug", cleanSlug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return sanitizePublicPropertyRow(data as unknown as Record<string, unknown>);
}

/**
 * Lista todas las Unidades Funcionales publicadas seleccionando explícitamente
 * solo las columnas descriptivas y tarifarias (`PUBLIC_PROPERTY_COLUMNS`).
 */
export async function listPublicProperties(filters?: {
  corridor?: PropertyCorridor;
}): Promise<SafePropertyRecord[]> {
  const supabase = await getPublicSupabaseClient();

  let query = supabase
    .from("properties")
    .select(PUBLIC_PROPERTY_COLUMNS)
    .eq("is_published", true)
    .order("created_at", { ascending: false });

  if (filters?.corridor) {
    query = query.eq("corridor", filters.corridor);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return data.map((row) =>
    sanitizePublicPropertyRow(row as unknown as Record<string, unknown>)
  );
}

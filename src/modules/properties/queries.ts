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
 * cumpliendo con AC-1 / AC-2 (AD-5, NFR-4: Zero-Trust Consorcial).
 */
export const PUBLIC_PROPERTY_COLUMNS =
  "id, host_id, slug, title, description, corridor, address_line, unit_identifier, max_adults, base_currency, nightly_rate, monthly_discount_pct, absorb_installments_cost, accepts_usdt, wifi_speed_mbps, images, is_published, created_at, updated_at" as const;

/**
 * Columnas públicas de `public.consortium_configs` para mostrar la insignia
 * "Propiedad Consorcio Friendly" y calcular el Micro-Canon Consorcial (1%–2%)
 * sin exponer datos internos privados de administración.
 */
export const PUBLIC_CONSORTIUM_COLUMNS =
  "id, property_id, consortium_name, micro_canon_pct, active" as const;

export const FORBIDDEN_ACCESS_CODE_COLUMNS = [
  "access_code_ciphertext",
  "access_code_iv",
  "access_code_auth_tag",
  "accessCodePlain",
] as const;

export const FORBIDDEN_PRIVATE_CONSORTIUM_COLUMNS = [
  "consortium_cuit",
  "porteria_whatsapp",
  "admin_email",
  "consortium_cbu_alias",
] as const;

export interface PublicConsortiumConfig {
  id: string;
  property_id: string;
  consortium_name: string;
  micro_canon_pct: number;
  active: boolean;
}

export function sanitizePublicConsortiumConfig(
  raw: Record<string, unknown> | PublicConsortiumConfig | null | undefined
): PublicConsortiumConfig | null {
  if (!raw || !Boolean(raw.active)) return null;
  return {
    id: String(raw.id),
    property_id: String(raw.property_id),
    consortium_name: String(raw.consortium_name),
    micro_canon_pct: Number(raw.micro_canon_pct ?? 0),
    active: Boolean(raw.active),
  };
}

export interface OccupiedDateRange {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
}

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
  consortium_config?: PublicConsortiumConfig | null;
}

const DEFAULT_BENTO_FALLBACK_IMAGES: ReadonlyArray<{
  url: string;
  suffix: string;
}> = [
  {
    url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp",
    suffix: "Living comedor principal con luz natural",
  },
  {
    url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80&fm=webp",
    suffix: "Dormitorio principal equipado para estadía ejecutiva",
  },
  {
    url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80&fm=webp",
    suffix: "Espacio de trabajo con Wi-Fi de fibra simétrica",
  },
  {
    url: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=80&fm=webp",
    suffix: "Cocina integrada equipada para Media Estadía",
  },
  {
    url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80&fm=webp",
    suffix: "Baño completo y detalles de categoría consorcial",
  },
];

export function normalizePropertyImages(
  rawImages: unknown,
  fallbackTitle: string
): PropertyImageItem[] {
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
 * Construye exactamente 5 fotografías con dimensiones explícitas (`1200x900`, `CLS = 0`)
 * para la Galería Bento estilo Airbnb Argentina en `/p/[slug]`.
 */
export function buildBentoGalleryImages(
  images: PropertyImageItem[],
  propertyTitle: string
): [
  PropertyImageItem,
  PropertyImageItem,
  PropertyImageItem,
  PropertyImageItem,
  PropertyImageItem,
] {
  const result: PropertyImageItem[] = [...images.slice(0, 5)];
  let idx = 0;
  while (result.length < 5) {
    const preset =
      DEFAULT_BENTO_FALLBACK_IMAGES[idx % DEFAULT_BENTO_FALLBACK_IMAGES.length]!;
    result.push({
      url: preset.url,
      alt: `${propertyTitle} — ${preset.suffix}`,
      width: 1200,
      height: 900,
      mimeType: "image/webp",
      sizeBytes: 215000,
    });
    idx += 1;
  }
  return [result[0]!, result[1]!, result[2]!, result[3]!, result[4]!];
}

/**
 * Sanitizador defensivo que garantiza que ninguna columna criptográfica del PIN
 * viaje en respuestas generales o payloads de React Server Components.
 */
export function sanitizePublicPropertyRow(
  row: Record<string, unknown>,
  consortiumConfig?: PublicConsortiumConfig | null
): SafePropertyRecord {
  const clone = { ...row };
  for (const forbidden of FORBIDDEN_ACCESS_CODE_COLUMNS) {
    delete clone[forbidden];
  }
  for (const forbiddenConsortium of FORBIDDEN_PRIVATE_CONSORTIUM_COLUMNS) {
    delete clone[forbiddenConsortium];
  }

  const title = String(clone.title ?? "Unidad Funcional I-bita");
  const safeConsortium = sanitizePublicConsortiumConfig(
    consortiumConfig as unknown as Record<string, unknown> | null | undefined
  );

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
    consortium_config: safeConsortium,
  };
}

/**
 * Consulta una propiedad publicada por `slug` seleccionando explícitamente
 * solo las columnas descriptivas y tarifarias (`PUBLIC_PROPERTY_COLUMNS`) y su
 * configuración consorcial activa (`PUBLIC_CONSORTIUM_COLUMNS`).
 * Excluye físicamente `access_code_ciphertext`, `access_code_iv` y `access_code_auth_tag`.
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

  const { data: consortiumData } = await supabase
    .from("consortium_configs")
    .select(PUBLIC_CONSORTIUM_COLUMNS)
    .eq("property_id", data.id)
    .eq("active", true)
    .maybeSingle();

  const consortiumConfig = sanitizePublicConsortiumConfig(
    consortiumData as unknown as Record<string, unknown> | null
  );

  return sanitizePublicPropertyRow(
    data as unknown as Record<string, unknown>,
    consortiumConfig
  );
}

/**
 * Consulta los rangos de fechas ocupadas o bloqueadas por iCal de una propiedad publicada
 * seleccionando exclusivamente `id, check_in, check_out, status` de `public.bookings`.
 * Jamás expone PII de huéspedes ni datos de acceso.
 */
export async function getPropertyOccupiedDateRanges(
  propertyId: string
): Promise<OccupiedDateRange[]> {
  const cleanPropertyId = propertyId.trim();
  if (!cleanPropertyId) return [];

  const supabase = await getPublicSupabaseClient();

  const { data, error } = await supabase
    .from("bookings")
    .select("id, check_in, check_out, status")
    .eq("property_id", cleanPropertyId)
    .not("status", "in", '("CANCELLED","EXPIRED")')
    .order("check_in", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: String(row.id),
    checkIn: String(row.check_in),
    checkOut: String(row.check_out),
    status: String(row.status),
  }));
}

/**
 * Lista todas las Unidades Funcionales publicadas seleccionando explícitamente
 * solo las columnas descriptivas y tarifarias (`PUBLIC_PROPERTY_COLUMNS`) y sus
 * configuraciones públicas de consorcio (`PUBLIC_CONSORTIUM_COLUMNS`).
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
  if (error || !data || data.length === 0) {
    return [];
  }

  const propertyIds = data.map((row) => String(row.id));
  const { data: consortiumRows } = await supabase
    .from("consortium_configs")
    .select(PUBLIC_CONSORTIUM_COLUMNS)
    .in("property_id", propertyIds)
    .eq("active", true);

  const consortiumByPropId = new Map<string, PublicConsortiumConfig>();
  for (const cRow of consortiumRows ?? []) {
    const cleanConfig = sanitizePublicConsortiumConfig(
      cRow as unknown as Record<string, unknown>
    );
    if (cleanConfig) {
      consortiumByPropId.set(cleanConfig.property_id, cleanConfig);
    }
  }

  return data.map((row) =>
    sanitizePublicPropertyRow(
      row as unknown as Record<string, unknown>,
      consortiumByPropId.get(String(row.id)) ?? null
    )
  );
}

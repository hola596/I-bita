"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import {
  UpsertConsortiumConfigSchema,
  GetConsortiumConfigSchema,
  type UpsertConsortiumConfigInput,
  type GetConsortiumConfigInput,
  type MicroCanonPct,
} from "./validators";

export interface HostConsortiumConfigRecord {
  id: string;
  property_id: string;
  consortium_name: string;
  consortium_cuit: string | null;
  porteria_whatsapp: string;
  admin_email: string;
  micro_canon_pct: MicroCanonPct;
  consortium_cbu_alias: string | null;
  active: boolean;
  created_at: string;
}

/**
 * Columnas privadas reservadas exclusivamente al Anfitrión dueño de la propiedad (`host_id = auth.uid()`).
 * Jamás deben exponerse en consultas públicas de `/p/[slug]` ni del Marketplace.
 */
const PRIVATE_CONSORTIUM_ADMIN_COLUMNS = [
  "consortium_cuit",
  "porteria_whatsapp",
  "admin_email",
  "consortium_cbu_alias",
] as const;

export type PrivateConsortiumAdminColumn =
  (typeof PRIVATE_CONSORTIUM_ADMIN_COLUMNS)[number];

function createServerPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

function mapConsortiumConfigRow(
  row: Record<string, unknown>
): HostConsortiumConfigRecord {
  const rawPct = Number(row.micro_canon_pct ?? 0);
  const safePct: MicroCanonPct =
    rawPct === 1 || rawPct === 1.5 || rawPct === 2 ? rawPct : 0;

  return {
    id: String(row.id),
    property_id: String(row.property_id),
    consortium_name: String(row.consortium_name),
    consortium_cuit:
      row.consortium_cuit !== null && row.consortium_cuit !== undefined
        ? String(row.consortium_cuit)
        : null,
    porteria_whatsapp: String(row.porteria_whatsapp),
    admin_email: String(row.admin_email),
    micro_canon_pct: safePct,
    consortium_cbu_alias:
      row.consortium_cbu_alias !== null &&
      row.consortium_cbu_alias !== undefined
        ? String(row.consortium_cbu_alias)
        : null,
    active: Boolean(row.active),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? new Date().toISOString()),
  };
}

async function resolveAuthenticatedUserId(): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Crea o actualiza (`INSERT ... ON CONFLICT (property_id) DO UPDATE`) la configuración
 * "Consorcio Friendly" y la regla de Micro-Canon Consorcial (`0%`, `1%`, `1.5%` o `2%`)
 * en `public.consortium_configs`, verificando estrictamente que la propiedad pertenezca
 * al Anfitrión autenticado (`auth.uid() = host_id`).
 */
export async function upsertConsortiumConfigAction(
  rawInput: UpsertConsortiumConfigInput
): Promise<ActionResult<HostConsortiumConfigRecord>> {
  const parsed = UpsertConsortiumConfigSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para la configuración Consorcio Friendly.",
        details: parsed.error.flatten(),
      },
    };
  }

  const {
    propertyId,
    consortiumName,
    consortiumCuit,
    porteriaWhatsapp,
    adminEmail,
    microCanonPct,
    consortiumCbuAlias,
    active,
    hostId: explicitHostId,
  } = parsed.data;

  const authenticatedUserId = await resolveAuthenticatedUserId();

  if (
    authenticatedUserId &&
    explicitHostId &&
    authenticatedUserId !== explicitHostId
  ) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "El identificador de Anfitrión no coincide con la sesión autenticada actual.",
      },
    };
  }

  const effectiveHostId = authenticatedUserId ?? explicitHostId ?? null;
  if (!effectiveHostId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión como Anfitrión para configurar el perfil Consorcio Friendly.",
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    await pgClient.query("BEGIN");

    // 1. Verificar que la Unidad Funcional exista y pertenezca a `effectiveHostId` (RLS / Ownership)
    const propRes = await pgClient.query<{
      id: string;
      host_id: string;
      slug: string;
      title: string;
    }>(
      `SELECT id, host_id, slug, title
       FROM public.properties
       WHERE id = $1
       LIMIT 1`,
      [propertyId]
    );

    const property = propRes.rows[0];
    if (!property) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "La Unidad Funcional indicada no existe.",
        },
      };
    }

    if (property.host_id !== effectiveHostId) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message:
            "No tenés permisos de Anfitrión sobre esta Unidad Funcional para modificar su configuración consorcial.",
        },
      };
    }

    // 2. Persistir mediante INSERT ... ON CONFLICT (property_id) DO UPDATE en public.consortium_configs
    const upsertRes = await pgClient.query<Record<string, unknown>>(
      `INSERT INTO public.consortium_configs (
         property_id,
         consortium_name,
         consortium_cuit,
         porteria_whatsapp,
         admin_email,
         micro_canon_pct,
         consortium_cbu_alias,
         active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (property_id) DO UPDATE SET
         consortium_name = EXCLUDED.consortium_name,
         consortium_cuit = EXCLUDED.consortium_cuit,
         porteria_whatsapp = EXCLUDED.porteria_whatsapp,
         admin_email = EXCLUDED.admin_email,
         micro_canon_pct = EXCLUDED.micro_canon_pct,
         consortium_cbu_alias = EXCLUDED.consortium_cbu_alias,
         active = EXCLUDED.active
       RETURNING
         id,
         property_id,
         consortium_name,
         consortium_cuit,
         porteria_whatsapp,
         admin_email,
         micro_canon_pct,
         consortium_cbu_alias,
         active,
         created_at`,
      [
        propertyId,
        consortiumName,
        consortiumCuit,
        porteriaWhatsapp,
        adminEmail,
        microCanonPct.toFixed(2),
        consortiumCbuAlias,
        active,
      ]
    );

    const savedRow = upsertRes.rows[0];
    if (!savedRow) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            "No se pudo guardar la configuración Consorcio Friendly en Supabase.",
        },
      };
    }

    await pgClient.query("COMMIT");

    try {
      revalidatePath("/dashboard/propiedades");
      revalidatePath(`/p/${property.slug}`);
      revalidatePath("/");
    } catch {
      // Ignorar si se invoca desde el runner CLI fuera del contexto de Next.js
    }

    return {
      ok: true,
      data: mapConsortiumConfigRow(savedRow),
    };
  } catch (err: unknown) {
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // Ignorar error secundario en rollback
    }

    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);

    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Obtiene la configuración completa de `public.consortium_configs` (incluyendo WhatsApp de portería,
 * email de administración, CUIT y CBU/Alias consorcial) exclusivamente para el Anfitrión dueño
 * de la Unidad Funcional (`auth.uid() = host_id`).
 */
export async function getHostConsortiumConfigAction(
  propertyIdOrInput: string | GetConsortiumConfigInput,
  maybeHostId?: string
): Promise<ActionResult<HostConsortiumConfigRecord | null>> {
  const rawPayload: GetConsortiumConfigInput =
    typeof propertyIdOrInput === "string"
      ? { propertyId: propertyIdOrInput, hostId: maybeHostId }
      : propertyIdOrInput;

  const parsed = GetConsortiumConfigSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "ID de Unidad Funcional inválido.",
        details: parsed.error.flatten(),
      },
    };
  }

  const authenticatedUserId = await resolveAuthenticatedUserId();
  if (
    authenticatedUserId &&
    parsed.data.hostId &&
    authenticatedUserId !== parsed.data.hostId
  ) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "El identificador de Anfitrión no coincide con la sesión autenticada actual.",
      },
    };
  }

  const effectiveHostId = authenticatedUserId ?? parsed.data.hostId ?? null;
  if (!effectiveHostId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión como Anfitrión para consultar los datos privados de administración del consorcio.",
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    const propRes = await pgClient.query<{ id: string; host_id: string }>(
      `SELECT id, host_id FROM public.properties WHERE id = $1 LIMIT 1`,
      [parsed.data.propertyId]
    );

    const property = propRes.rows[0];
    if (!property) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "La Unidad Funcional solicitada no existe.",
        },
      };
    }

    if (property.host_id !== effectiveHostId) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message:
            "No tenés permisos sobre esta Unidad Funcional para acceder a los datos de administración del consorcio.",
        },
      };
    }

    const configRes = await pgClient.query<Record<string, unknown>>(
      `SELECT
         id,
         property_id,
         consortium_name,
         consortium_cuit,
         porteria_whatsapp,
         admin_email,
         micro_canon_pct,
         consortium_cbu_alias,
         active,
         created_at
       FROM public.consortium_configs
       WHERE property_id = $1
       LIMIT 1`,
      [parsed.data.propertyId]
    );

    const row = configRes.rows[0];
    return {
      ok: true,
      data: row ? mapConsortiumConfigRow(row) : null,
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
      },
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Lista todas las configuraciones consorciales pertenecientes a las propiedades
 * del Anfitrión autenticado, indexadas por `property_id`.
 */
export async function listHostConsortiumConfigsAction(
  explicitHostId?: string
): Promise<ActionResult<Record<string, HostConsortiumConfigRecord>>> {
  const authenticatedUserId = await resolveAuthenticatedUserId();
  const effectiveHostId = authenticatedUserId ?? explicitHostId ?? null;

  if (!effectiveHostId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sesión de Anfitrión no iniciada.",
      },
    };
  }

  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    const res = await pgClient.query<Record<string, unknown>>(
      `SELECT
         cc.id,
         cc.property_id,
         cc.consortium_name,
         cc.consortium_cuit,
         cc.porteria_whatsapp,
         cc.admin_email,
         cc.micro_canon_pct,
         cc.consortium_cbu_alias,
         cc.active,
         cc.created_at
       FROM public.consortium_configs cc
       INNER JOIN public.properties p ON p.id = cc.property_id
       WHERE p.host_id = $1`,
      [effectiveHostId]
    );

    const byPropertyId: Record<string, HostConsortiumConfigRecord> = {};
    for (const row of res.rows) {
      const mapped = mapConsortiumConfigRow(row);
      byPropertyId[mapped.property_id] = mapped;
    }

    return {
      ok: true,
      data: byPropertyId,
    };
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    const appErr =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
      },
    };
  } finally {
    await pgClient.end();
  }
}

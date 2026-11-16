"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import * as nodeIcal from "node-ical";
import ical, {
  ICalCalendarMethod,
  ICalEventStatus,
} from "ical-generator";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import { assertSafeExternalUrl } from "./ssrf-guard";
import {
  ICAL_DEFAULT_TIMEZONE,
  ICAL_PROD_ID,
  PropertyIdParamSchema,
  RegisterIcalFeedSchema,
  SyncIcalFeedSchema,
  type RegisterIcalFeedInput,
  type SyncIcalFeedInput,
} from "./validators";

export interface NormalizedIcalEvent {
  uid: string;
  summary: string;
  checkIn: string; // YYYY-MM-DD en America/Argentina/Buenos_Aires
  checkOut: string; // YYYY-MM-DD en America/Argentina/Buenos_Aires
  timezone: typeof ICAL_DEFAULT_TIMEZONE;
}

export interface IcalOverlapConflict {
  uid: string;
  checkIn: string;
  checkOut: string;
  sqlState: "23P01";
  errorCode: "BOOKING_OVERLAP_CONFLICT";
  message: string;
}

export interface IcalSyncSummary {
  propertyId: string;
  feedId: string | null;
  feedUrl: string;
  sourceName: string;
  timezone: typeof ICAL_DEFAULT_TIMEZONE;
  parsedEventsCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  conflictsCount: number;
  overlappingConflictsCount: number;
  conflicts: IcalOverlapConflict[];
  syncedAt: string;
  statusMessage: string;
}

export interface IcalFeedRecord {
  id: string;
  property_id: string;
  source_name: string;
  feed_url: string;
  last_synced_at: string | null;
  last_sync_status: string | null;
  created_at: string;
}

function createServerPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

/**
 * Convierte un objeto `Date` proveniente de `node-ical` a fecha calendario `YYYY-MM-DD`
 * normalizada en la zona horaria `America/Argentina/Buenos_Aires`.
 */
function formatIcalDateToBuenosAires(
  dateVal: Date,
  isDateOnly: boolean
): string {
  if (isDateOnly) {
    const year = dateVal.getFullYear();
    const month = String(dateVal.getMonth() + 1).padStart(2, "0");
    const day = String(dateVal.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ICAL_DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(dateVal);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

/**
 * Parsea un documento `.ics` RFC 5545 usando `node-ical` y normaliza todos los componentes
 * `VEVENT` activos a fechas `check_in` y `check_out` en `America/Argentina/Buenos_Aires`.
 */
export async function parseIcalContentWithNodeIcalAction(
  icsContent: string
): Promise<NormalizedIcalEvent[]> {
  if (!icsContent || !icsContent.includes("BEGIN:VCALENDAR")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El contenido descargado no es un calendario iCal RFC 5545 válido (falta BEGIN:VCALENDAR).",
      422
    );
  }

  const parsedCalendar = nodeIcal.sync.parseICS(icsContent);
  const events: NormalizedIcalEvent[] = [];

  for (const component of Object.values(parsedCalendar)) {
    if (!component || component.type !== "VEVENT") {
      continue;
    }

    const vEvent = component as nodeIcal.VEvent;
    if (vEvent.status && String(vEvent.status).toUpperCase() === "CANCELLED") {
      continue;
    }

    const rawUid = typeof vEvent.uid === "string" ? vEvent.uid.trim() : "";
    if (!rawUid || !(vEvent.start instanceof Date)) {
      continue;
    }

    const isStartDateOnly =
      vEvent.datetype === "date" ||
      Boolean((vEvent.start as Date & { dateOnly?: boolean }).dateOnly);

    const checkIn = formatIcalDateToBuenosAires(vEvent.start, isStartDateOnly);

    let checkOut: string;
    if (vEvent.end instanceof Date) {
      const isEndDateOnly =
        vEvent.datetype === "date" ||
        Boolean((vEvent.end as Date & { dateOnly?: boolean }).dateOnly);
      checkOut = formatIcalDateToBuenosAires(vEvent.end, isEndDateOnly);
    } else {
      const nextDay = new Date(`${checkIn}T12:00:00-03:00`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      checkOut = formatIcalDateToBuenosAires(nextDay, false);
    }

    if (checkOut <= checkIn) {
      continue;
    }

    const rawSummary =
      typeof vEvent.summary === "string" && vEvent.summary.trim().length > 0
        ? vEvent.summary.trim()
        : "Bloqueo Externo iCal";

    events.push({
      uid: rawUid,
      summary: rawSummary,
      checkIn,
      checkOut,
      timezone: ICAL_DEFAULT_TIMEZONE,
    });
  }

  return events;
}

/**
 * Descarga un feed `.ics` externo ejecutando PRIMERO el escudo Anti-SSRF `assertSafeExternalUrl`
 * y bloqueando cualquier redirección HTTP (`redirect: "error"`).
 */
export async function fetchExternalIcalTextSafeAction(
  rawUrl: string
): Promise<string> {
  // 1. INVARIANTE CRÍTICA (AC-1 / Subtarea 2.2.2): Validar Anti-SSRF antes de abrir cualquier socket
  const safeUrl = await assertSafeExternalUrl(rawUrl);

  let response: Response;
  try {
    response = await fetch(safeUrl.toString(), {
      method: "GET",
      redirect: "error", // AC-2: Prohibido seguir redirecciones 301/302 hacia IPs internas
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
        "User-Agent": "I-bita-ChannelManager/1.0 (+https://i-bita.ar)",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
  } catch (fetchErr) {
    const msg = String(fetchErr);
    if (msg.toLowerCase().includes("redirect")) {
      throw new AppError(
        "SSRF_BLOCKED_ERROR",
        `Redirección HTTP bloqueada por política Anti-SSRF (redirect: "error") en URL: ${safeUrl.toString()}`,
        422,
        { url: safeUrl.toString(), cause: msg }
      );
    }
    throw new AppError(
      "VALIDATION_ERROR",
      `No se pudo descargar el calendario externo iCal desde ${safeUrl.hostname}: ${msg}`,
      422,
      { url: safeUrl.toString(), cause: msg }
    );
  }

  if (!response.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `El servidor externo respondió con estado HTTP ${response.status} al consultar el calendario .ics.`,
      422,
      { status: response.status, url: safeUrl.toString() }
    );
  }

  return response.text();
}

/**
 * Ingesta de forma idempotente por `external_ical_uid` una lista de eventos `VEVENT`
 * dentro de `public.bookings` (`status = 'ICAL_BLOCK'`), capturando explícitamente
 * colisiones `SQLSTATE 23P01` (`no_overlapping_active_bookings` de `btree_gist`).
 * Soporta tanto el cliente RLS autenticado del Anfitrión (`supabase`) como conexión directa
 * de servidor a Supabase Cloud PostgreSQL.
 */
export async function ingestNormalizedIcalEventsAction(params: {
  supabase?: SupabaseClient;
  propertyId: string;
  feedUrl: string;
  sourceName: string;
  feedId?: string;
  events: NormalizedIcalEvent[];
}): Promise<IcalSyncSummary> {
  const { supabase, propertyId, feedUrl, sourceName, feedId, events } = params;

  let insertedCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  const conflicts: IcalOverlapConflict[] = [];
  const syncedAt = new Date().toISOString();

  if (supabase) {
    for (const ev of events) {
      const { data: existingRow, error: lookupError } = await supabase
        .from("bookings")
        .select("id, property_id, check_in, check_out, status, external_ical_uid")
        .eq("external_ical_uid", ev.uid)
        .maybeSingle();

      if (lookupError) {
        throw AppError.fromPostgresError(lookupError);
      }

      if (existingRow) {
        if (
          existingRow.property_id === propertyId &&
          existingRow.check_in === ev.checkIn &&
          existingRow.check_out === ev.checkOut &&
          existingRow.status === "ICAL_BLOCK"
        ) {
          unchangedCount += 1;
          continue;
        }

        const { error: updateError } = await supabase
          .from("bookings")
          .update({
            check_in: ev.checkIn,
            check_out: ev.checkOut,
            status: "ICAL_BLOCK",
            updated_at: syncedAt,
          })
          .eq("id", existingRow.id)
          .eq("property_id", propertyId);

        if (updateError) {
          if (updateError.code === "23P01") {
            conflicts.push({
              uid: ev.uid,
              checkIn: ev.checkIn,
              checkOut: ev.checkOut,
              sqlState: "23P01",
              errorCode: "BOOKING_OVERLAP_CONFLICT",
              message:
                updateError.message ||
                "Colisión detectada por constraint btree_gist (no_overlapping_active_bookings).",
            });
            continue;
          }
          throw AppError.fromPostgresError(updateError);
        }

        updatedCount += 1;
        continue;
      }

      const { error: insertError } = await supabase.from("bookings").insert({
        property_id: propertyId,
        guest_id: null,
        check_in: ev.checkIn,
        check_out: ev.checkOut,
        declared_adults_count: 1,
        verified_adults_count: 0,
        status: "ICAL_BLOCK",
        payment_currency: "ARS",
        total_amount: 0,
        platform_fee_pct: 0,
        platform_fee_amount: 0,
        consortium_canon_amount: 0,
        host_net_amount: 0,
        escrow_deposit_usdt: 0,
        external_ical_uid: ev.uid,
      });

      if (insertError) {
        if (insertError.code === "23P01") {
          conflicts.push({
            uid: ev.uid,
            checkIn: ev.checkIn,
            checkOut: ev.checkOut,
            sqlState: "23P01",
            errorCode: "BOOKING_OVERLAP_CONFLICT",
            message:
              insertError.message ||
              "Colisión detectada por constraint btree_gist (no_overlapping_active_bookings).",
          });
          continue;
        }
        throw AppError.fromPostgresError(insertError);
      }

      insertedCount += 1;
    }

    const statusMessage =
      conflicts.length > 0
        ? `SYNC_WITH_CONFLICTS: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios, ${conflicts.length} colisiones 23P01 omitidas`
        : `OK: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios`;

    let resolvedFeedId: string | null = feedId ?? null;
    if (!resolvedFeedId) {
      const { data: existingFeed } = await supabase
        .from("ical_feeds")
        .select("id")
        .eq("property_id", propertyId)
        .eq("feed_url", feedUrl)
        .maybeSingle();

      resolvedFeedId = existingFeed?.id ? String(existingFeed.id) : null;
    }

    if (resolvedFeedId) {
      await supabase
        .from("ical_feeds")
        .update({
          source_name: sourceName,
          last_synced_at: syncedAt,
          last_sync_status: statusMessage,
        })
        .eq("id", resolvedFeedId);
    } else {
      const { data: createdFeed } = await supabase
        .from("ical_feeds")
        .insert({
          property_id: propertyId,
          source_name: sourceName,
          feed_url: feedUrl,
          last_synced_at: syncedAt,
          last_sync_status: statusMessage,
        })
        .select("id")
        .maybeSingle();

      resolvedFeedId = createdFeed?.id ? String(createdFeed.id) : null;
    }

    return {
      propertyId,
      feedId: resolvedFeedId,
      feedUrl,
      sourceName,
      timezone: ICAL_DEFAULT_TIMEZONE,
      parsedEventsCount: events.length,
      insertedCount,
      updatedCount,
      unchangedCount,
      conflictsCount: conflicts.length,
      overlappingConflictsCount: conflicts.length,
      conflicts,
      syncedAt,
      statusMessage,
    };
  }

  // Ejecución en contexto de sincronizador de servidor / CLI sobre Supabase Cloud PostgreSQL
  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    for (const ev of events) {
      const existingRes = await pgClient.query<{
        id: string;
        property_id: string;
        check_in: string;
        check_out: string;
        status: string;
        external_ical_uid: string;
      }>(
        `SELECT id, property_id, check_in::text AS check_in, check_out::text AS check_out, status::text AS status, external_ical_uid
         FROM public.bookings
         WHERE external_ical_uid = $1
         LIMIT 1`,
        [ev.uid]
      );

      const existingRow = existingRes.rows[0];
      if (existingRow) {
        if (
          existingRow.property_id === propertyId &&
          existingRow.check_in === ev.checkIn &&
          existingRow.check_out === ev.checkOut &&
          existingRow.status === "ICAL_BLOCK"
        ) {
          unchangedCount += 1;
          continue;
        }

        try {
          await pgClient.query(
            `UPDATE public.bookings
             SET check_in = $1::date, check_out = $2::date, status = 'ICAL_BLOCK', updated_at = $3::timestamptz
             WHERE id = $4 AND property_id = $5`,
            [ev.checkIn, ev.checkOut, syncedAt, existingRow.id, propertyId]
          );
          updatedCount += 1;
        } catch (pgErr: unknown) {
          const errObj = pgErr as { code?: string; message?: string };
          if (errObj.code === "23P01") {
            conflicts.push({
              uid: ev.uid,
              checkIn: ev.checkIn,
              checkOut: ev.checkOut,
              sqlState: "23P01",
              errorCode: "BOOKING_OVERLAP_CONFLICT",
              message:
                errObj.message ||
                "Colisión detectada por constraint btree_gist (no_overlapping_active_bookings).",
            });
            continue;
          }
          throw AppError.fromPostgresError(errObj);
        }
        continue;
      }

      try {
        await pgClient.query(
          `INSERT INTO public.bookings (
             property_id, guest_id, check_in, check_out, declared_adults_count, verified_adults_count,
             status, payment_currency, total_amount, platform_fee_pct, platform_fee_amount,
             consortium_canon_amount, host_net_amount, escrow_deposit_usdt, external_ical_uid
           ) VALUES ($1, NULL, $2::date, $3::date, 1, 0, 'ICAL_BLOCK', 'ARS', 0, 0, 0, 0, 0, 0, $4)`,
          [propertyId, ev.checkIn, ev.checkOut, ev.uid]
        );
        insertedCount += 1;
      } catch (pgErr: unknown) {
        const errObj = pgErr as { code?: string; message?: string };
        if (errObj.code === "23P01") {
          conflicts.push({
            uid: ev.uid,
            checkIn: ev.checkIn,
            checkOut: ev.checkOut,
            sqlState: "23P01",
            errorCode: "BOOKING_OVERLAP_CONFLICT",
            message:
              errObj.message ||
              "Colisión detectada por constraint btree_gist (no_overlapping_active_bookings).",
          });
          continue;
        }
        throw AppError.fromPostgresError(errObj);
      }
    }

    const statusMessage =
      conflicts.length > 0
        ? `SYNC_WITH_CONFLICTS: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios, ${conflicts.length} colisiones 23P01 omitidas`
        : `OK: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios`;

    let resolvedFeedId: string | null = feedId ?? null;
    if (!resolvedFeedId) {
      const existingFeedRes = await pgClient.query<{ id: string }>(
        `SELECT id FROM public.ical_feeds WHERE property_id = $1 AND feed_url = $2 LIMIT 1`,
        [propertyId, feedUrl]
      );
      resolvedFeedId = existingFeedRes.rows[0]?.id ?? null;
    }

    if (resolvedFeedId) {
      await pgClient.query(
        `UPDATE public.ical_feeds
         SET source_name = $1, last_synced_at = $2::timestamptz, last_sync_status = $3
         WHERE id = $4`,
        [sourceName, syncedAt, statusMessage, resolvedFeedId]
      );
    } else {
      const insertedFeedRes = await pgClient.query<{ id: string }>(
        `INSERT INTO public.ical_feeds (property_id, source_name, feed_url, last_synced_at, last_sync_status)
         VALUES ($1, $2, $3, $4::timestamptz, $5)
         RETURNING id`,
        [propertyId, sourceName, feedUrl, syncedAt, statusMessage]
      );
      resolvedFeedId = insertedFeedRes.rows[0]?.id ?? null;
    }

    return {
      propertyId,
      feedId: resolvedFeedId,
      feedUrl,
      sourceName,
      timezone: ICAL_DEFAULT_TIMEZONE,
      parsedEventsCount: events.length,
      insertedCount,
      updatedCount,
      unchangedCount,
      conflictsCount: conflicts.length,
      overlappingConflictsCount: conflicts.length,
      conflicts,
      syncedAt,
      statusMessage,
    };
  } finally {
    await pgClient.end();
  }
}

/**
 * Registra un nuevo feed iCal externo para una Unidad Funcional perteneciente al Anfitrión
 * autenticado (`createSupabaseServerClient`), validando primero `assertSafeExternalUrl(feedUrl)`.
 */
export async function registerExternalIcalFeedAction(
  rawInput: RegisterIcalFeedInput
): Promise<ActionResult<IcalFeedRecord>> {
  const parsed = RegisterIcalFeedSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para registrar el calendario iCal externo.",
        details: parsed.error.flatten(),
      },
    };
  }

  // 1. Ejecutar PRIMERO el escudo Anti-SSRF antes de cualquier operación de red o base de datos
  const safeUrl = await assertSafeExternalUrl(parsed.data.feedUrl);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión como Anfitrión para vincular un calendario externo .ics.",
      },
    };
  }

  // Verificar que la propiedad pertenezca al Anfitrión autenticado (RLS)
  const { data: ownedProperty, error: propError } = await supabase
    .from("properties")
    .select("id, slug, host_id")
    .eq("id", parsed.data.propertyId)
    .eq("host_id", user.id)
    .maybeSingle();

  if (propError || !ownedProperty) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "No se encontró la Unidad Funcional o no tenés permisos de Anfitrión sobre ella.",
      },
    };
  }

  const normalizedFeedUrl = safeUrl.toString();

  const { data: existingFeed } = await supabase
    .from("ical_feeds")
    .select(
      "id, property_id, source_name, feed_url, last_synced_at, last_sync_status, created_at"
    )
    .eq("property_id", parsed.data.propertyId)
    .eq("feed_url", normalizedFeedUrl)
    .maybeSingle();

  if (existingFeed) {
    return {
      ok: true,
      data: existingFeed as IcalFeedRecord,
    };
  }

  const { data: insertedFeed, error: insertError } = await supabase
    .from("ical_feeds")
    .insert({
      property_id: parsed.data.propertyId,
      source_name: parsed.data.sourceName,
      feed_url: normalizedFeedUrl,
      last_sync_status: "REGISTERED_PENDING_SYNC",
    })
    .select(
      "id, property_id, source_name, feed_url, last_synced_at, last_sync_status, created_at"
    )
    .single();

  if (insertError || !insertedFeed) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          insertError?.message ??
          "No se pudo guardar el calendario externo iCal.",
      },
    };
  }

  revalidatePath("/dashboard/propiedades");
  revalidatePath(`/p/${ownedProperty.slug}`);

  return {
    ok: true,
    data: insertedFeed as IcalFeedRecord,
  };
}

/**
 * Sincroniza un calendario externo `.ics` para una Unidad Funcional del Anfitrión autenticado:
 * 1. Ejecuta `assertSafeExternalUrl(feedUrl)` antes de abrir cualquier socket (arrojando `SSRF_BLOCKED_ERROR` si es interna).
 * 2. Descarga con `redirect: "error"` y parsea componentes `VEVENT` con `node-ical` en zona `America/Argentina/Buenos_Aires`.
 * 3. Inserta o actualiza idempotentemente por `external_ical_uid` en `public.bookings` (`status = 'ICAL_BLOCK'`)
 *    capturando colisiones `SQLSTATE 23P01` (`btree_gist`).
 */
export async function syncExternalIcalAction(
  propertyIdOrInput: string | SyncIcalFeedInput,
  maybeFeedUrl?: string,
  maybeSourceName = "Airbnb"
): Promise<ActionResult<IcalSyncSummary>> {
  const rawPayload: SyncIcalFeedInput =
    typeof propertyIdOrInput === "string"
      ? {
          propertyId: propertyIdOrInput,
          feedUrl: maybeFeedUrl ?? "",
          sourceName: maybeSourceName,
        }
      : propertyIdOrInput;

  // 1. Ejecutar PRIMERO `assertSafeExternalUrl` sobre la URL antes de cualquier conexión de red.
  // Si apunta a 127.0.0.1, localhost, 10.x, 172.16-31.x, 192.168.x o 169.254.169.254,
  // lanza inmediatamente `AppError("SSRF_BLOCKED_ERROR", ..., 422)`.
  const safeUrl = await assertSafeExternalUrl(rawPayload.feedUrl);

  const parsed = SyncIcalFeedSchema.safeParse({
    ...rawPayload,
    feedUrl: safeUrl.toString(),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Parámetros inválidos para la sincronización iCal.",
        details: parsed.error.flatten(),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión como Anfitrión para sincronizar calendarios externos.",
      },
    };
  }

  const { data: ownedProperty, error: propError } = await supabase
    .from("properties")
    .select("id, slug, host_id")
    .eq("id", parsed.data.propertyId)
    .eq("host_id", user.id)
    .maybeSingle();

  if (propError || !ownedProperty) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "No tenés permisos sobre la Unidad Funcional solicitada o no existe.",
      },
    };
  }

  try {
    const icsText = await fetchExternalIcalTextSafeAction(parsed.data.feedUrl);
    const events = await parseIcalContentWithNodeIcalAction(icsText);

    const summary = await ingestNormalizedIcalEventsAction({
      supabase,
      propertyId: parsed.data.propertyId,
      feedUrl: parsed.data.feedUrl,
      sourceName: parsed.data.sourceName,
      feedId: parsed.data.feedId,
      events,
    });

    revalidatePath("/dashboard/propiedades");
    revalidatePath(`/p/${ownedProperty.slug}`);

    return {
      ok: true,
      data: summary,
    };
  } catch (err) {
    if (err instanceof AppError && err.code === "SSRF_BLOCKED_ERROR") {
      throw err;
    }
    const appErr =
      err instanceof AppError
        ? err
        : new AppError(
            "INTERNAL_ERROR",
            "Error al procesar el calendario externo iCal.",
            500,
            String(err)
          );
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
    };
  }
}

/**
 * Lista los calendarios externos `.ics` registrados para una propiedad del Anfitrión autenticado.
 */
export async function listPropertyIcalFeedsAction(
  propertyId: string
): Promise<ActionResult<IcalFeedRecord[]>> {
  const cleanId = PropertyIdParamSchema.safeParse(propertyId);
  if (!cleanId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de propiedad inválido.",
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sesión no iniciada.",
      },
    };
  }

  const { data, error } = await supabase
    .from("ical_feeds")
    .select(
      "id, property_id, source_name, feed_url, last_synced_at, last_sync_status, created_at"
    )
    .eq("property_id", cleanId.data)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error.message,
      },
    };
  }

  return {
    ok: true,
    data: (data ?? []) as IcalFeedRecord[],
  };
}

/**
 * Construye el calendario RFC 5545 (`.ics`) de una Unidad Funcional usando `ical-generator`
 * en zona horaria `America/Argentina/Buenos_Aires` y `prodId: "//I-bita Argentina//Channel Manager//ES"`.
 * Jamás selecciona ni expone `access_code_*` ni PII de los huéspedes (`AC-3`, `AD-5`).
 */
export async function generatePropertyIcalFeedAction(
  rawPropertyId: string
): Promise<{
  propertyId: string;
  slug: string;
  title: string;
  icsContent: string;
  eventsCount: number;
}> {
  const parsedId = PropertyIdParamSchema.safeParse(rawPropertyId);
  if (!parsedId.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      parsedId.error.issues[0]?.message ?? "El parámetro propertyId no es un UUID válido.",
      400
    );
  }

  const propertyId = parsedId.data;
  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    // Seleccionar exclusivamente metadatos públicos descriptivos (jamás access_code_*)
    const propRes = await pgClient.query<{
      id: string;
      slug: string;
      title: string;
      corridor: string;
      is_published: boolean;
    }>(
      `SELECT id, slug, title, corridor, is_published
       FROM public.properties
       WHERE id = $1 AND is_published = TRUE
       LIMIT 1`,
      [propertyId]
    );

    const property = propRes.rows[0];
    if (!property) {
      throw new AppError(
        "NOT_FOUND",
        `No se encontró una Unidad Funcional publicada con ID "${propertyId}".`,
        404
      );
    }

    // Consultar todas las reservas y bloqueos activos (status NOT IN ('CANCELLED', 'EXPIRED'))
    const bookingsRes = await pgClient.query<{
      id: string;
      property_id: string;
      check_in: string;
      check_out: string;
      status: string;
      external_ical_uid: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `SELECT
         id,
         property_id,
         check_in::text AS check_in,
         check_out::text AS check_out,
         status::text AS status,
         external_ical_uid,
         created_at,
         updated_at
       FROM public.bookings
       WHERE property_id = $1
         AND status NOT IN ('CANCELLED', 'EXPIRED')
       ORDER BY check_in ASC`,
      [propertyId]
    );

    const calendar = ical({
      name: `I-bita — ${property.title}`,
      description: `Calendario de disponibilidad sincronizado — ${property.title} (${property.corridor})`,
      prodId: ICAL_PROD_ID,
      timezone: ICAL_DEFAULT_TIMEZONE,
      method: ICalCalendarMethod.PUBLISH,
    });

    const rows = bookingsRes.rows;

    for (const booking of rows) {
      const checkInDateStr = String(booking.check_in);
      const checkOutDateStr = String(booking.check_out);

      // Check-in 15:00 y Check-out 11:00 en hora oficial Argentina (UTC-3)
      const startDate = new Date(`${checkInDateStr}T15:00:00-03:00`);
      const endDate = new Date(`${checkOutDateStr}T11:00:00-03:00`);

      const isExternalBlock = booking.status === "ICAL_BLOCK";
      const eventUid =
        typeof booking.external_ical_uid === "string" &&
        booking.external_ical_uid.trim().length > 0
          ? booking.external_ical_uid.trim()
          : `ibita-booking-${booking.id}@i-bita.ar`;

      calendar.createEvent({
        id: eventUid,
        start: startDate,
        end: endDate,
        timezone: ICAL_DEFAULT_TIMEZONE,
        summary: isExternalBlock
          ? "Bloqueo Externo iCal"
          : "Reservado — I-bita",
        description: isExternalBlock
          ? "Fecha bloqueada por sincronización de canal externo iCal."
          : "Unidad Funcional reservada en I-bita Argentina (PII y código de acceso protegidos bajo Zero-Trust Consorcial).",
        status: ICalEventStatus.CONFIRMED,
        stamp: booking.updated_at ? new Date(String(booking.updated_at)) : new Date(),
      });
    }

    return {
      propertyId: String(property.id),
      slug: String(property.slug),
      title: String(property.title),
      icsContent: calendar.toString(),
      eventsCount: rows.length,
    };
  } finally {
    await pgClient.end();
  }
}

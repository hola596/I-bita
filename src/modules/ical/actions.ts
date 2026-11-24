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
import { getArgentinaTodayYmd } from "@/lib/calendar/availability";
import { assertSafeExternalUrl } from "./ssrf-guard";
import {
  ConfirmIcalExportSchema,
  DeleteIcalFeedSchema,
  ICAL_DEFAULT_TIMEZONE,
  ICAL_PROD_ID,
  PropertyIdParamSchema,
  RegisterIcalFeedSchema,
  SyncIcalFeedSchema,
  TestExternalIcalSchema,
  type ConfirmIcalExportInput,
  type DeleteIcalFeedInput,
  type RegisterIcalFeedInput,
  type SyncIcalFeedInput,
  type TestExternalIcalInput,
} from "./validators";

const MAX_ICAL_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB defensivo

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
  cancelledCount: number;
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
  export_confirmed_at: string | null;
  last_cancelled_count: number;
  last_error_message: string | null;
  created_at: string;
}

export interface IcalTestPreview {
  sourceName: string;
  normalizedUrl: string;
  totalEventsCount: number;
  upcomingBlocksCount: number;
  nextBlockedRange: { checkIn: string; checkOut: string } | null;
  testedAt: string;
  message: string;
}

function createServerPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

function buildScopedIcalUid(
  propertyId: string,
  feedId: string,
  rawUid: string
): string {
  return `${propertyId}::${feedId}::${rawUid}`;
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
      "El enlace no devolvió un archivo de calendario iCal válido (falta BEGIN:VCALENDAR). Verificá que hayas copiado el link de exportación .ics.",
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
 * Descarga un feed `.ics` externo ejecutando PRIMERO el escudo Anti-SSRF `assertSafeExternalUrl`,
 * bloqueando redirecciones (`redirect: "error"`) y aplicando límite de tamaño de 2 MB.
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
      redirect: "error", // Prohibido seguir redirecciones 301/302 hacia IPs internas
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
    const hint =
      response.status === 401 || response.status === 403
        ? " La plataforma rechazó el acceso: revisá si el enlace secreto venció o fue regenerado."
        : response.status === 404
          ? " El calendario no existe en esa dirección (404): volvé a copiar el link desde tu plataforma."
          : "";
    throw new AppError(
      "VALIDATION_ERROR",
      `El servidor externo respondió con estado HTTP ${response.status}.${hint}`,
      422,
      { status: response.status, url: safeUrl.toString() }
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_ICAL_PAYLOAD_BYTES) {
      throw new AppError(
        "VALIDATION_ERROR",
        "El archivo .ics supera el tamaño máximo permitido (2 MB).",
        422
      );
    }
  }

  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_ICAL_PAYLOAD_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El archivo .ics supera el tamaño máximo permitido (2 MB).",
      422
    );
  }

  return text;
}

/**
 * Prueba en modo estrictamente solo lectura un enlace `.ics` antes de crear una propiedad
 * (ideal para feedback en vivo durante el registro de anfitrión).
 */
export async function testExternalIcalUrlAction(
  rawInput: TestExternalIcalInput
): Promise<ActionResult<IcalTestPreview>> {
  const parsed = TestExternalIcalSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Ingresá una URL .ics válida para probar la conexión.",
        details: parsed.error.flatten(),
      },
    };
  }

  try {
    const safeUrl = await assertSafeExternalUrl(parsed.data.feedUrl);
    const icsText = await fetchExternalIcalTextSafeAction(safeUrl.toString());
    const events = await parseIcalContentWithNodeIcalAction(icsText);

    const todayYmd = getArgentinaTodayYmd();
    const upcomingEvents = events
      .filter((ev) => ev.checkOut >= todayYmd)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

    const firstUpcoming = upcomingEvents[0]
      ? { checkIn: upcomingEvents[0].checkIn, checkOut: upcomingEvents[0].checkOut }
      : null;

    const previewMsg =
      upcomingEvents.length > 0 && firstUpcoming
        ? `Conexión validada con ${parsed.data.sourceName} · Detectamos ${upcomingEvents.length} ${upcomingEvents.length === 1 ? "bloqueo futuro" : "bloqueos futuros"
        } (próximo: ${firstUpcoming.checkIn} al ${firstUpcoming.checkOut}).`
        : events.length > 0
          ? `Conexión validada con ${parsed.data.sourceName} · Calendario legible (${events.length} eventos históricos, 0 bloqueos futuros próximos).`
          : `Conexión validada con ${parsed.data.sourceName} · Calendario activo (sin reservas próximas cargadas todavía).`;

    return {
      ok: true,
      data: {
        sourceName: parsed.data.sourceName,
        normalizedUrl: safeUrl.toString(),
        totalEventsCount: events.length,
        upcomingBlocksCount: upcomingEvents.length,
        nextBlockedRange: firstUpcoming,
        testedAt: new Date().toISOString(),
        message: previewMsg,
      },
    };
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError(
          "VALIDATION_ERROR",
          err instanceof Error
            ? err.message
            : "No se pudo validar el enlace .ics externo.",
          422
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
 * Ingesta idempotente por `external_ical_uid` escopado (`propertyId::feedId::uid`),
 * vinculada a `ical_feed_id`, capturando colisiones `SQLSTATE 23P01` (`btree_gist`)
 * y reconciliando cancelaciones externas (marcando `CANCELLED` los `ICAL_BLOCK` de ese feed
 * que ya no figuren en el `.ics`).
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
  let cancelledCount = 0;
  const conflicts: IcalOverlapConflict[] = [];
  const syncedAt = new Date().toISOString();

  if (supabase) {
    // 1. Asegurar registro en public.ical_feeds ANTES de procesar VEVENTs
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

    if (!resolvedFeedId) {
      const { data: createdFeed, error: createFeedErr } = await supabase
        .from("ical_feeds")
        .insert({
          property_id: propertyId,
          source_name: sourceName,
          feed_url: feedUrl,
          last_sync_status: "SYNCING",
        })
        .select("id")
        .single();

      if (createFeedErr || !createdFeed?.id) {
        throw new AppError(
          "INTERNAL_ERROR",
          createFeedErr?.message ?? "No se pudo registrar el feed iCal en base de datos.",
          500
        );
      }
      resolvedFeedId = String(createdFeed.id);
    }

    const seenBookingIds = new Set<string>();
    const seenScopedUids = new Set<string>();

    for (const ev of events) {
      const scopedUid = buildScopedIcalUid(propertyId, resolvedFeedId, ev.uid);
      seenScopedUids.add(scopedUid);

      let existingRow: {
        id: string;
        property_id: string;
        check_in: string;
        check_out: string;
        status: string;
        external_ical_uid: string | null;
        ical_feed_id: string | null;
      } | null = null;

      const { data: scopedMatch, error: scopedLookupErr } = await supabase
        .from("bookings")
        .select(
          "id, property_id, check_in, check_out, status, external_ical_uid, ical_feed_id"
        )
        .eq("external_ical_uid", scopedUid)
        .maybeSingle();

      if (scopedLookupErr) {
        throw AppError.fromPostgresError(scopedLookupErr);
      }

      if (scopedMatch) {
        existingRow = scopedMatch;
      } else {
        // Compatibilidad con registros legados sin prefijo propertyId::feedId
        const { data: legacyMatch, error: legacyLookupErr } = await supabase
          .from("bookings")
          .select(
            "id, property_id, check_in, check_out, status, external_ical_uid, ical_feed_id"
          )
          .eq("property_id", propertyId)
          .eq("external_ical_uid", ev.uid)
          .maybeSingle();

        if (legacyLookupErr) {
          throw AppError.fromPostgresError(legacyLookupErr);
        }
        if (legacyMatch) {
          existingRow = legacyMatch;
        }
      }

      if (existingRow) {
        seenBookingIds.add(existingRow.id);
        if (
          existingRow.property_id === propertyId &&
          existingRow.check_in === ev.checkIn &&
          existingRow.check_out === ev.checkOut &&
          existingRow.status === "ICAL_BLOCK" &&
          existingRow.external_ical_uid === scopedUid &&
          existingRow.ical_feed_id === resolvedFeedId
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
            external_ical_uid: scopedUid,
            ical_feed_id: resolvedFeedId,
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

      const { data: insertedRow, error: insertError } = await supabase
        .from("bookings")
        .insert({
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
          external_ical_uid: scopedUid,
          ical_feed_id: resolvedFeedId,
        })
        .select("id")
        .maybeSingle();

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

      if (insertedRow?.id) {
        seenBookingIds.add(String(insertedRow.id));
      }
      insertedCount += 1;
    }

    // 2. Reconciliación de cancelaciones: liberar bloqueos ICAL_BLOCK de este feed que desaparecieron
    const { data: activeFeedBlocks } = await supabase
      .from("bookings")
      .select("id, external_ical_uid")
      .eq("property_id", propertyId)
      .eq("ical_feed_id", resolvedFeedId)
      .eq("status", "ICAL_BLOCK");

    const staleIds = (activeFeedBlocks ?? [])
      .filter((row) => {
        const uidVal = typeof row.external_ical_uid === "string" ? row.external_ical_uid : "";
        return !seenBookingIds.has(String(row.id)) && !seenScopedUids.has(uidVal);
      })
      .map((row) => String(row.id));

    if (staleIds.length > 0) {
      const { error: cancelErr } = await supabase
        .from("bookings")
        .update({ status: "CANCELLED", updated_at: syncedAt })
        .in("id", staleIds)
        .eq("property_id", propertyId)
        .eq("status", "ICAL_BLOCK");

      if (!cancelErr) {
        cancelledCount = staleIds.length;
      }
    }

    const cancelledPart =
      cancelledCount > 0 ? `, ${cancelledCount} liberados por cancelación` : "";
    const statusMessage =
      conflicts.length > 0
        ? `SYNC_WITH_CONFLICTS: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios${cancelledPart}, ${conflicts.length} colisiones 23P01 omitidas`
        : `OK: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios${cancelledPart}`;

    await supabase
      .from("ical_feeds")
      .update({
        source_name: sourceName,
        last_synced_at: syncedAt,
        last_sync_status: statusMessage,
        last_cancelled_count: cancelledCount,
        last_error_message: null,
      })
      .eq("id", resolvedFeedId);

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
      cancelledCount,
      conflictsCount: conflicts.length,
      overlappingConflictsCount: conflicts.length,
      conflicts,
      syncedAt,
      statusMessage,
    };
  }

  // Ejecución en contexto de servidor (pg_cron / scripts / route cron) sobre Supabase Cloud PostgreSQL
  const pgClient = createServerPgClient();
  await pgClient.connect();

  try {
    let resolvedFeedId: string | null = feedId ?? null;
    if (!resolvedFeedId) {
      const existingFeedRes = await pgClient.query<{ id: string }>(
        `SELECT id FROM public.ical_feeds WHERE property_id = $1 AND feed_url = $2 LIMIT 1`,
        [propertyId, feedUrl]
      );
      resolvedFeedId = existingFeedRes.rows[0]?.id ?? null;
    }

    if (!resolvedFeedId) {
      const insertedFeedRes = await pgClient.query<{ id: string }>(
        `INSERT INTO public.ical_feeds (property_id, source_name, feed_url, last_sync_status)
         VALUES ($1, $2, $3, 'SYNCING')
         RETURNING id`,
        [propertyId, sourceName, feedUrl]
      );
      resolvedFeedId = insertedFeedRes.rows[0]?.id ?? null;
    }

    if (!resolvedFeedId) {
      throw new AppError(
        "INTERNAL_ERROR",
        "No se pudo resolver o crear el registro ical_feeds.",
        500
      );
    }

    const seenBookingIds = new Set<string>();
    const seenScopedUids = new Set<string>();

    for (const ev of events) {
      const scopedUid = buildScopedIcalUid(propertyId, resolvedFeedId, ev.uid);
      seenScopedUids.add(scopedUid);

      const existingRes = await pgClient.query<{
        id: string;
        property_id: string;
        check_in: string;
        check_out: string;
        status: string;
        external_ical_uid: string | null;
        ical_feed_id: string | null;
      }>(
        `SELECT id, property_id, check_in::text AS check_in, check_out::text AS check_out, status::text AS status, external_ical_uid, ical_feed_id
         FROM public.bookings
         WHERE external_ical_uid = $1
            OR (property_id = $2 AND external_ical_uid = $3)
         ORDER BY CASE WHEN external_ical_uid = $1 THEN 0 ELSE 1 END
         LIMIT 1`,
        [scopedUid, propertyId, ev.uid]
      );

      const existingRow = existingRes.rows[0];
      if (existingRow) {
        seenBookingIds.add(existingRow.id);
        if (
          existingRow.property_id === propertyId &&
          existingRow.check_in === ev.checkIn &&
          existingRow.check_out === ev.checkOut &&
          existingRow.status === "ICAL_BLOCK" &&
          existingRow.external_ical_uid === scopedUid &&
          existingRow.ical_feed_id === resolvedFeedId
        ) {
          unchangedCount += 1;
          continue;
        }

        try {
          await pgClient.query(
            `UPDATE public.bookings
             SET check_in = $1::date,
                 check_out = $2::date,
                 status = 'ICAL_BLOCK',
                 external_ical_uid = $3,
                 ical_feed_id = $4,
                 updated_at = $5::timestamptz
             WHERE id = $6 AND property_id = $7`,
            [
              ev.checkIn,
              ev.checkOut,
              scopedUid,
              resolvedFeedId,
              syncedAt,
              existingRow.id,
              propertyId,
            ]
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
        const insRes = await pgClient.query<{ id: string }>(
          `INSERT INTO public.bookings (
             property_id, guest_id, check_in, check_out, declared_adults_count, verified_adults_count,
             status, payment_currency, total_amount, platform_fee_pct, platform_fee_amount,
             consortium_canon_amount, host_net_amount, escrow_deposit_usdt, external_ical_uid, ical_feed_id
           ) VALUES ($1, NULL, $2::date, $3::date, 1, 0, 'ICAL_BLOCK', 'ARS', 0, 0, 0, 0, 0, 0, $4, $5)
           RETURNING id`,
          [propertyId, ev.checkIn, ev.checkOut, scopedUid, resolvedFeedId]
        );
        if (insRes.rows[0]?.id) {
          seenBookingIds.add(insRes.rows[0].id);
        }
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

    // Reconciliación de cancelaciones en contexto pgClient
    const activeFeedRows = await pgClient.query<{
      id: string;
      external_ical_uid: string | null;
    }>(
      `SELECT id, external_ical_uid
       FROM public.bookings
       WHERE property_id = $1
         AND ical_feed_id = $2
         AND status = 'ICAL_BLOCK'`,
      [propertyId, resolvedFeedId]
    );

    const staleIds = activeFeedRows.rows
      .filter((r) => {
        const uidVal = r.external_ical_uid ?? "";
        return !seenBookingIds.has(r.id) && !seenScopedUids.has(uidVal);
      })
      .map((r) => r.id);

    if (staleIds.length > 0) {
      const cancelRes = await pgClient.query(
        `UPDATE public.bookings
         SET status = 'CANCELLED', updated_at = $1::timestamptz
         WHERE id = ANY($2::uuid[])
           AND property_id = $3
           AND status = 'ICAL_BLOCK'`,
        [syncedAt, staleIds, propertyId]
      );
      cancelledCount = cancelRes.rowCount ?? staleIds.length;
    }

    const cancelledPart =
      cancelledCount > 0 ? `, ${cancelledCount} liberados por cancelación` : "";
    const statusMessage =
      conflicts.length > 0
        ? `SYNC_WITH_CONFLICTS: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios${cancelledPart}, ${conflicts.length} colisiones 23P01 omitidas`
        : `OK: ${insertedCount} nuevos, ${updatedCount} actualizados, ${unchangedCount} sin cambios${cancelledPart}`;

    await pgClient.query(
      `UPDATE public.ical_feeds
       SET source_name = $1,
           last_synced_at = $2::timestamptz,
           last_sync_status = $3,
           last_cancelled_count = $4,
           last_error_message = NULL
       WHERE id = $5`,
      [sourceName, syncedAt, statusMessage, cancelledCount, resolvedFeedId]
    );

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
      cancelledCount,
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
      "id, property_id, source_name, feed_url, last_synced_at, last_sync_status, export_confirmed_at, last_cancelled_count, last_error_message, created_at"
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
      "id, property_id, source_name, feed_url, last_synced_at, last_sync_status, export_confirmed_at, last_cancelled_count, last_error_message, created_at"
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
 * 1. Normaliza `webcal://` -> `https://` y ejecuta `assertSafeExternalUrl(feedUrl)` antes de abrir socket.
 * 2. Descarga con `redirect: "error"` y parsea componentes `VEVENT` con `node-ical` en zona Argentina.
 * 3. Inserta/actualiza idempotentemente por `external_ical_uid` escopado y reconcilia cancelaciones.
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

    if (parsed.data.feedId) {
      await supabase
        .from("ical_feeds")
        .update({
          last_sync_status: `ERROR: ${appErr.message.slice(0, 140)}`,
          last_error_message: appErr.message,
        })
        .eq("id", parsed.data.feedId)
        .eq("property_id", parsed.data.propertyId);
    }

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
      "id, property_id, source_name, feed_url, last_synced_at, last_sync_status, export_confirmed_at, last_cancelled_count, last_error_message, created_at"
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
 * Carga todos los feeds `.ics` de todas las propiedades del anfitrión autenticado en 1 sola consulta
 * para hidratación SSR del panel sin waterfalls.
 */
export async function listHostAllIcalFeedsAction(): Promise<
  ActionResult<Record<string, IcalFeedRecord[]>>
> {
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

  const { data: hostProps } = await supabase
    .from("properties")
    .select("id")
    .eq("host_id", user.id);

  const propIds = (hostProps ?? []).map((p) => String(p.id));
  if (propIds.length === 0) {
    return { ok: true, data: {} };
  }

  const { data: feeds, error } = await supabase
    .from("ical_feeds")
    .select(
      "id, property_id, source_name, feed_url, last_synced_at, last_sync_status, export_confirmed_at, last_cancelled_count, last_error_message, created_at"
    )
    .in("property_id", propIds)
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

  const grouped: Record<string, IcalFeedRecord[]> = {};
  for (const row of feeds ?? []) {
    const pid = String(row.property_id);
    if (!grouped[pid]) {
      grouped[pid] = [];
    }
    grouped[pid]!.push(row as IcalFeedRecord);
  }

  return { ok: true, data: grouped };
}

/**
 * Desconecta un feed `.ics` externo y libera (pasa a CANCELLED) únicamente los bloqueos
 * `ICAL_BLOCK` vinculados a ese feed sin tocar reservas reales de I-bita.
 */
export async function deleteIcalFeedAction(
  rawInput: DeleteIcalFeedInput
): Promise<ActionResult<{ feedId: string; propertyId: string; releasedBlocksCount: number }>> {
  const parsed = DeleteIcalFeedSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Parámetros inválidos.",
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
        message: "Debés iniciar sesión como Anfitrión para desconectar un calendario.",
      },
    };
  }

  const { data: ownedProperty } = await supabase
    .from("properties")
    .select("id, slug")
    .eq("id", parsed.data.propertyId)
    .eq("host_id", user.id)
    .maybeSingle();

  if (!ownedProperty) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "No tenés permisos sobre esa propiedad.",
      },
    };
  }

  const nowIso = new Date().toISOString();
  const { data: cancelledRows } = await supabase
    .from("bookings")
    .update({ status: "CANCELLED", updated_at: nowIso })
    .eq("property_id", parsed.data.propertyId)
    .eq("ical_feed_id", parsed.data.feedId)
    .eq("status", "ICAL_BLOCK")
    .select("id");

  const { error: deleteErr } = await supabase
    .from("ical_feeds")
    .delete()
    .eq("id", parsed.data.feedId)
    .eq("property_id", parsed.data.propertyId);

  if (deleteErr) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: deleteErr.message,
      },
    };
  }

  revalidatePath("/dashboard/propiedades");
  revalidatePath(`/p/${ownedProperty.slug}`);

  return {
    ok: true,
    data: {
      feedId: parsed.data.feedId,
      propertyId: parsed.data.propertyId,
      releasedBlocksCount: cancelledRows?.length ?? 0,
    },
  };
}

/**
 * Registra que el anfitrión confirmó haber pegado el enlace `.ics` de exportación
 * de I-bita en la plataforma externa (Paso 2 bidireccional).
 */
export async function confirmIcalExportStepAction(
  rawInput: ConfirmIcalExportInput
): Promise<ActionResult<{ feedId: string; exportConfirmedAt: string | null }>> {
  const parsed = ConfirmIcalExportSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Parámetros inválidos.",
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

  const { data: ownedProperty } = await supabase
    .from("properties")
    .select("id")
    .eq("id", parsed.data.propertyId)
    .eq("host_id", user.id)
    .maybeSingle();

  if (!ownedProperty) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "No tenés permisos sobre esa propiedad.",
      },
    };
  }

  const confirmedAt = parsed.data.confirmed ? new Date().toISOString() : null;
  const { error: updateErr } = await supabase
    .from("ical_feeds")
    .update({ export_confirmed_at: confirmedAt })
    .eq("id", parsed.data.feedId)
    .eq("property_id", parsed.data.propertyId);

  if (updateErr) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: updateErr.message,
      },
    };
  }

  revalidatePath("/dashboard/propiedades");

  return {
    ok: true,
    data: {
      feedId: parsed.data.feedId,
      exportConfirmedAt: confirmedAt,
    },
  };
}

/**
 * Sincroniza todos los feeds registrados de propiedades activas en segundo plano
 * (invocado por Supabase `pg_cron` -> `/api/internal/ical-sync` cada 20 min).
 */
export async function syncAllRegisteredIcalFeedsServerAction(): Promise<{
  totalFeeds: number;
  succeededFeeds: number;
  failedFeeds: number;
  insertedTotal: number;
  updatedTotal: number;
  cancelledTotal: number;
  conflictsTotal: number;
}> {
  const pgClient = createServerPgClient();
  await pgClient.connect();

  let feeds: Array<{
    id: string;
    property_id: string;
    source_name: string;
    feed_url: string;
  }> = [];

  try {
    const res = await pgClient.query<{
      id: string;
      property_id: string;
      source_name: string;
      feed_url: string;
    }>(
      `SELECT f.id, f.property_id, f.source_name, f.feed_url
       FROM public.ical_feeds f
       JOIN public.properties p ON p.id = f.property_id
       WHERE p.is_published = TRUE
         AND COALESCE(p.estado_regulatorio, 'activo') = 'activo'
       ORDER BY f.last_synced_at ASC NULLS FIRST
       LIMIT 100`
    );
    feeds = res.rows;
  } finally {
    await pgClient.end();
  }

  let succeededFeeds = 0;
  let failedFeeds = 0;
  let insertedTotal = 0;
  let updatedTotal = 0;
  let cancelledTotal = 0;
  let conflictsTotal = 0;

  const BATCH_SIZE = 3;
  for (let i = 0; i < feeds.length; i += BATCH_SIZE) {
    const batch = feeds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (feed) => {
        try {
          const icsText = await fetchExternalIcalTextSafeAction(feed.feed_url);
          const events = await parseIcalContentWithNodeIcalAction(icsText);
          const summary = await ingestNormalizedIcalEventsAction({
            propertyId: feed.property_id,
            feedUrl: feed.feed_url,
            sourceName: feed.source_name,
            feedId: feed.id,
            events,
          });
          succeededFeeds += 1;
          insertedTotal += summary.insertedCount;
          updatedTotal += summary.updatedCount;
          cancelledTotal += summary.cancelledCount;
          conflictsTotal += summary.conflictsCount;
        } catch (err) {
          failedFeeds += 1;
          const errMsg =
            err instanceof Error ? err.message : "Error de sincronización iCal.";
          const errPg = createServerPgClient();
          await errPg.connect();
          try {
            await errPg.query(
              `UPDATE public.ical_feeds
               SET last_sync_status = $1,
                   last_error_message = $2
               WHERE id = $3`,
              [`ERROR: ${errMsg.slice(0, 140)}`, errMsg.slice(0, 500), feed.id]
            );
          } finally {
            await errPg.end();
          }
        }
      })
    );
  }

  return {
    totalFeeds: feeds.length,
    succeededFeeds,
    failedFeeds,
    insertedTotal,
    updatedTotal,
    cancelledTotal,
    conflictsTotal,
  };
}

/**
 * Construye el calendario RFC 5545 (`.ics`) de una Unidad Funcional usando `ical-generator`
 * emitiendo eventos de día completo `VALUE=DATE` con `DTEND` exclusivo (estándar exacto de OTAs)
 * y `timezone: America/Argentina/Buenos_Aires`.
 * - `scope = "native"`: exporta únicamente reservas/bloqueos propios de I-bita (evita eco circular en Airbnb/Booking).
 * - `scope = "all"` (por defecto): calendario consolidado incluyendo bloqueos externos (ideal para Google/Apple Calendar).
 * Jamás selecciona ni expone `access_code_*` ni PII de los huéspedes (`AC-3`, `AD-5`).
 */
export async function generatePropertyIcalFeedAction(
  rawPropertyId: string,
  options?: { scope?: "all" | "native" }
): Promise<{
  propertyId: string;
  slug: string;
  title: string;
  scope: "all" | "native";
  icsContent: string;
  eventsCount: number;
}> {
  const parsedId = PropertyIdParamSchema.safeParse(rawPropertyId);
  if (!parsedId.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      parsedId.error.issues[0]?.message ??
      "El parámetro propertyId no es un UUID válido.",
      400
    );
  }

  const scope = options?.scope === "native" ? "native" : "all";
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

    const statusExclusionClause =
      scope === "native"
        ? `status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK')`
        : `status NOT IN ('CANCELLED', 'EXPIRED')`;

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
         AND ${statusExclusionClause}
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

      // Mediodía UTC evita desfases de fecha (-1 día) al renderizar VALUE=DATE bajo America/Argentina/Buenos_Aires
      const startDate = new Date(`${checkInDateStr}T12:00:00Z`);
      const endDate = new Date(`${checkOutDateStr}T12:00:00Z`);

      const isExternalBlock = booking.status === "ICAL_BLOCK";
      const eventUid =
        typeof booking.external_ical_uid === "string" &&
          booking.external_ical_uid.trim().length > 0
          ? booking.external_ical_uid.trim()
          : `ibita-booking-${booking.id}@i-bita.ar`;

      calendar.createEvent({
        id: eventUid,
        allDay: true,
        start: startDate,
        end: endDate,
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
      scope,
      icsContent: calendar.toString(),
      eventsCount: rows.length,
    };
  } finally {
    await pgClient.end();
  }
}

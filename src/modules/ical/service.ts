import "server-only";
import nodeIcal, { type VEvent } from "node-ical";
import ical, { ICalCalendarMethod } from "ical-generator";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import { PUBLIC_PROPERTY_COLUMNS } from "@/modules/properties/queries";
import { assertSafeExternalUrl } from "./ssrf-guard";

export const ARGENTINA_TIMEZONE = "America/Argentina/Buenos_Aires" as const;
export const IBITA_ICAL_PROD_ID = "//I-bita Argentina//Channel Manager//ES" as const;

export interface ParsedIcalBlock {
  uid: string;
  checkIn: string;
  checkOut: string;
  summary: string;
}

export interface IcalCollisionReport {
  uid: string;
  checkIn: string;
  checkOut: string;
  sqlState: "23P01";
  message: string;
}

export interface IcalSyncSummary {
  propertyId: string;
  sourceName: string;
  feedUrl: string;
  parsedEventsCount: number;
  insertedCount: number;
  updatedCount: number;
  conflictsCount: number;
  conflicts: IcalCollisionReport[];
  lastSyncedAt: string;
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

const argentinaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ARGENTINA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Normaliza un objeto Date de `node-ical` al formato `YYYY-MM-DD`
 * respetando `America/Argentina/Buenos_Aires` para eventos `date-time`
 * y preservando la fecha exacta para eventos `VALUE=DATE` (`dateOnly`).
 */
export function normalizeIcalDateToArgentinaYmd(
  dt: Date & { dateOnly?: boolean },
  datetype?: string
): string {
  if (datetype === "date" || dt.dateOnly === true) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return argentinaDateFormatter.format(dt);
}

/**
 * Parsea un documento `.ics` (RFC 5545) en memoria usando `node-ical`
 * y extrae todos los bloques `VEVENT` activos normalizados a `America/Argentina/Buenos_Aires`.
 */
export function parseIcalStringWithNodeIcal(rawIcsText: string): ParsedIcalBlock[] {
  if (!rawIcsText || !rawIcsText.includes("BEGIN:VCALENDAR")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El contenido descargado no es un archivo iCal RFC 5545 válido (falta BEGIN:VCALENDAR).",
      422
    );
  }

  const parsedMap = nodeIcal.sync.parseICS(rawIcsText);
  const blocks: ParsedIcalBlock[] = [];

  for (const component of Object.values(parsedMap)) {
    if (!component || component.type !== "VEVENT") continue;
    const vevent = component as VEvent;

    if (vevent.status === "CANCELLED") continue;
    if (!vevent.uid || !vevent.start || !vevent.end) continue;

    const checkIn = normalizeIcalDateToArgentinaYmd(
      vevent.start as Date & { dateOnly?: boolean },
      vevent.datetype
    );
    const checkOut = normalizeIcalDateToArgentinaYmd(
      vevent.end as Date & { dateOnly?: boolean },
      vevent.datetype
    );

    if (checkOut <= checkIn) continue;

    blocks.push({
      uid: String(vevent.uid).trim(),
      checkIn,
      checkOut,
      summary: vevent.summary ? String(vevent.summary).trim() : "Bloqueo Externo iCal",
    });
  }

  return blocks;
}

/**
 * Descarga de forma segura el contenido de un calendario `.ics` externo:
 * 1. Ejecuta `assertSafeExternalUrl(feedUrl)` ANTES de abrir cualquier socket.
 * 2. Utiliza `redirect: "error"` para impedir ataques SSRF mediante redirecciones HTTP 301/302/307/308.
 */
export async function downloadSafeExternalIcal(feedUrl: string): Promise<string> {
  const parsedUrl = await assertSafeExternalUrl(feedUrl);

  let response: Response;
  try {
    response = await fetch(parsedUrl.toString(), {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
        "User-Agent": "I-bita-ChannelManager/1.0 (+https://i-bita.ar)",
      },
      signal: AbortSignal.timeout(12000),
    });
  } catch (fetchErr) {
    throw new AppError(
      "VALIDATION_ERROR",
      `No se pudo descargar el calendario externo (redirecciones HTTP bloqueadas por seguridad Anti-SSRF): ${
        fetchErr instanceof Error ? fetchErr.message : "Error de red"
      }`,
      422
    );
  }

  if (!response.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      `El servidor del calendario externo respondió con HTTP ${response.status}`,
      422
    );
  }

  const text = await response.text();
  return text;
}

async function getServerOrAnonClient() {
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
 * Construye el calendario RFC 5545 de una Unidad Funcional utilizando `ical-generator`
 * con zona horaria `America/Argentina/Buenos_Aires` y `prodId: "//I-bita Argentina//Channel Manager//ES"`.
 * Excluye siempre datos sensibles, PII de huéspedes y columnas `access_code_*`.
 */
export async function buildPropertyIcalFeed(propertyId: string): Promise<{
  icsContent: string;
  propertySlug: string;
  eventsCount: number;
}> {
  const cleanId = propertyId.trim().replace(/\.ics$/i, "");
  const supabase = await getServerOrAnonClient();

  const { data: property, error: propErr } = await supabase
    .from("properties")
    .select(PUBLIC_PROPERTY_COLUMNS)
    .eq("id", cleanId)
    .maybeSingle();

  if (propErr || !property) {
    throw new AppError(
      "NOT_FOUND",
      `No se encontró la Unidad Funcional con ID "${cleanId}" para exportar iCal.`,
      404
    );
  }

  // Consultar reservas y bloqueos activos sin exponer PII de huéspedes ni códigos de acceso
  const { data: activeBookings, error: bookingsErr } = await supabase
    .from("bookings")
    .select("id, check_in, check_out, status, external_ical_uid, created_at")
    .eq("property_id", cleanId)
    .not("status", "in", '("CANCELLED","EXPIRED")')
    .order("check_in", { ascending: true });

  if (bookingsErr) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Error al consultar disponibilidad para el feed iCal: ${bookingsErr.message}`,
      500
    );
  }

  const calendar = ical({
    name: `I-bita · ${property.title} (${property.slug})`,
    prodId: IBITA_ICAL_PROD_ID,
    timezone: ARGENTINA_TIMEZONE,
    method: ICalCalendarMethod.PUBLISH,
  });

  const rows = activeBookings ?? [];
  for (const booking of rows) {
    const startParts = String(booking.check_in).split("-").map(Number);
    const endParts = String(booking.check_out).split("-").map(Number);

    const startDate = new Date(
      Date.UTC(startParts[0] ?? 2027, (startParts[1] ?? 1) - 1, startParts[2] ?? 1, 3, 0, 0)
    );
    const endDate = new Date(
      Date.UTC(endParts[0] ?? 2027, (endParts[1] ?? 1) - 1, endParts[2] ?? 2, 3, 0, 0)
    );

    const isExternalBlock = booking.status === "ICAL_BLOCK";
    calendar.createEvent({
      id: `${booking.id}@i-bita.ar`,
      start: startDate,
      end: endDate,
      allDay: true,
      timezone: ARGENTINA_TIMEZONE,
      summary: isExternalBlock
        ? "Bloqueo Externo iCal — I-bita"
        : "Reservado — I-bita",
      description:
        "Unidad Funcional con disponibilidad bloqueada por el Channel Manager de I-bita Argentina (Zero-Trust Consorcial).",
    });
  }

  return {
    icsContent: calendar.toString(),
    propertySlug: String(property.slug),
    eventsCount: rows.length,
  };
}

/**
 * Ingiere de forma idempotente (por `external_ical_uid`) una lista de eventos `VEVENT`
 * dentro de `public.bookings` con `status = 'ICAL_BLOCK'`, capturando explícitamente
 * colisiones `SQLSTATE 23P01` (`no_overlapping_active_bookings` de `btree_gist`)
 * sin corromper las reservas activas existentes.
 */
export async function ingestParsedIcalBlocksForProperty(params: {
  supabaseClient?: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  propertyId: string;
  sourceName: string;
  feedUrl: string;
  feedId?: string;
  parsedBlocks: ParsedIcalBlock[];
}): Promise<IcalSyncSummary> {
  const { propertyId, sourceName, feedUrl, feedId, parsedBlocks } = params;

  const pgClient = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await pgClient.connect();

  let insertedCount = 0;
  let updatedCount = 0;
  let conflictsCount = 0;
  const conflicts: IcalCollisionReport[] = [];

  try {
    for (const block of parsedBlocks) {
      const scopedUid = block.uid.startsWith(`${propertyId}::`)
        ? block.uid
        : `${propertyId}::${block.uid}`;

      const existingRes = await pgClient.query<{ id: string }>(
        `SELECT id FROM public.bookings
         WHERE property_id = $1 AND external_ical_uid = $2
         LIMIT 1`,
        [propertyId, scopedUid]
      );

      const existingRow = existingRes.rows[0];
      if (existingRow) {
        try {
          await pgClient.query(
            `UPDATE public.bookings
             SET check_in = $1, check_out = $2, status = 'ICAL_BLOCK', updated_at = NOW()
             WHERE id = $3 AND property_id = $4`,
            [block.checkIn, block.checkOut, existingRow.id, propertyId]
          );
          updatedCount += 1;
        } catch (pgErr: unknown) {
          const errObj = pgErr as { code?: string; message?: string };
          if (errObj.code === "23P01") {
            conflictsCount += 1;
            conflicts.push({
              uid: block.uid,
              checkIn: block.checkIn,
              checkOut: block.checkOut,
              sqlState: "23P01",
              message: `Colisión detectada por btree_gist (SQLSTATE 23P01) al actualizar UID ${block.uid}`,
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
             property_id, guest_id, check_in, check_out, declared_adults_count, verified_adults_count, status, external_ical_uid
           ) VALUES ($1, NULL, $2, $3, 1, 0, 'ICAL_BLOCK', $4)`,
          [propertyId, block.checkIn, block.checkOut, scopedUid]
        );
        insertedCount += 1;
      } catch (pgErr: unknown) {
        const errObj = pgErr as { code?: string; message?: string };
        if (errObj.code === "23P01") {
          conflictsCount += 1;
          conflicts.push({
            uid: block.uid,
            checkIn: block.checkIn,
            checkOut: block.checkOut,
            sqlState: "23P01",
            message: `El evento externo (${block.checkIn} -> ${block.checkOut}) colisiona con una reserva activa vigente (SQLSTATE 23P01).`,
          });
          continue;
        }
        throw AppError.fromPostgresError(errObj);
      }
    }

    const lastSyncedAt = new Date().toISOString();
    const statusLabel =
      conflictsCount > 0
        ? `OK_WITH_CONFLICTS (insertados=${insertedCount}, actualizados=${updatedCount}, colisiones_23P01=${conflictsCount})`
        : `OK (insertados=${insertedCount}, actualizados=${updatedCount})`;

    if (feedId) {
      await pgClient.query(
        `UPDATE public.ical_feeds
         SET last_synced_at = $1, last_sync_status = $2
         WHERE id = $3 AND property_id = $4`,
        [lastSyncedAt, statusLabel, feedId, propertyId]
      );
    } else {
      const existingFeedRes = await pgClient.query<{ id: string }>(
        `SELECT id FROM public.ical_feeds
         WHERE property_id = $1 AND feed_url = $2
         LIMIT 1`,
        [propertyId, feedUrl]
      );
      const existingFeed = existingFeedRes.rows[0];
      if (existingFeed) {
        await pgClient.query(
          `UPDATE public.ical_feeds
           SET source_name = $1, last_synced_at = $2, last_sync_status = $3
           WHERE id = $4`,
          [sourceName, lastSyncedAt, statusLabel, existingFeed.id]
        );
      } else {
        await pgClient.query(
          `INSERT INTO public.ical_feeds (property_id, source_name, feed_url, last_synced_at, last_sync_status)
           VALUES ($1, $2, $3, $4, $5)`,
          [propertyId, sourceName, feedUrl, lastSyncedAt, statusLabel]
        );
      }
    }

    return {
      propertyId,
      sourceName,
      feedUrl,
      parsedEventsCount: parsedBlocks.length,
      insertedCount,
      updatedCount,
      conflictsCount,
      conflicts,
      lastSyncedAt,
    };
  } finally {
    await pgClient.end();
  }
}

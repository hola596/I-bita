import "server-only";
import { Client } from "pg";
import { env } from "@/env";
import {
  calculateScheduledResponseDeadline,
  computeSynchronizedHostResponseMetrics,
  formatDeadlineEsAr,
  formatResponseScheduleSummary,
  isWithinResponseSchedule,
  normalizeHostResponseSchedule,
  type BookingHostResponseWindowSummary,
  type HostBookingSlaInput,
  type HostResponseMetrics,
} from "@/lib/host/response-schedule";

export interface HostResponseMetricsSummary extends HostResponseMetrics {
  hostName: string;
}

export interface BookingHostResponseState
  extends BookingHostResponseWindowSummary {
  bookingId: string;
  hostId: string;
  hostName: string;
  bookingStatus: string;
}

function createPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

function toIsoString(val: Date | string): string {
  return val instanceof Date ? val.toISOString() : new Date(val).toISOString();
}

/**
 * Consulta la programación confirmada de respuesta de un anfitrión y calcula en vivo
 * su tasa de respuesta sincronizada respecto a todas sus reservas no canceladas.
 */
export async function getHostResponseMetricsSummary(
  hostId: string
): Promise<HostResponseMetricsSummary> {
  const fallbackNormalized = normalizeHostResponseSchedule(null);
  const pg = createPgClient();
  await pg.connect();

  try {
    const [profileRes, bookingsRes] = await Promise.all([
      pg.query<{
        full_name: string | null;
        email: string | null;
        response_schedule: unknown;
      }>(
        `SELECT full_name, email, response_schedule
         FROM public.profiles
         WHERE id = $1
         LIMIT 1`,
        [hostId]
      ),
      pg.query<{
        id: string;
        created_at: Date | string;
        status: string;
        host_response_due_at: Date | string | null;
        host_responded_at: Date | string | null;
        host_responded_on_time: boolean | null;
      }>(
        `SELECT
           b.id,
           b.created_at,
           b.status::text AS status,
           b.host_response_due_at,
           b.host_responded_at,
           b.host_responded_on_time
         FROM public.bookings b
         INNER JOIN public.properties p ON p.id = b.property_id
         WHERE p.host_id = $1
           AND b.status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK')
         ORDER BY b.created_at DESC
         LIMIT 250`,
        [hostId]
      ),
    ]);

    const profileRow = profileRes.rows[0];
    const hostName =
      profileRow?.full_name?.trim() ||
      profileRow?.email?.split("@")[0] ||
      "Anfitrión I-bita";

    const { schedule, isConfigured } = normalizeHostResponseSchedule(
      profileRow?.response_schedule ?? null
    );

    const slaRows: HostBookingSlaInput[] = bookingsRes.rows.map((row) => ({
      id: row.id,
      createdAt: toIsoString(row.created_at),
      status: String(row.status),
      hostResponseDueAt: row.host_response_due_at
        ? toIsoString(row.host_response_due_at)
        : null,
      hostRespondedAt: row.host_responded_at
        ? toIsoString(row.host_responded_at)
        : null,
      hostRespondedOnTime:
        row.host_responded_on_time === null ||
        row.host_responded_on_time === undefined
          ? null
          : Boolean(row.host_responded_on_time),
    }));

    const metrics = computeSynchronizedHostResponseMetrics(
      slaRows,
      schedule,
      isConfigured
    );

    return {
      ...metrics,
      hostName,
    };
  } catch {
    return {
      ...computeSynchronizedHostResponseMetrics(
        [],
        fallbackNormalized.schedule,
        false
      ),
      hostName: "Anfitrión I-bita",
    };
  } finally {
    await pg.end();
  }
}

/**
 * Obtiene la ventana prometida de respuesta para una reserva puntual y la sincroniza
 * con la tasa global del anfitrión para mostrarla en checkout, check-in y confirmación.
 */
export async function getBookingHostResponseState(
  bookingId: string
): Promise<BookingHostResponseState | null> {
  const cleanBookingId = bookingId.trim();
  if (!cleanBookingId) return null;

  const pg = createPgClient();
  let hostId: string | null = null;
  let bookingRow: {
    id: string;
    status: string;
    created_at: Date | string;
    host_response_schedule: unknown;
    host_response_due_at: Date | string | null;
    host_responded_at: Date | string | null;
    host_responded_on_time: boolean | null;
    host_id: string;
    host_name: string | null;
    current_host_schedule: unknown;
  } | null = null;

  await pg.connect();
  try {
    const res = await pg.query<{
      id: string;
      status: string;
      created_at: Date | string;
      host_response_schedule: unknown;
      host_response_due_at: Date | string | null;
      host_responded_at: Date | string | null;
      host_responded_on_time: boolean | null;
      host_id: string;
      host_name: string | null;
      current_host_schedule: unknown;
    }>(
      `SELECT
         b.id,
         b.status::text AS status,
         b.created_at,
         b.host_response_schedule,
         b.host_response_due_at,
         b.host_responded_at,
         b.host_responded_on_time,
         p.host_id,
         h.full_name AS host_name,
         h.response_schedule AS current_host_schedule
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       INNER JOIN public.profiles h ON h.id = p.host_id
       WHERE b.id = $1
       LIMIT 1`,
      [cleanBookingId]
    );

    bookingRow = res.rows[0] ?? null;
    hostId = bookingRow?.host_id ?? null;
  } catch {
    return null;
  } finally {
    await pg.end();
  }

  if (!bookingRow || !hostId) {
    return null;
  }

  const metrics = await getHostResponseMetricsSummary(hostId);
  const { schedule } = normalizeHostResponseSchedule(
    bookingRow.host_response_schedule ?? bookingRow.current_host_schedule
  );
  const createdAtDate = new Date(bookingRow.created_at);
  const dueAtDate = bookingRow.host_response_due_at
    ? new Date(bookingRow.host_response_due_at)
    : calculateScheduledResponseDeadline(createdAtDate, schedule);
  const dueAtIso = dueAtDate.toISOString();

  return {
    bookingId: bookingRow.id,
    hostId,
    hostName: bookingRow.host_name?.trim() || metrics.hostName,
    bookingStatus: bookingRow.status,
    schedule,
    scheduleSummary: formatResponseScheduleSummary(schedule),
    dueAtIso,
    dueAtLabelEsAr: formatDeadlineEsAr(dueAtIso),
    respondedAtIso: bookingRow.host_responded_at
      ? toIsoString(bookingRow.host_responded_at)
      : null,
    respondedOnTime:
      bookingRow.host_responded_on_time === null ||
      bookingRow.host_responded_on_time === undefined
        ? null
        : Boolean(bookingRow.host_responded_on_time),
    responseRatePct: metrics.responseRatePct,
    evaluatedCount: metrics.evaluatedCount,
    isWithinActiveScheduleAtBooking: isWithinResponseSchedule(
      createdAtDate,
      schedule
    ),
  };
}

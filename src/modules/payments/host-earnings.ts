import "server-only";
import { Client } from "pg";
import { env } from "@/env";
import {
  computeHostEarningsSummary,
  type HostBookingEarningInput,
  type HostEarningsSummary,
} from "@/lib/math/host-earnings";

interface HostBookingQueryRow {
  booking_id: string;
  property_id: string;
  property_slug: string;
  property_title: string;
  guest_full_name: string | null;
  check_in: Date | string;
  check_out: Date | string;
  nights_count: number;
  status: string;
  payment_currency: "ARS" | "USD" | "USDT";
  host_net_amount: string;
  has_settled_ledger_entry: boolean;
}

function toYmd(val: Date | string): string {
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
}

/**
 * Consulta los ingresos netos de las estadías pertenecientes al anfitrión autenticado
 * y aplica la regla de liberación a las 48 hs posteriores al check-in del huésped.
 */
export async function getHostEarningsSummary(
  hostUserId: string
): Promise<HostEarningsSummary> {
  const cleanUserId = hostUserId.trim();
  if (!cleanUserId) {
    return computeHostEarningsSummary([]);
  }

  const pg = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  try {
    await pg.connect();

    const res = await pg.query<HostBookingQueryRow>(
      `SELECT
         b.id AS booking_id,
         b.property_id,
         p.slug AS property_slug,
         p.title AS property_title,
         g.full_name AS guest_full_name,
         b.check_in,
         b.check_out,
         b.nights_count,
         b.status::text AS status,
         b.payment_currency::text AS payment_currency,
         b.host_net_amount::text AS host_net_amount,
         EXISTS (
           SELECT 1
           FROM public.ledger_entries le
           WHERE le.booking_id = b.id
             AND le.entry_type = 'HOST_NET_SETTLED'
         ) AS has_settled_ledger_entry
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       LEFT JOIN public.profiles g ON g.id = b.guest_id
       WHERE p.host_id = $1
         AND b.status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK')
       ORDER BY b.check_in DESC
       LIMIT 120`,
      [cleanUserId]
    );

    const mapped: HostBookingEarningInput[] = res.rows.map((row) => {
      const firstGuestName =
        row.guest_full_name?.trim().split(/\s+/)[0] || "Huésped";
      return {
        bookingId: row.booking_id,
        propertyId: row.property_id,
        propertySlug: row.property_slug,
        propertyTitle: row.property_title,
        guestDisplayName: firstGuestName,
        checkIn: toYmd(row.check_in),
        checkOut: toYmd(row.check_out),
        nightsCount: Number(row.nights_count ?? 1),
        status: row.status,
        paymentCurrency: row.payment_currency,
        hostNetAmount: row.host_net_amount,
        hasSettledLedgerEntry: Boolean(row.has_settled_ledger_entry),
      };
    });

    return computeHostEarningsSummary(mapped, new Date());
  } catch (err) {
    console.error(
      "[HOST_EARNINGS] Error cargando resumen financiero:",
      err instanceof Error ? err.message : "unknown_error"
    );
    return computeHostEarningsSummary([]);
  } finally {
    await pg.end().catch(() => {});
  }
}

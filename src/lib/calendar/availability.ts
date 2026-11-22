import type { OccupiedDateRange } from "@/modules/properties/queries";
import { resolveOccupancyKind } from "@/lib/bookings/partial-hold";

export type DayAvailabilityStatus =
  | "PAST"
  | "AVAILABLE"
  | "PARTIAL_HOLD"
  | "BOOKED"
  | "ICAL_BLOCK";

export interface CalendarDayCell {
  ymd: string;
  dayNumber: number;
  status: DayAvailabilityStatus;
  matchingRange?: OccupiedDateRange;
}

export interface CalendarMonthGrid {
  year: number;
  month: number; // 1-12
  label: string;
  leadingEmptySlots: number; // 0 = Lunes ... 6 = Domingo
  days: CalendarDayCell[];
  availableCount: number;
  partialHoldCount: number;
  unavailableCount: number;
}

export const WEEKDAY_HEADERS_ES_AR = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
] as const;

const ARGENTINA_TODAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const SHORT_DATE_ES_AR_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const LONG_DATE_ES_AR_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const MONTH_YEAR_ES_AR_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/**
 * Devuelve la fecha actual `YYYY-MM-DD` en zona horaria Argentina (GMT-3)
 * para alinear servidor RSC y cliente sin desfases de hidratación.
 */
export function getArgentinaTodayYmd(now: Date = new Date()): string {
  return ARGENTINA_TODAY_FORMATTER.format(now);
}

export function parseYmd(ymd: string): {
  year: number;
  month: number;
  day: number;
} {
  const [y = 2026, m = 1, d = 1] = ymd.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function addDaysYmd(baseYmd: string, daysToAdd: number): string {
  const { year, month, day } = parseYmd(baseYmd);
  const dt = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return formatYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function calculateNightsBetweenYmd(
  checkInYmd: string,
  checkOutYmd: string
): number {
  const start = parseYmd(checkInYmd);
  const end = parseYmd(checkOutYmd);
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / 86_400_000);
}

export function formatShortEsArDate(ymd: string): string {
  const { year, month, day } = parseYmd(ymd);
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return SHORT_DATE_ES_AR_FORMATTER.format(dt).replace(/\./g, "");
}

export function formatLongAriaDateEsAr(ymd: string): string {
  const { year, month, day } = parseYmd(ymd);
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return LONG_DATE_ES_AR_FORMATTER.format(dt);
}

export function formatMonthYearEsAr(year: number, month: number): string {
  const dt = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  const raw = MONTH_YEAR_ES_AR_FORMATTER.format(dt).replace(/\s+de\s+/i, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function shiftMonth(
  year: number,
  month: number,
  deltaMonths: number
): { year: number; month: number } {
  const dt = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
  };
}

/**
 * Verifica superposición usando intervalos semiabiertos `[checkIn, checkOut)`
 * idénticos al constraint PostgreSQL `daterange(check_in, check_out, '[)') WITH &&`.
 */
export function hasRangeConflict(
  checkIn: string,
  checkOut: string,
  occupiedRanges: OccupiedDateRange[]
): OccupiedDateRange | null {
  if (!checkIn || !checkOut || checkOut <= checkIn) return null;
  return (
    occupiedRanges.find(
      (range) => checkIn < range.checkOut && checkOut > range.checkIn
    ) ?? null
  );
}

/**
 * Determina el estado visual y operativo de un día concreto en el calendario.
 * Nota: la fecha `checkOut` de una reserva previa queda libre para nuevo check-in.
 */
export function getDayAvailability(
  ymd: string,
  occupiedRanges: OccupiedDateRange[],
  todayYmd: string
): {
  status: DayAvailabilityStatus;
  matchingRange?: OccupiedDateRange;
} {
  if (ymd < todayYmd) {
    return { status: "PAST" };
  }

  const matchingRange = occupiedRanges.find(
    (range) => range.checkIn <= ymd && ymd < range.checkOut
  );

  if (matchingRange) {
    const kind =
      matchingRange.occupancyKind ?? resolveOccupancyKind(matchingRange);
    return {
      status:
        kind === "ICAL_BLOCK"
          ? "ICAL_BLOCK"
          : kind === "PARTIAL_HOLD"
            ? "PARTIAL_HOLD"
            : "BOOKED",
      matchingRange,
    };
  }

  return { status: "AVAILABLE" };
}

/**
 * Busca la primera ventana consecutiva de `nights` noches libres a partir de `startYmd`.
 */
export function findFirstAvailableWindow(
  occupiedRanges: OccupiedDateRange[],
  startYmd: string,
  nights = 5
): { checkIn: string; checkOut: string } {
  let candidateIn = startYmd;
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidateOut = addDaysYmd(candidateIn, nights);
    const conflict = hasRangeConflict(
      candidateIn,
      candidateOut,
      occupiedRanges
    );
    if (!conflict) {
      return { checkIn: candidateIn, checkOut: candidateOut };
    }
    candidateIn =
      conflict.checkOut > candidateIn
        ? conflict.checkOut
        : addDaysYmd(candidateIn, 1);
  }
  return { checkIn: startYmd, checkOut: addDaysYmd(startYmd, nights) };
}

/**
 * Construye la grilla mensual (lunes a domingo) indicando disponibilidad por día.
 */
export function buildMonthGrid(
  year: number,
  month: number,
  occupiedRanges: OccupiedDateRange[],
  todayYmd: string
): CalendarMonthGrid {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDayOfWeekUtc = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingEmptySlots = (firstDayOfWeekUtc + 6) % 7;

  const days: CalendarDayCell[] = [];
  let availableCount = 0;
  let partialHoldCount = 0;
  let unavailableCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = formatYmd(year, month, day);
    const { status, matchingRange } = getDayAvailability(
      ymd,
      occupiedRanges,
      todayYmd
    );

    if (status === "AVAILABLE") {
      availableCount += 1;
    } else if (status === "PARTIAL_HOLD") {
      partialHoldCount += 1;
      unavailableCount += 1;
    } else if (status === "BOOKED" || status === "ICAL_BLOCK") {
      unavailableCount += 1;
    }

    days.push({
      ymd,
      dayNumber: day,
      status,
      matchingRange,
    });
  }

  return {
    year,
    month,
    label: formatMonthYearEsAr(year, month),
    leadingEmptySlots,
    days,
    availableCount,
    partialHoldCount,
    unavailableCount,
  };
}

/**
 * Abre el calendario en el mes actual si tiene al menos 1 día disponible;
 * de lo contrario apunta al mes de la próxima fecha libre para mostrar
 * inmediatamente la transición entre días ocupados y disponibles.
 */
export function getInitialCalendarMonth(
  todayYmd: string,
  firstAvailableYmd: string,
  occupiedRanges: OccupiedDateRange[]
): { year: number; month: number } {
  const current = parseYmd(todayYmd);
  const currentGrid = buildMonthGrid(
    current.year,
    current.month,
    occupiedRanges,
    todayYmd
  );

  if (currentGrid.availableCount > 0) {
    return { year: current.year, month: current.month };
  }

  const next = parseYmd(firstAvailableYmd);
  return { year: next.year, month: next.month };
}

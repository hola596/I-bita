export const WEEKDAY_CODES = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;

export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export const ALLOWED_MAX_RESPONSE_HOURS = [1, 2, 4, 6, 12] as const;
export type MaxResponseHours = (typeof ALLOWED_MAX_RESPONSE_HOURS)[number];

export interface HostResponseSchedule {
  days: WeekdayCode[];
  startHour: number; // 0..22 (Argentina GMT-3)
  endHour: number; // 2..24 (Argentina GMT-3)
  maxResponseHours: MaxResponseHours;
  timezone: "America/Argentina/Buenos_Aires";
  confirmedAt: string | null;
}

export interface HostBookingSlaInput {
  id: string;
  createdAt: string;
  status: string;
  hostResponseDueAt: string | null;
  hostRespondedAt: string | null;
  hostRespondedOnTime: boolean | null;
}

export interface HostResponseMetrics {
  schedule: HostResponseSchedule;
  scheduleConfirmed: boolean;
  scheduleSummary: string;
  isCurrentlyWithinSchedule: boolean;
  nextOpenAtIso: string | null;
  responseRatePct: number | null;
  avgActiveResponseMinutes: number | null;
  respondedOnTimeCount: number;
  respondedLateCount: number;
  pendingWithinWindowCount: number;
  overdueUnansweredCount: number;
  evaluatedCount: number;
  totalTrackedBookings: number;
}

export interface BookingHostResponseWindowSummary {
  schedule: HostResponseSchedule;
  scheduleSummary: string;
  dueAtIso: string;
  dueAtLabelEsAr: string;
  respondedAtIso: string | null;
  respondedOnTime: boolean | null;
  responseRatePct: number | null;
  evaluatedCount: number;
  isWithinActiveScheduleAtBooking: boolean;
}

export const WEEKDAY_SHORT_LABELS: Record<WeekdayCode, string> = {
  MON: "Lun",
  TUE: "Mar",
  WED: "Mié",
  THU: "Jue",
  FRI: "Vie",
  SAT: "Sáb",
  SUN: "Dom",
};

export const WEEKDAY_FULL_LABELS: Record<WeekdayCode, string> = {
  MON: "Lunes",
  TUE: "Martes",
  WED: "Miércoles",
  THU: "Jueves",
  FRI: "Viernes",
  SAT: "Sábados",
  SUN: "Domingos",
};

const JS_UTC_DAY_TO_WEEKDAY: ReadonlyArray<WeekdayCode> = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

const SHORT_MONTHS_ES_AR = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/** Argentina opera en horario fijo UTC-3 todo el año (sin horario de verano). */
const ART_OFFSET_MS = -3 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_HOST_RESPONSE_SCHEDULE: HostResponseSchedule = {
  days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  startHour: 9,
  endHour: 21,
  maxResponseHours: 2,
  timezone: "America/Argentina/Buenos_Aires",
  confirmedAt: null,
};

export const HOST_RESPONSE_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  days: WeekdayCode[];
  startHour: number;
  endHour: number;
  maxResponseHours: MaxResponseHours;
}> = [
  {
    id: "daily",
    label: "Todos los días · 09 a 21 hs",
    description: "Respuesta dentro de 2 hs hábiles",
    days: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
    startHour: 9,
    endHour: 21,
    maxResponseHours: 2,
  },
  {
    id: "mon_sat",
    label: "Lun a Sáb · 09 a 20 hs",
    description: "Respuesta dentro de 2 hs hábiles",
    days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
    startHour: 9,
    endHour: 20,
    maxResponseHours: 2,
  },
  {
    id: "weekdays",
    label: "Lun a Vie · 09 a 19 hs",
    description: "Respuesta dentro de 4 hs hábiles",
    days: ["MON", "TUE", "WED", "THU", "FRI"],
    startHour: 9,
    endHour: 19,
    maxResponseHours: 4,
  },
];

function isValidWeekdayCode(value: unknown): value is WeekdayCode {
  return (
    typeof value === "string" &&
    (WEEKDAY_CODES as ReadonlyArray<string>).includes(value)
  );
}

function isValidMaxResponseHours(value: number): value is MaxResponseHours {
  return (ALLOWED_MAX_RESPONSE_HOURS as ReadonlyArray<number>).includes(value);
}

export function normalizeHostResponseSchedule(raw: unknown): {
  schedule: HostResponseSchedule;
  isConfigured: boolean;
} {
  if (!raw || typeof raw !== "object") {
    return {
      schedule: DEFAULT_HOST_RESPONSE_SCHEDULE,
      isConfigured: false,
    };
  }

  const obj = raw as Record<string, unknown>;
  const rawDays = Array.isArray(obj.days) ? obj.days : [];
  const validDaysSet = new Set<WeekdayCode>();
  for (const d of rawDays) {
    if (isValidWeekdayCode(d)) {
      validDaysSet.add(d);
    }
  }
  const orderedDays = WEEKDAY_CODES.filter((code) => validDaysSet.has(code));

  const startHourNum = Number(obj.startHour);
  const endHourNum = Number(obj.endHour);
  const maxRespNum = Number(obj.maxResponseHours);

  const hasValidHours =
    Number.isInteger(startHourNum) &&
    Number.isInteger(endHourNum) &&
    startHourNum >= 0 &&
    startHourNum <= 22 &&
    endHourNum >= 2 &&
    endHourNum <= 24 &&
    endHourNum - startHourNum >= 2;

  if (orderedDays.length === 0 || !hasValidHours) {
    return {
      schedule: DEFAULT_HOST_RESPONSE_SCHEDULE,
      isConfigured: false,
    };
  }

  const maxResponseHours: MaxResponseHours = isValidMaxResponseHours(maxRespNum)
    ? maxRespNum
    : 2;

  const confirmedAt =
    typeof obj.confirmedAt === "string" && obj.confirmedAt.trim().length > 0
      ? obj.confirmedAt.trim()
      : null;

  return {
    schedule: {
      days: orderedDays,
      startHour: startHourNum,
      endHour: endHourNum,
      maxResponseHours,
      timezone: "America/Argentina/Buenos_Aires",
      confirmedAt,
    },
    isConfigured: true,
  };
}

export function formatHourLabel(hour: number): string {
  const safeHour = Math.max(0, Math.min(24, Math.floor(hour)));
  return `${String(safeHour).padStart(2, "0")}:00`;
}

export function formatDaysSummaryEsAr(days: WeekdayCode[]): string {
  const ordered = WEEKDAY_CODES.filter((d) => days.includes(d));
  if (ordered.length === 0) return "Sin días seleccionados";
  if (ordered.length === 7) return "Todos los días";
  if (
    ordered.length === 5 &&
    ordered.join(",") === "MON,TUE,WED,THU,FRI"
  ) {
    return "Lun a Vie";
  }
  if (
    ordered.length === 6 &&
    ordered.join(",") === "MON,TUE,WED,THU,FRI,SAT"
  ) {
    return "Lun a Sáb";
  }
  if (ordered.length === 2 && ordered.join(",") === "SAT,SUN") {
    return "Sáb y Dom";
  }
  return ordered.map((d) => WEEKDAY_SHORT_LABELS[d]).join(", ");
}

export function formatResponseScheduleSummary(
  schedule: HostResponseSchedule
): string {
  const daysText = formatDaysSummaryEsAr(schedule.days);
  const startText = formatHourLabel(schedule.startHour);
  const endText = formatHourLabel(schedule.endHour);
  const hourUnit = schedule.maxResponseHours === 1 ? "hora" : "horas";
  return `${daysText} de ${startText} a ${endText} hs (máx. ${schedule.maxResponseHours} ${hourUnit})`;
}

function getArtWallWindowForUtcMs(
  utcMs: number,
  schedule: HostResponseSchedule
): {
  dayCode: WeekdayCode;
  isScheduledDay: boolean;
  dayBaseUtcMs: number;
  winStartMs: number;
  winEndMs: number;
} {
  const artWall = new Date(utcMs + ART_OFFSET_MS);
  const dayCode = JS_UTC_DAY_TO_WEEKDAY[artWall.getUTCDay()] ?? "MON";
  const dayBaseUtcMs =
    Date.UTC(
      artWall.getUTCFullYear(),
      artWall.getUTCMonth(),
      artWall.getUTCDate()
    ) - ART_OFFSET_MS;

  return {
    dayCode,
    isScheduledDay: schedule.days.includes(dayCode),
    dayBaseUtcMs,
    winStartMs: dayBaseUtcMs + schedule.startHour * HOUR_MS,
    winEndMs: dayBaseUtcMs + schedule.endHour * HOUR_MS,
  };
}

export function isWithinResponseSchedule(
  at: Date,
  schedule: HostResponseSchedule
): boolean {
  const utcMs = at.getTime();
  const win = getArtWallWindowForUtcMs(utcMs, schedule);
  return win.isScheduledDay && utcMs >= win.winStartMs && utcMs < win.winEndMs;
}

export function getNextScheduleOpenAt(
  from: Date,
  schedule: HostResponseSchedule
): Date {
  if (isWithinResponseSchedule(from, schedule)) {
    return from;
  }

  let cursorMs = from.getTime();
  for (let dayOffset = 0; dayOffset < 14; dayOffset += 1) {
    const win = getArtWallWindowForUtcMs(cursorMs, schedule);
    if (win.isScheduledDay && cursorMs < win.winStartMs) {
      return new Date(win.winStartMs);
    }
    cursorMs = win.dayBaseUtcMs + DAY_MS;
  }
  return from;
}

/**
 * Calcula el vencimiento exacto para la respuesta del anfitrión consumiendo
 * `schedule.maxResponseHours` únicamente dentro de los días y horarios confirmados
 * en hora Argentina (UTC-3), pausando automáticamente fuera de horario.
 */
export function calculateScheduledResponseDeadline(
  bookedAt: Date,
  schedule: HostResponseSchedule
): Date {
  let remainingMs = schedule.maxResponseHours * HOUR_MS;
  let cursorMs = bookedAt.getTime();

  for (let dayGuard = 0; dayGuard < 60; dayGuard += 1) {
    const win = getArtWallWindowForUtcMs(cursorMs, schedule);
    if (win.isScheduledDay) {
      const effectiveStart = Math.max(cursorMs, win.winStartMs);
      if (effectiveStart < win.winEndMs) {
        const availableMs = win.winEndMs - effectiveStart;
        if (remainingMs <= availableMs) {
          return new Date(effectiveStart + remainingMs);
        }
        remainingMs -= availableMs;
      }
    }
    cursorMs = win.dayBaseUtcMs + DAY_MS;
  }

  return new Date(bookedAt.getTime() + schedule.maxResponseHours * HOUR_MS);
}

/**
 * Calcula cuántos minutos activos dentro del horario del anfitrión transcurrieron
 * entre dos marcas de tiempo, sin penalizar horas nocturnas ni días no laborables.
 */
export function calculateActiveBusinessMinutesBetween(
  startAt: Date,
  endAt: Date,
  schedule: HostResponseSchedule
): number {
  const startMs = startAt.getTime();
  const endMs = endAt.getTime();
  if (endMs <= startMs) return 0;

  let activeMs = 0;
  let cursorMs = startMs;

  for (let dayGuard = 0; dayGuard < 90 && cursorMs < endMs; dayGuard += 1) {
    const win = getArtWallWindowForUtcMs(cursorMs, schedule);
    if (win.isScheduledDay) {
      const overlapStart = Math.max(startMs, win.winStartMs);
      const overlapEnd = Math.min(endMs, win.winEndMs);
      if (overlapEnd > overlapStart) {
        activeMs += overlapEnd - overlapStart;
      }
    }
    cursorMs = win.dayBaseUtcMs + DAY_MS;
  }

  return Math.round(activeMs / 60_000);
}

export function formatDeadlineEsAr(
  deadlineIso: string,
  now: Date = new Date()
): string {
  const deadline = new Date(deadlineIso);
  if (Number.isNaN(deadline.getTime())) return deadlineIso;

  const deadlineWall = new Date(deadline.getTime() + ART_OFFSET_MS);
  const nowWall = new Date(now.getTime() + ART_OFFSET_MS);

  const deadlineMidnight = Date.UTC(
    deadlineWall.getUTCFullYear(),
    deadlineWall.getUTCMonth(),
    deadlineWall.getUTCDate()
  );
  const nowMidnight = Date.UTC(
    nowWall.getUTCFullYear(),
    nowWall.getUTCMonth(),
    nowWall.getUTCDate()
  );

  const dayDiff = Math.round((deadlineMidnight - nowMidnight) / DAY_MS);
  const hh = String(deadlineWall.getUTCHours()).padStart(2, "0");
  const mm = String(deadlineWall.getUTCMinutes()).padStart(2, "0");

  if (dayDiff === 0) {
    return `hoy antes de las ${hh}:${mm} hs`;
  }
  if (dayDiff === 1) {
    return `mañana antes de las ${hh}:${mm} hs`;
  }

  const dayCode = JS_UTC_DAY_TO_WEEKDAY[deadlineWall.getUTCDay()] ?? "MON";
  const weekdayName = WEEKDAY_FULL_LABELS[dayCode].toLowerCase();
  const dayNum = deadlineWall.getUTCDate();
  const monthShort = SHORT_MONTHS_ES_AR[deadlineWall.getUTCMonth()] ?? "";
  return `${weekdayName} ${dayNum} ${monthShort} antes de las ${hh}:${mm} hs`;
}

export function formatActiveDurationEsAr(minutes: number): string {
  const safeMin = Math.max(1, Math.round(minutes));
  if (safeMin < 60) {
    return `${safeMin} min`;
  }
  const hours = Math.floor(safeMin / 60);
  const remMin = safeMin % 60;
  return remMin === 0 ? `${hours} h` : `${hours} h ${remMin} min`;
}

/**
 * Construye el mensaje automático enviado dentro del Centro de Mensajes (/mensajes)
 * apenas un huésped genera una reserva o solicitud de estadía.
 */
export function buildAutoReservationResponseNotice(params: {
  propertyTitle: string;
  hostName: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  schedule: HostResponseSchedule;
  dueAtIso: string;
  requiresHostApproval: boolean;
  responseRatePct: number | null;
}): string {
  const {
    propertyTitle,
    hostName,
    checkIn,
    checkOut,
    nightsCount,
    schedule,
    dueAtIso,
    requiresHostApproval,
    responseRatePct,
  } = params;

  const scheduleSummary = formatResponseScheduleSummary(schedule);
  const deadlineLabel = formatDeadlineEsAr(dueAtIso);
  const rateLine =
    responseRatePct !== null
      ? `Tasa de respuesta sincronizada del anfitrión: ${responseRatePct}% dentro de su horario.`
      : "Compromiso de respuesta verificado en I-bita.";

  if (requiresHostApproval) {
    return [
      `Solicitud recibida para ${propertyTitle} (${checkIn} -> ${checkOut}, ${nightsCount} noches).`,
      `Horario de respuesta confirmado por ${hostName}: ${scheduleSummary} (hora Argentina).`,
      `Tiempo estimado de respuesta en esta reserva: ${deadlineLabel}.`,
      rateLine,
      "Cuando el anfitrión responda por acá y apruebe tu estadía, se habilita el pago y luego la validación de identidad para recibir tus instrucciones de ingreso.",
    ].join("\n");
  }

  return [
    `Reserva iniciada en ${propertyTitle} (${checkIn} -> ${checkOut}, ${nightsCount} noches).`,
    `Horario de respuesta confirmado por ${hostName}: ${scheduleSummary} (hora Argentina).`,
    `Tras completar el pago y la validación de identidad, el anfitrión te enviará por acá la confirmación e instrucciones finales de ingreso ${deadlineLabel}.`,
    rateLine,
  ].join("\n");
}

/**
 * Calcula la tasa de respuesta sincronizada exclusivamente con el intervalo de días y horas
 * confirmado del anfitrión. Reservas aún dentro de su ventana hábil no penalizan la métrica.
 */
export function computeSynchronizedHostResponseMetrics(
  rows: HostBookingSlaInput[],
  schedule: HostResponseSchedule,
  scheduleConfirmed: boolean,
  now: Date = new Date()
): HostResponseMetrics {
  const nowMs = now.getTime();
  let respondedOnTimeCount = 0;
  let respondedLateCount = 0;
  let pendingWithinWindowCount = 0;
  let overdueUnansweredCount = 0;
  let totalActiveResponseMinutes = 0;
  let activeDurationSampleCount = 0;

  for (const row of rows) {
    const normalizedStatus = String(row.status).toUpperCase();
    if (
      normalizedStatus === "CANCELLED" ||
      normalizedStatus === "EXPIRED" ||
      normalizedStatus === "ICAL_BLOCK"
    ) {
      continue;
    }

    // Reservas previas a la activación de horarios confirmados no penalizan la métrica
    if (!row.hostResponseDueAt && !row.hostRespondedAt) {
      continue;
    }

    const createdAtDate = new Date(row.createdAt);
    const computedDueAt = new Date(row.hostResponseDueAt ?? row.createdAt);

    if (row.hostRespondedAt) {
      const respondedAtDate = new Date(row.hostRespondedAt);
      const isOnTime =
        row.hostRespondedOnTime !== null
          ? row.hostRespondedOnTime
          : respondedAtDate.getTime() <= computedDueAt.getTime();

      if (isOnTime) {
        respondedOnTimeCount += 1;
      } else {
        respondedLateCount += 1;
      }

      if (
        !Number.isNaN(createdAtDate.getTime()) &&
        !Number.isNaN(respondedAtDate.getTime())
      ) {
        totalActiveResponseMinutes += calculateActiveBusinessMinutesBetween(
          createdAtDate,
          respondedAtDate,
          schedule
        );
        activeDurationSampleCount += 1;
      }
      continue;
    }

    if (nowMs <= computedDueAt.getTime()) {
      pendingWithinWindowCount += 1;
    } else {
      overdueUnansweredCount += 1;
    }
  }

  const evaluatedCount =
    respondedOnTimeCount + respondedLateCount + overdueUnansweredCount;
  const totalTrackedBookings = evaluatedCount + pendingWithinWindowCount;

  const responseRatePct =
    evaluatedCount > 0
      ? Math.round((respondedOnTimeCount / evaluatedCount) * 100)
      : null;

  const avgActiveResponseMinutes =
    activeDurationSampleCount > 0
      ? Math.round(totalActiveResponseMinutes / activeDurationSampleCount)
      : null;

  const withinSchedule = isWithinResponseSchedule(now, schedule);
  const nextOpenAtIso = withinSchedule
    ? null
    : getNextScheduleOpenAt(now, schedule).toISOString();

  return {
    schedule,
    scheduleConfirmed,
    scheduleSummary: formatResponseScheduleSummary(schedule),
    isCurrentlyWithinSchedule: withinSchedule,
    nextOpenAtIso,
    responseRatePct,
    avgActiveResponseMinutes,
    respondedOnTimeCount,
    respondedLateCount,
    pendingWithinWindowCount,
    overdueUnansweredCount,
    evaluatedCount,
    totalTrackedBookings,
  };
}

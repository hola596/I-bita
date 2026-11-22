export const PARTIAL_HOLD_DURATION_MINUTES = 60 as const;
export const PARTIAL_HOLD_DURATION_MS =
  PARTIAL_HOLD_DURATION_MINUTES * 60 * 1000;

export type BookingConfirmationPhase =
  | "EXPIRED"
  | "CANCELLED"
  | "PENDING_INTERVIEW"
  | "PARTIAL_HOLD"
  | "PAID_AWAITING_HOST"
  | "CONFIRMED";

export type CalendarOccupancyKind =
  | "PARTIAL_HOLD"
  | "CONFIRMED"
  | "ICAL_BLOCK";

const ARGENTINA_CLOCK_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function computeHoldExpiresAt(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + PARTIAL_HOLD_DURATION_MS);
}

export function isBookingPaid(status: string): boolean {
  return (
    status === "PAID_PENDING_KYC" ||
    status === "ALL_ADULTS_VERIFIED" ||
    status === "CHECKED_IN" ||
    status === "COMPLETED"
  );
}

export function isBookingHoldExpired(
  status: string,
  holdExpiresAt?: string | Date | null,
  now: Date = new Date()
): boolean {
  if (status === "EXPIRED") {
    return true;
  }
  if (status !== "PENDING_PAYMENT" || !holdExpiresAt) {
    return false;
  }
  const expiresDate =
    holdExpiresAt instanceof Date ? holdExpiresAt : new Date(holdExpiresAt);
  if (!Number.isFinite(expiresDate.getTime())) {
    return false;
  }
  return expiresDate.getTime() <= now.getTime();
}

export function resolveBookingConfirmationPhase(
  input: {
    status: string;
    holdExpiresAt?: string | Date | null;
    hostConfirmedAt?: string | Date | null;
  },
  now: Date = new Date()
): BookingConfirmationPhase {
  if (input.status === "CANCELLED") {
    return "CANCELLED";
  }
  if (isBookingHoldExpired(input.status, input.holdExpiresAt, now)) {
    return "EXPIRED";
  }
  if (input.status === "PENDING_HOST_APPROVAL") {
    return "PENDING_INTERVIEW";
  }
  if (input.status === "PENDING_PAYMENT") {
    return "PARTIAL_HOLD";
  }
  if (isBookingPaid(input.status)) {
    return input.hostConfirmedAt ? "CONFIRMED" : "PAID_AWAITING_HOST";
  }
  return "PARTIAL_HOLD";
}

export function resolveOccupancyKind(
  input: {
    status: string;
    holdExpiresAt?: string | Date | null;
    hostConfirmedAt?: string | Date | null;
  },
  now: Date = new Date()
): CalendarOccupancyKind {
  if (input.status === "ICAL_BLOCK") {
    return "ICAL_BLOCK";
  }
  const phase = resolveBookingConfirmationPhase(input, now);
  if (phase === "CONFIRMED") {
    return "CONFIRMED";
  }
  return "PARTIAL_HOLD";
}

export function formatHoldRemainingLabel(
  holdExpiresAt: string | Date,
  now: Date = new Date()
): {
  expired: boolean;
  remainingMs: number;
  mmss: string;
  expiresAtClockEsAr: string;
} {
  const expiresDate =
    holdExpiresAt instanceof Date ? holdExpiresAt : new Date(holdExpiresAt);

  if (!Number.isFinite(expiresDate.getTime())) {
    return {
      expired: false,
      remainingMs: 0,
      mmss: "60:00",
      expiresAtClockEsAr: "--:--",
    };
  }

  const remainingMs = Math.max(0, expiresDate.getTime() - now.getTime());
  const expired = remainingMs <= 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    expired,
    remainingMs,
    mmss: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    expiresAtClockEsAr: ARGENTINA_CLOCK_FORMATTER.format(expiresDate),
  };
}

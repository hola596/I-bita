import Decimal from "decimal.js";
import { convertCurrencyAmount } from "./money";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const HOST_RELEASE_DELAY_HOURS = 48 as const;

export const EARNINGS_QUALIFYING_STATUSES = [
  "PAID_PENDING_KYC",
  "ALL_ADULTS_VERIFIED",
  "CHECKED_IN",
  "COMPLETED",
] as const;

export const UNPAID_PIPELINE_STATUSES = [
  "PENDING_PAYMENT",
  "PENDING_HOST_APPROVAL",
] as const;

export type HostEarningReleaseState =
  | "SETTLED"
  | "AVAILABLE"
  | "PENDING_RELEASE";

export interface HostBookingEarningInput {
  bookingId: string;
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  guestDisplayName: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  status: string;
  paymentCurrency: "ARS" | "USD" | "USDT";
  hostNetAmount: string | number;
  hasSettledLedgerEntry?: boolean;
}

export interface HostEarningBookingItem {
  bookingId: string;
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  guestDisplayName: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  status: string;
  nativeCurrency: "ARS" | "USDT";
  hostNetAmount: string;
  convertedArsAmount: string;
  convertedUsdtAmount: string;
  arrivalAtIso: string;
  releaseAtIso: string;
  releaseState: HostEarningReleaseState;
  hoursUntilRelease: number;
}

export interface HostEarningsSummary {
  releaseDelayHours: number;
  qualifyingBookingsCount: number;
  availableBookingsCount: number;
  pendingReleaseBookingsCount: number;
  unpaidPendingBookingsCount: number;
  generatedArs: string;
  generatedUsdt: string;
  availableArs: string;
  availableUsdt: string;
  pendingReleaseArs: string;
  pendingReleaseUsdt: string;
  generatedTotalArs: string;
  generatedTotalUsdt: string;
  availableTotalArs: string;
  availableTotalUsdt: string;
  pendingReleaseTotalArs: string;
  pendingReleaseTotalUsdt: string;
  nextReleaseAtIso: string | null;
  nextReleasePropertyTitle: string | null;
  items: HostEarningBookingItem[];
}

/**
 * Calcula la fecha/hora exacta de ingreso (15:00 hs AR del check-in) y la fecha
 * de liberación (+48 hs después de la llegada del huésped al hospedaje).
 */
export function computeReleaseTimestampIso(checkInYmd: string): {
  arrivalAtIso: string;
  releaseAtIso: string;
} {
  const cleanYmd = checkInYmd.trim().slice(0, 10);
  const parsedArrival = new Date(`${cleanYmd}T15:00:00-03:00`);
  const arrivalMs = Number.isNaN(parsedArrival.getTime())
    ? Date.now()
    : parsedArrival.getTime();
  const releaseMs = arrivalMs + HOST_RELEASE_DELAY_HOURS * 60 * 60 * 1000;

  return {
    arrivalAtIso: new Date(arrivalMs).toISOString(),
    releaseAtIso: new Date(releaseMs).toISOString(),
  };
}

function combineCurrencies(arsDec: Decimal, usdtDec: Decimal): {
  totalArs: string;
  totalUsdt: string;
} {
  const usdtAsArs = usdtDec.gt(0)
    ? new Decimal(convertCurrencyAmount(usdtDec.toFixed(2), "USDT", "ARS"))
    : new Decimal(0);
  const arsAsUsdt = arsDec.gt(0)
    ? new Decimal(convertCurrencyAmount(arsDec.toFixed(2), "ARS", "USDT"))
    : new Decimal(0);

  return {
    totalArs: arsDec.plus(usdtAsArs).toDecimalPlaces(2).toFixed(2),
    totalUsdt: usdtDec.plus(arsAsUsdt).toDecimalPlaces(2).toFixed(2),
  };
}

export function computeHostEarningsSummary(
  bookings: ReadonlyArray<HostBookingEarningInput>,
  now: Date = new Date()
): HostEarningsSummary {
  const nowMs = now.getTime();
  const qualifyingSet = new Set<string>(EARNINGS_QUALIFYING_STATUSES);
  const unpaidSet = new Set<string>(UNPAID_PIPELINE_STATUSES);

  let unpaidPendingBookingsCount = 0;
  let availableBookingsCount = 0;
  let pendingReleaseBookingsCount = 0;

  let generatedArsDec = new Decimal(0);
  let generatedUsdtDec = new Decimal(0);
  let availableArsDec = new Decimal(0);
  let availableUsdtDec = new Decimal(0);
  let pendingReleaseArsDec = new Decimal(0);
  let pendingReleaseUsdtDec = new Decimal(0);

  const items: HostEarningBookingItem[] = [];

  for (const booking of bookings) {
    if (unpaidSet.has(booking.status)) {
      unpaidPendingBookingsCount += 1;
      continue;
    }

    if (!qualifyingSet.has(booking.status)) {
      continue;
    }

    const nativeCurrency: "ARS" | "USDT" =
      booking.paymentCurrency === "ARS" ? "ARS" : "USDT";
    const netAmountDec = new Decimal(booking.hostNetAmount ?? 0).toDecimalPlaces(
      2
    );
    const { arrivalAtIso, releaseAtIso } = computeReleaseTimestampIso(
      booking.checkIn
    );
    const releaseMs = new Date(releaseAtIso).getTime();

    let releaseState: HostEarningReleaseState;
    let hoursUntilRelease = 0;

    if (booking.hasSettledLedgerEntry) {
      releaseState = "SETTLED";
    } else if (booking.status === "COMPLETED" || nowMs >= releaseMs) {
      releaseState = "AVAILABLE";
    } else {
      releaseState = "PENDING_RELEASE";
      hoursUntilRelease = Math.max(0, Math.ceil((releaseMs - nowMs) / 3600000));
    }

    if (nativeCurrency === "ARS") {
      generatedArsDec = generatedArsDec.plus(netAmountDec);
      if (releaseState === "PENDING_RELEASE") {
        pendingReleaseArsDec = pendingReleaseArsDec.plus(netAmountDec);
      } else {
        availableArsDec = availableArsDec.plus(netAmountDec);
      }
    } else {
      generatedUsdtDec = generatedUsdtDec.plus(netAmountDec);
      if (releaseState === "PENDING_RELEASE") {
        pendingReleaseUsdtDec = pendingReleaseUsdtDec.plus(netAmountDec);
      } else {
        availableUsdtDec = availableUsdtDec.plus(netAmountDec);
      }
    }

    if (releaseState === "PENDING_RELEASE") {
      pendingReleaseBookingsCount += 1;
    } else {
      availableBookingsCount += 1;
    }

    const convertedArsAmount =
      nativeCurrency === "ARS"
        ? netAmountDec.toFixed(2)
        : convertCurrencyAmount(netAmountDec.toFixed(2), "USDT", "ARS");
    const convertedUsdtAmount =
      nativeCurrency === "USDT"
        ? netAmountDec.toFixed(2)
        : convertCurrencyAmount(netAmountDec.toFixed(2), "ARS", "USDT");

    items.push({
      bookingId: booking.bookingId,
      propertyId: booking.propertyId,
      propertySlug: booking.propertySlug,
      propertyTitle: booking.propertyTitle,
      guestDisplayName: booking.guestDisplayName,
      checkIn: booking.checkIn.trim().slice(0, 10),
      checkOut: booking.checkOut.trim().slice(0, 10),
      nightsCount: booking.nightsCount,
      status: booking.status,
      nativeCurrency,
      hostNetAmount: netAmountDec.toFixed(2),
      convertedArsAmount,
      convertedUsdtAmount,
      arrivalAtIso,
      releaseAtIso,
      releaseState,
      hoursUntilRelease,
    });
  }

  // Ordenar: primero próximas liberaciones (más cercanas arriba), luego ya disponibles/liquidadas (más recientes arriba)
  const pendingItems = items
    .filter((item) => item.releaseState === "PENDING_RELEASE")
    .sort((a, b) => a.releaseAtIso.localeCompare(b.releaseAtIso));

  const releasedItems = items
    .filter((item) => item.releaseState !== "PENDING_RELEASE")
    .sort((a, b) => b.releaseAtIso.localeCompare(a.releaseAtIso));

  const sortedItems = [...pendingItems, ...releasedItems];
  const nextPending = pendingItems[0] ?? null;

  const generatedTotals = combineCurrencies(generatedArsDec, generatedUsdtDec);
  const availableTotals = combineCurrencies(availableArsDec, availableUsdtDec);
  const pendingTotals = combineCurrencies(
    pendingReleaseArsDec,
    pendingReleaseUsdtDec
  );

  return {
    releaseDelayHours: HOST_RELEASE_DELAY_HOURS,
    qualifyingBookingsCount: sortedItems.length,
    availableBookingsCount,
    pendingReleaseBookingsCount,
    unpaidPendingBookingsCount,
    generatedArs: generatedArsDec.toDecimalPlaces(2).toFixed(2),
    generatedUsdt: generatedUsdtDec.toDecimalPlaces(2).toFixed(2),
    availableArs: availableArsDec.toDecimalPlaces(2).toFixed(2),
    availableUsdt: availableUsdtDec.toDecimalPlaces(2).toFixed(2),
    pendingReleaseArs: pendingReleaseArsDec.toDecimalPlaces(2).toFixed(2),
    pendingReleaseUsdt: pendingReleaseUsdtDec.toDecimalPlaces(2).toFixed(2),
    generatedTotalArs: generatedTotals.totalArs,
    generatedTotalUsdt: generatedTotals.totalUsdt,
    availableTotalArs: availableTotals.totalArs,
    availableTotalUsdt: availableTotals.totalUsdt,
    pendingReleaseTotalArs: pendingTotals.totalArs,
    pendingReleaseTotalUsdt: pendingTotals.totalUsdt,
    nextReleaseAtIso: nextPending?.releaseAtIso ?? null,
    nextReleasePropertyTitle: nextPending?.propertyTitle ?? null,
    items: sortedItems,
  };
}

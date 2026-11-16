import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface StayPricingInput {
  nightlyRate: string | number;
  nights: number;
  monthlyDiscountPct?: string | number;
  microCanonPct?: string | number; // 0, 1, 1.5, 2
}

export interface StayPricingBreakdown {
  nights: number;
  isMidTerm: boolean;
  grossSubtotal: string;
  discountAmount: string;
  netAccommodationAmount: string;
  platformFeePct: string;
  platformFeeAmount: string;
  consortiumCanonPct: string;
  consortiumCanonAmount: string;
  hostNetPayout: string;
  totalGuestPayable: string;
  estimatedAirbnbTotal: string;
  directSavingsAmount: string;
}

/**
 * Calcula con precisión Decimal exacta (cero float nativo) los importes de estadía,
 * reduciendo la comisión de plataforma al 6% cuando nights >= 30 (Media Estadía).
 */
export function calculateStayPricing(
  input: StayPricingInput
): StayPricingBreakdown {
  const rate = new Decimal(input.nightlyRate);
  const nights = new Decimal(input.nights);
  const isMidTerm = input.nights >= 30;

  const grossSubtotal = rate.mul(nights);
  const discountPct = isMidTerm
    ? new Decimal(input.monthlyDiscountPct ?? 15)
    : new Decimal(0);
  const discountAmount = grossSubtotal.mul(discountPct).div(100).toDecimalPlaces(2);
  const netAccommodation = grossSubtotal.minus(discountAmount).toDecimalPlaces(2);

  // Comisión decreciente: 6.00% para Media Estadía (>=30 días), 11.00% para Estadía Corta
  const platformFeePct = isMidTerm ? new Decimal("6.00") : new Decimal("11.00");
  const platformFeeAmount = netAccommodation
    .mul(platformFeePct)
    .div(100)
    .toDecimalPlaces(2);

  const canonPct = new Decimal(input.microCanonPct ?? 0);
  const consortiumCanonAmount = netAccommodation
    .mul(canonPct)
    .div(100)
    .toDecimalPlaces(2);

  const hostNetPayout = netAccommodation
    .minus(consortiumCanonAmount)
    .toDecimalPlaces(2);

  const totalGuestPayable = netAccommodation
    .plus(platformFeeAmount)
    .toDecimalPlaces(2);

  // Comparador contra OTA extranjera (~17.5% fee + recargo cambiario)
  const estimatedAirbnbTotal = netAccommodation.mul("1.18").toDecimalPlaces(2);
  const directSavingsAmount = Decimal.max(
    0,
    estimatedAirbnbTotal.minus(totalGuestPayable)
  ).toDecimalPlaces(2);

  return {
    nights: input.nights,
    isMidTerm,
    grossSubtotal: grossSubtotal.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    netAccommodationAmount: netAccommodation.toFixed(2),
    platformFeePct: platformFeePct.toFixed(2),
    platformFeeAmount: platformFeeAmount.toFixed(2),
    consortiumCanonPct: canonPct.toFixed(2),
    consortiumCanonAmount: consortiumCanonAmount.toFixed(2),
    hostNetPayout: hostNetPayout.toFixed(2),
    totalGuestPayable: totalGuestPayable.toFixed(2),
    estimatedAirbnbTotal: estimatedAirbnbTotal.toFixed(2),
    directSavingsAmount: directSavingsAmount.toFixed(2),
  };
}

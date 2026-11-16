import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const DEFAULT_ARS_PER_USD_RATE = "1200.00" as const;

export interface InstallmentPlanBreakdown {
  installments: 1 | 3 | 6;
  surchargePct: string;
  totalWithFinancing: string;
  installmentAmount: string;
  interestFree: boolean;
}

export interface StayPricingInput {
  nightlyRate: string | number;
  nights: number;
  monthlyDiscountPct?: string | number;
  microCanonPct?: string | number; // 0, 1, 1.5, 2
  absorbInstallmentsCost?: boolean;
  baseCurrency?: "ARS" | "USD" | "USDT";
  paymentCurrency?: "ARS" | "USDT";
  arsPerUsdRate?: string | number;
}

export interface StayPricingBreakdown {
  nights: number;
  isMidTerm: boolean;
  requiresTemporaryContractArt1199: boolean;
  paymentCurrency: "ARS" | "USDT";
  effectiveNightlyRate: string;
  grossSubtotal: string;
  discountPct: string;
  discountAmount: string;
  netAccommodationAmount: string;
  platformFeePct: string;
  platformFeeAmount: string;
  consortiumCanonPct: string;
  consortiumCanonAmount: string;
  hostNetPayout: string;
  totalGuestPayable: string;
  firstMonthNights: number;
  firstMonthAccommodationAmount: string;
  firstMonthPlatformFeeAmount: string;
  escrowDepositAmount: string;
  escrowDepositUsdt: string;
  dueAtCheckInAmount: string;
  estimatedAirbnbTotal: string;
  directSavingsAmount: string;
  directSavingsPct: string;
  installmentPlans: InstallmentPlanBreakdown[];
}

/**
 * Convierte un monto entre la moneda base de la propiedad (`ARS`, `USD`, `USDT`)
 * y la moneda seleccionada por el huésped (`ARS`, `USDT`) usando exclusivamente `decimal.js`.
 */
export function convertCurrencyAmount(
  amount: string | number,
  fromCurrency: "ARS" | "USD" | "USDT",
  toCurrency: "ARS" | "USDT",
  arsPerUsdRate: string | number = DEFAULT_ARS_PER_USD_RATE
): string {
  const val = new Decimal(amount);
  const fx = new Decimal(arsPerUsdRate);

  if (fromCurrency === toCurrency) {
    return val.toDecimalPlaces(2).toFixed(2);
  }

  // USD y USDT mantienen paridad 1:1 en cotización base
  if (
    (fromCurrency === "USD" || fromCurrency === "USDT") &&
    toCurrency === "USDT"
  ) {
    return val.toDecimalPlaces(2).toFixed(2);
  }

  if (
    (fromCurrency === "USD" || fromCurrency === "USDT") &&
    toCurrency === "ARS"
  ) {
    return val.mul(fx).toDecimalPlaces(2).toFixed(2);
  }

  if (fromCurrency === "ARS" && toCurrency === "USDT") {
    return val.div(fx).toDecimalPlaces(2).toFixed(2);
  }

  return val.toDecimalPlaces(2).toFixed(2);
}

/**
 * Calcula los planes de financiación en 1, 3 y 6 cuotas en ARS con `decimal.js`
 * (sin Impuesto PAIS ni percepciones cambiarias).
 */
export function calculateArsInstallmentPlans(
  totalAmountArs: string | number,
  absorbInstallmentsCost = false
): InstallmentPlanBreakdown[] {
  const baseTotal = new Decimal(totalAmountArs).toDecimalPlaces(2);

  const plansConfig: ReadonlyArray<{
    installments: 1 | 3 | 6;
    defaultSurchargePct: string;
  }> = [
    { installments: 1, defaultSurchargePct: "0.00" },
    { installments: 3, defaultSurchargePct: "8.50" },
    { installments: 6, defaultSurchargePct: "16.50" },
  ];

  return plansConfig.map(({ installments, defaultSurchargePct }) => {
    const interestFree = installments === 1 || absorbInstallmentsCost;
    const surchargePct = interestFree
      ? new Decimal("0.00")
      : new Decimal(defaultSurchargePct);

    const surchargeMultiplier = new Decimal(1).plus(surchargePct.div(100));
    const totalWithFinancing = baseTotal
      .mul(surchargeMultiplier)
      .toDecimalPlaces(2);
    const installmentAmount = totalWithFinancing
      .div(installments)
      .toDecimalPlaces(2);

    return {
      installments,
      surchargePct: surchargePct.toFixed(2),
      totalWithFinancing: totalWithFinancing.toFixed(2),
      installmentAmount: installmentAmount.toFixed(2),
      interestFree,
    };
  });
}

/**
 * Calcula con precisión Decimal exacta (cero float nativo) los importes de estadía:
 * - Estadía Corta (`1 <= nights < 30`): tarifa base por noche y comisión estándar (`11.00%`).
 * - Media Estadía (`30 <= nights <= 180`): descuento mensual automático (`monthlyDiscountPct`),
 *   comisión reducida al `6.00%`, desglose de Mes 1 + Depósito en Garantía en Custodia (Escrow)
 *   y requisito de Contrato Temporario Digital (Art. 1199 CCyC).
 */
export function calculateStayPricing(
  input: StayPricingInput
): StayPricingBreakdown {
  const baseCurrency = input.baseCurrency ?? "ARS";
  const paymentCurrency =
    input.paymentCurrency ?? (baseCurrency === "USDT" ? "USDT" : "ARS");
  const fxRate = new Decimal(input.arsPerUsdRate ?? DEFAULT_ARS_PER_USD_RATE);

  const convertedNightlyRate = convertCurrencyAmount(
    input.nightlyRate,
    baseCurrency,
    paymentCurrency,
    fxRate.toFixed(2)
  );

  const rate = new Decimal(convertedNightlyRate);
  const nightsInt = Math.max(1, Math.trunc(input.nights));
  const nights = new Decimal(nightsInt);
  const isMidTerm = nightsInt >= 30;

  const grossSubtotal = rate.mul(nights).toDecimalPlaces(2);
  const discountPct = isMidTerm
    ? new Decimal(input.monthlyDiscountPct ?? 15).toDecimalPlaces(2)
    : new Decimal(0);
  const discountAmount = grossSubtotal
    .mul(discountPct)
    .div(100)
    .toDecimalPlaces(2);
  const netAccommodation = grossSubtotal
    .minus(discountAmount)
    .toDecimalPlaces(2);

  const effectiveNightlyRate = netAccommodation
    .div(nights)
    .toDecimalPlaces(2);

  // Comisión decreciente: 6.00% para Media Estadía (>=30 noches), 11.00% para Estadía Corta
  const platformFeePct = isMidTerm
    ? new Decimal("6.00")
    : new Decimal("11.00");
  const platformFeeAmount = netAccommodation
    .mul(platformFeePct)
    .div(100)
    .toDecimalPlaces(2);

  const canonPct = new Decimal(input.microCanonPct ?? 0).toDecimalPlaces(2);
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

  // Desglose Media Estadía (30 a 180 noches): Cobro de Mes 1 (30 noches) + Depósito en Garantía en Custodia (Escrow = 15 noches bonificadas)
  const firstMonthNights = isMidTerm ? Math.min(nightsInt, 30) : nightsInt;
  const firstMonthNightsDec = new Decimal(firstMonthNights);

  const firstMonthAccommodationAmount = isMidTerm
    ? netAccommodation
        .mul(firstMonthNightsDec)
        .div(nights)
        .toDecimalPlaces(2)
    : netAccommodation;

  const firstMonthPlatformFeeAmount = isMidTerm
    ? platformFeeAmount
        .mul(firstMonthNightsDec)
        .div(nights)
        .toDecimalPlaces(2)
    : platformFeeAmount;

  const escrowDepositAmount = isMidTerm
    ? effectiveNightlyRate.mul(15).toDecimalPlaces(2)
    : new Decimal(0);

  const escrowDepositUsdt = isMidTerm
    ? new Decimal(
        convertCurrencyAmount(
          escrowDepositAmount.toFixed(2),
          paymentCurrency,
          "USDT",
          fxRate.toFixed(2)
        )
      ).toDecimalPlaces(2)
    : new Decimal(0);

  const dueAtCheckInAmount = isMidTerm
    ? firstMonthAccommodationAmount
        .plus(firstMonthPlatformFeeAmount)
        .plus(escrowDepositAmount)
        .toDecimalPlaces(2)
    : totalGuestPayable;

  // Comparador contra OTA extranjera (~18% comisión internacional + recargo cambiario sobre alojamiento)
  const estimatedAirbnbTotal = netAccommodation.mul("1.18").toDecimalPlaces(2);
  const directSavingsAmount = Decimal.max(
    0,
    estimatedAirbnbTotal.minus(totalGuestPayable)
  ).toDecimalPlaces(2);

  const directSavingsPct = estimatedAirbnbTotal.gt(0)
    ? directSavingsAmount
        .mul(100)
        .div(estimatedAirbnbTotal)
        .toDecimalPlaces(2)
    : new Decimal(0);

  const totalArsForInstallments =
    paymentCurrency === "ARS"
      ? totalGuestPayable.toFixed(2)
      : convertCurrencyAmount(
          totalGuestPayable.toFixed(2),
          "USDT",
          "ARS",
          fxRate.toFixed(2)
        );

  const installmentPlans = calculateArsInstallmentPlans(
    totalArsForInstallments,
    Boolean(input.absorbInstallmentsCost)
  );

  return {
    nights: nightsInt,
    isMidTerm,
    requiresTemporaryContractArt1199: isMidTerm,
    paymentCurrency,
    effectiveNightlyRate: effectiveNightlyRate.toFixed(2),
    grossSubtotal: grossSubtotal.toFixed(2),
    discountPct: discountPct.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    netAccommodationAmount: netAccommodation.toFixed(2),
    platformFeePct: platformFeePct.toFixed(2),
    platformFeeAmount: platformFeeAmount.toFixed(2),
    consortiumCanonPct: canonPct.toFixed(2),
    consortiumCanonAmount: consortiumCanonAmount.toFixed(2),
    hostNetPayout: hostNetPayout.toFixed(2),
    totalGuestPayable: totalGuestPayable.toFixed(2),
    firstMonthNights,
    firstMonthAccommodationAmount: firstMonthAccommodationAmount.toFixed(2),
    firstMonthPlatformFeeAmount: firstMonthPlatformFeeAmount.toFixed(2),
    escrowDepositAmount: escrowDepositAmount.toFixed(2),
    escrowDepositUsdt: escrowDepositUsdt.toFixed(2),
    dueAtCheckInAmount: dueAtCheckInAmount.toFixed(2),
    estimatedAirbnbTotal: estimatedAirbnbTotal.toFixed(2),
    directSavingsAmount: directSavingsAmount.toFixed(2),
    directSavingsPct: directSavingsPct.toFixed(2),
    installmentPlans,
  };
}

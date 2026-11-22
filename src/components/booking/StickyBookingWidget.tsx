"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ShieldCheck,
  CreditCard,
  Coins,
  Calendar,
  Users,
  Lock,
  AlertCircle,
  Car,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  MessageSquare,
  Phone,
  Video,
  Globe2,
  Clock,
} from "lucide-react";
import { calculateStayPricing } from "@/lib/math/money";
import {
  createBookingRequestAction,
  type CreatedBookingResult,
} from "@/modules/bookings/actions";
import {
  calculateNightsBetweenDates,
  type BookingPaymentCurrency,
} from "@/modules/bookings/validators";
import {
  DEFAULT_MID_TERM_POLICY,
  INTERVIEW_CHANNEL_LABELS,
  type InterviewChannel,
  type MidTermPolicy,
} from "@/modules/properties/mid-term-policy";
import type { OccupiedDateRange } from "@/modules/properties/queries";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  addDaysYmd,
  findFirstAvailableWindow,
  getArgentinaTodayYmd,
  hasRangeConflict,
} from "@/lib/calendar/availability";
import { usePropertyDateSelection } from "./PropertyDateSelectionContext";
import { PropertyAvailabilityCalendar } from "./PropertyAvailabilityCalendar";
import { PartialHoldStatusCard } from "./PartialHoldStatusCard";

export interface StickyBookingWidgetProps {
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  baseCurrency: "ARS" | "USD" | "USDT";
  nightlyRate: number;
  monthlyDiscountPct: number;
  maxAdults: number;
  absorbInstallmentsCost: boolean;
  acceptsUsdt: boolean;
  microCanonPct: number;
  consortiumName: string | null;
  midTermPolicy?: MidTermPolicy;
  occupiedRanges: OccupiedDateRange[];
  todayYmd?: string;
  hostResponseSummary?: {
    hostName: string;
    scheduleSummary: string;
    responseRatePct: number | null;
  };
  authenticatedEmail: string | null;
}

function formatMoneyDisplay(amount: string, currency: "ARS" | "USDT"): string {
  const num = Number(amount);
  if (currency === "USDT") {
    return `${num.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDT`;
  }
  return `$ ${num.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ARS`;
}

export function StickyBookingWidget({
  propertyId,
  propertyTitle,
  baseCurrency,
  nightlyRate,
  monthlyDiscountPct,
  maxAdults,
  absorbInstallmentsCost,
  acceptsUsdt,
  microCanonPct,
  consortiumName,
  midTermPolicy = DEFAULT_MID_TERM_POLICY,
  occupiedRanges,
  todayYmd,
  hostResponseSummary,
  authenticatedEmail,
}: StickyBookingWidgetProps) {
  const {
    currency: globalCurrency,
    setCurrency: setGlobalCurrency,
    notify,
  } = usePreferences();

  const dateContext = usePropertyDateSelection();
  const effectiveTodayYmd =
    todayYmd ?? dateContext?.todayYmd ?? getArgentinaTodayYmd();
  const effectiveOccupiedRanges =
    dateContext?.occupiedRanges ?? occupiedRanges;

  const initialWindow = useMemo(
    () =>
      dateContext?.initialWindow ??
      findFirstAvailableWindow(effectiveOccupiedRanges, effectiveTodayYmd, 5),
    [dateContext?.initialWindow, effectiveOccupiedRanges, effectiveTodayYmd]
  );

  const [widgetStep, setWidgetStep] = useState<0 | 1 | 2>(0);
  const [localCheckIn, setLocalCheckIn] = useState<string>(
    initialWindow.checkIn
  );
  const [localCheckOut, setLocalCheckOut] = useState<string>(
    initialWindow.checkOut
  );
  const [showInlineCalendar, setShowInlineCalendar] = useState<boolean>(false);

  const checkIn = dateContext ? dateContext.checkIn : localCheckIn;
  const checkOut = dateContext ? dateContext.checkOut : localCheckOut;
  const setCheckIn = dateContext ? dateContext.setCheckIn : setLocalCheckIn;
  const setCheckOut = dateContext ? dateContext.setCheckOut : setLocalCheckOut;

  function setDateRange(nextIn: string, nextOut: string) {
    if (dateContext) {
      dateContext.setDateRange(nextIn, nextOut);
    } else {
      setLocalCheckIn(nextIn);
      setLocalCheckOut(nextOut);
    }
  }
  const [declaredAdultsCount, setDeclaredAdultsCount] = useState<number>(
    Math.min(2, maxAdults)
  );
  const [paymentCurrency, setPaymentCurrency] =
    useState<BookingPaymentCurrency>("ARS");
  const [selectedInstallments, setSelectedInstallments] = useState<1 | 3 | 6>(
    3
  );
  const [vehiclePlate, setVehiclePlate] = useState<string>("");
  const [showVehicleField, setShowVehicleField] = useState<boolean>(false);
  const [showDetailedBreakdown, setShowDetailedBreakdown] =
    useState<boolean>(false);

  const [acknowledgedRequirements, setAcknowledgedRequirements] =
    useState<boolean>(false);
  const [preferredInterviewChannel, setPreferredInterviewChannel] =
    useState<InterviewChannel>(
      midTermPolicy.interviewChannels[0] ?? "PLATFORM_CHAT"
    );
  const [availabilityNote, setAvailabilityNote] = useState<string>("");
  const [isForeigner, setIsForeigner] = useState<boolean>(false);
  const [guestIntro, setGuestIntro] = useState<string>("");
  const [questionAnswers, setQuestionAnswers] = useState<
    Record<string, string>
  >({});

  const [submitState, setSubmitState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    errorCode?: string;
    errorMessage?: string;
    result?: CreatedBookingResult;
  }>({ status: "idle" });

  useEffect(() => {
    if (!midTermPolicy.interviewChannels.includes(preferredInterviewChannel)) {
      setPreferredInterviewChannel(
        midTermPolicy.interviewChannels[0] ?? "PLATFORM_CHAT"
      );
    }
  }, [midTermPolicy.interviewChannels, preferredInterviewChannel]);

  useEffect(() => {
    if (globalCurrency === "USDT" && !acceptsUsdt) {
      setPaymentCurrency("ARS");
      return;
    }
    setPaymentCurrency(globalCurrency);
  }, [globalCurrency, acceptsUsdt]);

  const nights = useMemo(
    () => calculateNightsBetweenDates(checkIn, checkOut),
    [checkIn, checkOut]
  );

  const isDateRangeValid = nights >= 1 && nights <= 180;

  const overlappingRange = useMemo(() => {
    if (!isDateRangeValid) return null;
    return (
      effectiveOccupiedRanges.find(
        (range) => checkIn < range.checkOut && checkOut > range.checkIn
      ) ?? null
    );
  }, [checkIn, checkOut, isDateRangeValid, effectiveOccupiedRanges]);

  const pricing = useMemo(() => {
    const safeNights = isDateRangeValid ? nights : 1;
    return calculateStayPricing({
      nightlyRate,
      nights: safeNights,
      monthlyDiscountPct,
      microCanonPct,
      absorbInstallmentsCost,
      baseCurrency,
      paymentCurrency,
    });
  }, [
    nightlyRate,
    nights,
    isDateRangeValid,
    monthlyDiscountPct,
    microCanonPct,
    absorbInstallmentsCost,
    baseCurrency,
    paymentCurrency,
  ]);

  const activeInstallmentPlan = useMemo(() => {
    return (
      pricing.installmentPlans.find(
        (p) => p.installments === selectedInstallments
      ) ?? pricing.installmentPlans[0]!
    );
  }, [pricing.installmentPlans, selectedInstallments]);

  const enabledRequirements = useMemo(
    () => midTermPolicy.requirements.filter((req) => req.enabled),
    [midTermPolicy.requirements]
  );

  const hasRequiredMidTermReqs = useMemo(
    () => enabledRequirements.some((req) => req.required),
    [enabledRequirements]
  );

  const isInterviewRequired =
    pricing.isMidTerm &&
    midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW";

  const hasStep2 =
    pricing.isMidTerm &&
    (enabledRequirements.length > 0 || isInterviewRequired);
  const totalSteps = hasStep2 ? 3 : 2;

  useEffect(() => {
    if (widgetStep === 2 && !hasStep2) {
      setWidgetStep(1);
    }
  }, [widgetStep, hasStep2]);

  function applyQuickStayPreset(targetNights: number) {
    const candidateOut = addDaysYmd(checkIn, targetNights);
    const conflict = hasRangeConflict(
      checkIn,
      candidateOut,
      effectiveOccupiedRanges
    );
    if (conflict) {
      const nextWindow = findFirstAvailableWindow(
        effectiveOccupiedRanges,
        checkIn,
        targetNights
      );
      setDateRange(nextWindow.checkIn, nextWindow.checkOut);
    } else {
      setCheckOut(candidateOut);
    }
    setSubmitState({ status: "idle" });
    if (targetNights >= 30) {
      notify(
        `¡Excelente! Activaste ${monthlyDiscountPct}% de descuento por estadía larga.`,
        "celebration",
        "trophy"
      );
    } else {
      notify("Calculamos una escapada de 5 noches.", "info", "calendar");
    }
  }

  function handleCurrencySwitch(next: BookingPaymentCurrency) {
    setPaymentCurrency(next);
    setGlobalCurrency(next, true);
  }

  async function handleBookingSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (widgetStep === 0) {
      if (isDateRangeValid && !overlappingRange) setWidgetStep(1);
      return;
    }

    if (widgetStep === 1 && hasStep2) {
      setWidgetStep(2);
      return;
    }

    if (
      pricing.isMidTerm &&
      hasRequiredMidTermReqs &&
      !acknowledgedRequirements
    ) {
      setSubmitState({
        status: "error",
        errorCode: "VALIDATION_ERROR",
        errorMessage:
          "Confirmá que leíste y cumplís con los requisitos del anfitrión para estadías de 1 a 6 meses.",
      });
      return;
    }

    if (isInterviewRequired) {
      if (guestIntro.trim().length < 10) {
        setSubmitState({
          status: "error",
          errorCode: "VALIDATION_ERROR",
          errorMessage:
            "Contanos brevemente sobre vos y el motivo de tu estadía (mínimo 10 caracteres).",
        });
        return;
      }
      const missingQ = midTermPolicy.screeningQuestions.find(
        (q) => !(questionAnswers[q]?.trim())
      );
      if (missingQ) {
        setSubmitState({
          status: "error",
          errorCode: "VALIDATION_ERROR",
          errorMessage: `Respondé la pregunta del anfitrión: "${missingQ}"`,
        });
        return;
      }
    }

    setSubmitState({ status: "submitting" });

    const res = await createBookingRequestAction({
      propertyId,
      checkIn,
      checkOut,
      declaredAdultsCount,
      paymentCurrency,
      installments: selectedInstallments,
      vehiclePlate: vehiclePlate.trim() || null,
      acknowledgedMidTermRequirements: pricing.isMidTerm
        ? acknowledgedRequirements
        : undefined,
      ...(isInterviewRequired
        ? {
            midTermApplication: {
              guestPhone: "",
              preferredInterviewChannel,
              availabilityNote: availabilityNote.trim(),
              isForeigner,
              guestIntro: guestIntro.trim(),
              questionAnswers: midTermPolicy.screeningQuestions.map((q) => ({
                question: q,
                answer: (questionAnswers[q] ?? "").trim(),
              })),
              acknowledgedRequirements,
              acknowledgedRequirementLabels: enabledRequirements.map(
                (r) => r.label
              ),
            },
          }
        : {}),
    });

    if (!res.ok) {
      setSubmitState({
        status: "error",
        errorCode: res.error.code,
        errorMessage: res.error.message,
      });
      return;
    }

    setSubmitState({
      status: "success",
      result: res.data,
    });
    dateContext?.addOccupiedRange({
      id: res.data.booking.id,
      checkIn: res.data.booking.checkIn,
      checkOut: res.data.booking.checkOut,
      status: res.data.booking.status,
      holdExpiresAt: res.data.booking.holdExpiresAt,
      hostConfirmedAt: res.data.booking.hostConfirmedAt,
      occupancyKind: "PARTIAL_HOLD",
    });
    notify(
      res.data.requiresHostApproval
        ? "¡Enviamos tu solicitud de entrevista! El anfitrión se va a comunicar pronto."
        : "¡Reserva parcial confirmada por 1 hora! Completá el pago y esperá la confirmación del anfitrión.",
      "celebration",
      res.data.requiresHostApproval ? "chat" : "trophy"
    );
  }

  const stepHeading =
    widgetStep === 0
      ? "Fechas de estadía"
      : widgetStep === 1
        ? "Huéspedes y pago"
        : "Requisitos y entrevista";

  return (
    <aside
      aria-label="Armá y reservá tu estadía"
      className="surface-card sticky top-24 p-6 space-y-5"
    >
      {/* Cabecera fija de precio por noche y moneda */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="text-2xl font-extrabold tracking-tight whitespace-nowrap">
              {formatMoneyDisplay(pricing.effectiveNightlyRate, paymentCurrency)}
            </span>
            <span className="text-xs font-semibold text-[var(--text-secondary)] whitespace-nowrap">
              por noche
            </span>
          </div>
          {pricing.isMidTerm ? (
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
              Ya incluye {pricing.discountPct}% de ahorro mensual y contrato
            </p>
          ) : (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              ¿Te quedás 30 noches o más? Tenés {monthlyDiscountPct}% de ahorro
            </p>
          )}
        </div>

        <div
          role="group"
          aria-label="Elegir moneda de pago"
          className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-extrabold"
        >
          <button
            type="button"
            onClick={() => handleCurrencySwitch("ARS")}
            aria-pressed={paymentCurrency === "ARS"}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-full px-3 transition-colors cursor-pointer ${
              paymentCurrency === "ARS"
                ? "bg-[var(--brand-primary)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            Pesos
          </button>
          {acceptsUsdt && (
            <button
              type="button"
              onClick={() => handleCurrencySwitch("USDT")}
              aria-pressed={paymentCurrency === "USDT"}
              className={`inline-flex min-h-[34px] items-center gap-1 rounded-full px-3 transition-colors cursor-pointer ${
                paymentCurrency === "USDT"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              USDT
            </button>
          )}
        </div>
      </div>

      {/* Barra segmentada de progreso del widget */}
      {submitState.status !== "success" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-extrabold text-[var(--text-secondary)]">
            <span>
              Paso {widgetStep + 1} de {totalSteps}
            </span>
            <span>{stepHeading}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Pasos para reservar"
            aria-valuemin={1}
            aria-valuemax={totalSteps}
            aria-valuenow={widgetStep + 1}
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-colors ${
                  idx < widgetStep
                    ? "bg-emerald-600"
                    : idx === widgetStep
                      ? "bg-[var(--brand-primary)]"
                      : "bg-[var(--border-subtle)]"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleBookingSubmit} className="space-y-5">
        {/* PASO 0: FECHAS DE ESTADÍA */}
        {widgetStep === 0 && (
          <div key="booking-step-0" className="animate-ibita-slide-next space-y-4">
            <div className="space-y-2.5">
              <p className="text-xs font-extrabold text-[var(--text-primary)]">
                1. ¿Cuándo querés venir?
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => applyQuickStayPreset(5)}
                  className={`min-h-[48px] rounded-xl border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    !pricing.isMidTerm
                      ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] font-extrabold"
                      : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] font-semibold"
                  }`}
                >
                  <span className="block">Escapada · 5 noches</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Tarifa estándar
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyQuickStayPreset(45)}
                  className={`min-h-[48px] rounded-xl border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                    pricing.isMidTerm
                      ? "border-emerald-600 bg-[var(--badge-consorcio-bg)] font-extrabold text-[var(--badge-consorcio-text)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] font-semibold"
                  }`}
                >
                  <span className="block">Estadía larga · 45n</span>
                  <span className="text-[11px] opacity-90">
                    -{monthlyDiscountPct}% ahorro
                  </span>
                </button>
              </div>

              <div className="grid grid-cols-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-hidden">
                <div className="p-3 border-r border-[var(--border-subtle)]">
                  <label
                    htmlFor="booking-check-in"
                    className="flex items-center gap-1 text-[11px] font-extrabold text-[var(--text-secondary)]"
                  >
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    Llegada
                  </label>
                  <input
                    id="booking-check-in"
                    name="checkIn"
                    type="date"
                    required
                    value={checkIn}
                    onChange={(e) => {
                      setCheckIn(e.target.value);
                      setSubmitState({ status: "idle" });
                    }}
                    className="mt-1 w-full bg-transparent text-xs sm:text-sm font-bold focus:outline-none"
                  />
                </div>

                <div className="p-3">
                  <label
                    htmlFor="booking-check-out"
                    className="flex items-center gap-1 text-[11px] font-extrabold text-[var(--text-secondary)]"
                  >
                    <Calendar className="h-3 w-3" aria-hidden="true" />
                    Salida
                  </label>
                  <input
                    id="booking-check-out"
                    name="checkOut"
                    type="date"
                    required
                    value={checkOut}
                    onChange={(e) => {
                      setCheckOut(e.target.value);
                      setSubmitState({ status: "idle" });
                    }}
                    className="mt-1 w-full bg-transparent text-xs sm:text-sm font-bold focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setShowInlineCalendar((prev) => !prev)}
                  aria-expanded={showInlineCalendar}
                  className="inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-primary)] hover:border-[var(--brand-primary)] cursor-pointer transition-colors"
                >
                  <Calendar
                    className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                    aria-hidden="true"
                  />
                  <span>
                    {showInlineCalendar
                      ? "Ocultar calendario visual"
                      : "Elegir fechas en calendario visual"}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      showInlineCalendar ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {showInlineCalendar && (
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70 p-3">
                    <PropertyAvailabilityCalendar
                      occupiedRanges={effectiveOccupiedRanges}
                      todayYmd={effectiveTodayYmd}
                      variant="compact"
                    />
                  </div>
                )}
              </div>
            </div>

            {!isDateRangeValid && (
              <div
                role="alert"
                className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-bold text-red-800 dark:text-red-300"
              >
                {nights < 1
                  ? "Elegí una fecha de salida posterior a la llegada (mínimo 1 noche)."
                  : "El máximo por reserva temporaria es de 180 noches (6 meses)."}
              </div>
            )}

            {overlappingRange && (
              <div
                role="alert"
                className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs font-bold text-amber-900 dark:text-amber-300 flex items-start gap-2"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  {overlappingRange.occupancyKind === "PARTIAL_HOLD"
                    ? `Esas fechas (${overlappingRange.checkIn} → ${overlappingRange.checkOut}) están en reserva parcial por 1 hora hasta confirmar el pago y la aprobación del anfitrión. Elegí otros días libres en el calendario.`
                    : `Esas fechas ya no están disponibles (${overlappingRange.checkIn} al ${overlappingRange.checkOut}). Elegí otros días libres para seguir.`}
                </div>
              </div>
            )}

            {isDateRangeValid && (
              <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
                <div className="flex items-center justify-between text-base font-extrabold">
                  <span>Total por {pricing.nights} noches:</span>
                  <span className="text-[var(--brand-primary)] whitespace-nowrap">
                    {formatMoneyDisplay(pricing.totalGuestPayable, paymentCurrency)}
                  </span>
                </div>

                <div className="rounded-2xl border border-emerald-600/35 bg-[var(--badge-consorcio-bg)]/60 p-3 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-extrabold text-[var(--badge-consorcio-text)]">
                    <Icon3D name="sparkle" size="sm" />
                    <span>Ahorro directo</span>
                  </div>
                  <span className="font-black text-[var(--badge-consorcio-text)] whitespace-nowrap">
                    {formatMoneyDisplay(pricing.directSavingsAmount, paymentCurrency)}{" "}
                    ({pricing.directSavingsPct}%)
                  </span>
                </div>

                {pricing.isMidTerm && (
                  <AchievementBanner
                    icon="contract"
                    tone="emerald"
                    title="Estadía larga con contrato digital incluido"
                    description={`Para confirmar pagás el Mes 1 + depósito en custodia (${formatMoneyDisplay(pricing.dueAtCheckInAmount, paymentCurrency)}).`}
                  />
                )}
              </div>
            )}

            <button
              type="button"
              disabled={!isDateRangeValid || Boolean(overlappingRange)}
              onClick={() => setWidgetStep(1)}
              className="btn-primary-3d w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold disabled:opacity-45"
            >
              <span>Siguiente: huéspedes y pago</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* PASO 1: HUÉSPEDES Y FORMA DE PAGO */}
        {widgetStep === 1 && (
          <div key="booking-step-1" className="animate-ibita-slide-next space-y-4">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-[var(--text-primary)]">
                  {checkIn} → {checkOut}
                </span>{" "}
                <span className="text-[var(--text-secondary)]">
                  ({pricing.nights} noches)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setWidgetStep(0)}
                className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
              >
                Cambiar
              </button>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-extrabold text-[var(--text-primary)]">
                2. ¿Cuántos adultos se hospedan?
              </p>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
                <label
                  htmlFor="booking-adults"
                  className="flex items-center gap-1 text-[11px] font-extrabold text-[var(--text-secondary)]"
                >
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Cantidad de personas mayores de 18 años
                </label>
                <select
                  id="booking-adults"
                  name="declaredAdultsCount"
                  value={declaredAdultsCount}
                  onChange={(e) => {
                    setDeclaredAdultsCount(Number(e.target.value));
                    setSubmitState({ status: "idle" });
                  }}
                  className="mt-1 w-full bg-transparent text-sm font-bold focus:outline-none"
                >
                  {Array.from({ length: maxAdults }, (_, i) => i + 1).map((cnt) => (
                    <option
                      key={cnt}
                      value={cnt}
                      className="bg-[var(--bg-primary)] text-[var(--text-primary)]"
                    >
                      {cnt}{" "}
                      {cnt === 1
                        ? "Adulto (solo vos)"
                        : `Adultos (vos + ${cnt - 1} acompañante${cnt > 2 ? "s" : ""})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <button
                  type="button"
                  aria-expanded={showVehicleField}
                  onClick={() => setShowVehicleField((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand-primary)] hover:underline cursor-pointer"
                >
                  <Car className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {showVehicleField
                      ? "Ocultar patente del auto"
                      : "¿Venís en auto? Anotar patente (opcional)"}
                  </span>
                </button>

                {showVehicleField && (
                  <div className="mt-2 animate-ibita-fade-up rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
                    <label
                      htmlFor="booking-vehicle"
                      className="block text-[11px] font-extrabold text-[var(--text-secondary)]"
                    >
                      Patente para avisar en portería
                    </label>
                    <input
                      id="booking-vehicle"
                      name="vehiclePlate"
                      type="text"
                      maxLength={20}
                      value={vehiclePlate}
                      onChange={(e) => setVehiclePlate(e.target.value)}
                      placeholder="Ej: AF 492 LK"
                      className="mt-1 w-full bg-transparent text-sm font-mono font-bold uppercase focus:outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {paymentCurrency === "ARS" && isDateRangeValid && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-extrabold text-[var(--text-primary)]">
                    3. ¿En cuántos pagos preferís?
                  </p>
                  {absorbInstallmentsCost && (
                    <span className="rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-2.5 py-0.5 text-[10px] font-extrabold">
                      Cuotas sin interés
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {pricing.installmentPlans.map((plan) => (
                    <button
                      key={plan.installments}
                      type="button"
                      onClick={() => setSelectedInstallments(plan.installments)}
                      aria-pressed={selectedInstallments === plan.installments}
                      className={`min-h-[48px] rounded-xl border p-2 text-center transition-colors cursor-pointer ${
                        selectedInstallments === plan.installments
                          ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] font-extrabold shadow-xs"
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                      }`}
                    >
                      <span className="block text-xs">
                        {plan.installments}{" "}
                        {plan.installments === 1 ? "Pago" : "Cuotas"}
                      </span>
                      <span className="block text-[10px] text-emerald-700 dark:text-emerald-400">
                        {plan.interestFree
                          ? "Sin recargo"
                          : `+${plan.surchargePct}%`}
                      </span>
                    </button>
                  ))}
                </div>

                <p className="text-xs text-[var(--text-secondary)]">
                  Pagás{" "}
                  <strong className="text-[var(--text-primary)]">
                    {activeInstallmentPlan.installments}x{" "}
                    {formatMoneyDisplay(
                      activeInstallmentPlan.installmentAmount,
                      "ARS"
                    )}
                  </strong>{" "}
                  con Mercado Pago o MODO.
                </p>
              </div>
            )}

            <button
              type="button"
              aria-expanded={showDetailedBreakdown}
              onClick={() => setShowDetailedBreakdown((prev) => !prev)}
              className="inline-flex w-full items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] cursor-pointer"
            >
              <span>Ver el detalle completo del cálculo</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  showDetailedBreakdown ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {showDetailedBreakdown && (
              <div className="animate-ibita-fade-up rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">
                    Estadía base ({pricing.nights} noches):
                  </span>
                  <span className="font-semibold">
                    {formatMoneyDisplay(pricing.grossSubtotal, paymentCurrency)}
                  </span>
                </div>
                {pricing.isMidTerm && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                    <span>Descuento mensual (-{pricing.discountPct}%):</span>
                    <span>
                      -{" "}
                      {formatMoneyDisplay(
                        pricing.discountAmount,
                        paymentCurrency
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">
                    Alojamiento neto:
                  </span>
                  <span className="font-semibold">
                    {formatMoneyDisplay(
                      pricing.netAccommodationAmount,
                      paymentCurrency
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">
                    Servicio I-bita ({pricing.platformFeePct}%):
                  </span>
                  <span className="font-semibold">
                    {formatMoneyDisplay(
                      pricing.platformFeeAmount,
                      paymentCurrency
                    )}
                  </span>
                </div>
                {Number(pricing.consortiumCanonPct) > 0 && (
                  <div className="flex justify-between text-emerald-800 dark:text-emerald-300">
                    <span>
                      Aporte incluido al consorcio (
                      {pricing.consortiumCanonPct}%
                      {consortiumName ? ` · ${consortiumName}` : ""}):
                    </span>
                    <span className="font-bold">
                      {formatMoneyDisplay(
                        pricing.consortiumCanonAmount,
                        paymentCurrency
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setWidgetStep(0)}
                className="btn-secondary-3d inline-flex min-h-[48px] items-center gap-1 rounded-2xl px-4 text-xs font-extrabold"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Fechas</span>
              </button>

              {hasStep2 ? (
                <button
                  type="button"
                  onClick={() => setWidgetStep(2)}
                  className="btn-primary-3d flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-extrabold"
                >
                  <span>
                    {isInterviewRequired
                      ? "Siguiente: entrevista y requisitos"
                      : "Siguiente: revisar requisitos"}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!isDateRangeValid || submitState.status === "submitting"}
                  className="btn-primary-3d flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-extrabold disabled:opacity-50"
                >
                  <span>
                    {submitState.status === "submitting"
                      ? "Creando reserva parcial..."
                      : "Confirmar reserva parcial (1 hora)"}
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {!hasStep2 && (
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Tus fechas quedan apartadas de forma parcial por{" "}
                <strong className="text-[var(--text-primary)]">1 hora</strong>{" "}
                hasta que se acredite el pago y el anfitrión confirme la estadía.
              </p>
            )}
          </div>
        )}

        {/* PASO 2: REQUISITOS Y ENTREVISTA PREVIA (SOLO ESTADÍA LARGA) */}
        {widgetStep === 2 && hasStep2 && (
          <div key="booking-step-2" className="animate-ibita-slide-next space-y-4">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
              <span>
                <strong>{pricing.nights} noches</strong> ·{" "}
                <strong>{declaredAdultsCount}</strong>{" "}
                {declaredAdultsCount === 1 ? "adulto" : "adultos"}
              </span>
              <button
                type="button"
                onClick={() => setWidgetStep(1)}
                className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
              >
                Cambiar
              </button>
            </div>

            {enabledRequirements.length > 0 && (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70 p-3.5 space-y-2.5 text-xs">
                <p className="font-extrabold text-[var(--text-primary)]">
                  Requisitos del anfitrión (1 a 6 meses):
                </p>
                <ul className="space-y-1.5">
                  {enabledRequirements.map((req) => (
                    <li
                      key={req.id}
                      className={`rounded-xl border px-3 py-2 space-y-0.5 ${
                        isForeigner && req.category === "FOREIGNERS"
                          ? "border-sky-600/50 bg-[var(--badge-ars-bg)]/40"
                          : "border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-extrabold text-[var(--text-primary)]">
                          {req.label}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                            req.required
                              ? "bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                              : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {req.required ? "Obligatorio" : "Opcional"}
                        </span>
                      </div>
                      {req.detail && (
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {req.detail}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>

                <label className="flex items-start gap-2 pt-1 font-bold text-[var(--text-primary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledgedRequirements}
                    onChange={(e) => {
                      setAcknowledgedRequirements(e.target.checked);
                      setSubmitState({ status: "idle" });
                    }}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)] shrink-0"
                  />
                  <span>
                    Confirmo que leí y cumplo los requisitos solicitados por el
                    anfitrión.
                  </span>
                </label>
              </div>
            )}

            {isInterviewRequired && (
              <div className="rounded-2xl border border-emerald-600/35 bg-[var(--bg-secondary)]/50 p-4 space-y-3.5 text-xs">
                <div className="space-y-1">
                  <p className="font-extrabold text-sm text-[var(--text-primary)]">
                    Entrevista previa con el anfitrión
                  </p>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    Antes de confirmar o cobrar, el anfitrión conversa con vos
                    para conocerse (respuesta estimada dentro de{" "}
                    <strong>{midTermPolicy.responseTimeHours} hs</strong>).
                  </p>
                  {midTermPolicy.interviewInstructions && (
                    <p className="rounded-xl bg-[var(--bg-primary)] px-3 py-2 font-semibold text-[var(--text-primary)]">
                      {midTermPolicy.interviewInstructions}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="font-extrabold text-[var(--text-primary)]">
                    ¿Cómo preferís tener la entrevista? *
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {midTermPolicy.interviewChannels.map((channel) => {
                      const active = preferredInterviewChannel === channel;
                      return (
                        <button
                          key={channel}
                          type="button"
                          onClick={() => setPreferredInterviewChannel(channel)}
                          aria-pressed={active}
                          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 py-1.5 font-extrabold cursor-pointer transition-colors ${
                            active
                              ? "border-emerald-600 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {channel === "PLATFORM_VOICE" ? (
                            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : channel === "PLATFORM_CHAT" ? (
                            <MessageSquare
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <Video className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>{INTERVIEW_CHANNEL_LABELS[channel]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="rounded-xl border border-emerald-600/30 bg-[var(--badge-consorcio-bg)]/50 px-3 py-2 text-[11px] font-bold text-[var(--badge-consorcio-text)]">
                    Toda la entrevista sucede en tu bandeja de Mensajes dentro de I-bita (sin compartir teléfonos afuera).
                  </div>
                  <div>
                    <label
                      htmlFor="midterm-availability"
                      className="block font-bold mb-1"
                    >
                      Días y horarios cómodos para charlar acá
                    </label>
                    <input
                      id="midterm-availability"
                      type="text"
                      maxLength={240}
                      value={availabilityNote}
                      onChange={(e) => setAvailabilityNote(e.target.value)}
                      placeholder="Ej: Lun a Vie 14 a 19 hs"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isForeigner}
                    onChange={(e) => setIsForeigner(e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand-primary)]"
                  />
                  <Globe2
                    className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Soy extranjero / vengo del exterior</span>
                </label>

                <div>
                  <label
                    htmlFor="midterm-guest-intro"
                    className="block font-bold mb-1"
                  >
                    Contanos brevemente sobre vos y tu estadía *
                  </label>
                  <textarea
                    id="midterm-guest-intro"
                    required
                    minLength={10}
                    maxLength={600}
                    rows={2}
                    value={guestIntro}
                    onChange={(e) => setGuestIntro(e.target.value)}
                    placeholder="Ej: Vengo por trabajo remoto por 2 meses, vivo solo/a y busco un edificio tranquilo."
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                  />
                </div>

                {midTermPolicy.screeningQuestions.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--border-subtle)] pt-2.5">
                    <p className="font-extrabold text-[var(--text-primary)]">
                      Preguntas previas del anfitrión:
                    </p>
                    {midTermPolicy.screeningQuestions.map((question, idx) => (
                      <div key={`${question}-${idx}`}>
                        <label
                          htmlFor={`midterm-q-${idx}`}
                          className="block font-bold mb-1 text-[11px]"
                        >
                          {idx + 1}. {question} *
                        </label>
                        <input
                          id={`midterm-q-${idx}`}
                          type="text"
                          required
                          maxLength={400}
                          value={questionAnswers[question] ?? ""}
                          onChange={(e) =>
                            setQuestionAnswers((prev) => ({
                              ...prev,
                              [question]: e.target.value,
                            }))
                          }
                          placeholder="Tu respuesta..."
                          className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setWidgetStep(1)}
                className="btn-secondary-3d inline-flex min-h-[48px] items-center gap-1 rounded-2xl px-4 text-xs font-extrabold"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Atrás</span>
              </button>

              <button
                type="submit"
                disabled={!isDateRangeValid || submitState.status === "submitting"}
                className="btn-primary-3d flex-1 min-h-[50px] inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-extrabold disabled:opacity-50"
              >
                <span>
                  {submitState.status === "submitting"
                    ? isInterviewRequired
                      ? "Enviando solicitud..."
                      : "Apartando fechas..."
                    : isInterviewRequired
                      ? "Enviar solicitud de entrevista"
                      : "Reservar estadía y preparar acuerdo"}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Mensaje de error humano */}
        {submitState.status === "error" && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs space-y-2"
          >
            <div className="flex items-center gap-2 font-extrabold text-red-800 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {submitState.errorCode === "BOOKING_OVERLAP_CONFLICT"
                  ? "Esas fechas acaban de ocuparse"
                  : submitState.errorCode === "UNAUTHORIZED"
                    ? "Primero iniciá sesión para guardar tu reserva"
                    : "No pudimos confirmar tu solicitud"}
              </span>
            </div>
            <p className="text-[var(--text-secondary)]">
              {submitState.errorMessage}
            </p>
            {submitState.errorCode === "UNAUTHORIZED" && (
              <a
                href="/login"
                className="inline-block underline font-extrabold text-[var(--brand-primary)]"
              >
                Ingresar a mi cuenta ahora →
              </a>
            )}
          </div>
        )}

        {/* Confirmación con sentido de logro */}
        {submitState.status === "success" && submitState.result && (
          <div className="space-y-3">
            {submitState.result.requiresHostApproval ? (
              <>
                <AchievementBanner
                  icon="trophy"
                  tone="emerald"
                  title="¡Enviamos tu solicitud de entrevista!"
                  description={`El anfitrión recibió tu pedido para ${propertyTitle} del ${submitState.result.booking.checkIn} al ${submitState.result.booking.checkOut}.`}
                />
                <div className="rounded-2xl border border-emerald-600/30 bg-[var(--bg-secondary)] p-4 space-y-3 text-xs">
                  <p className="font-extrabold text-[var(--text-primary)]">
                    ¿Qué sigue ahora?
                  </p>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    No se realizó ningún cobro todavía. El anfitrión te contactará por{" "}
                    <strong>
                      {INTERVIEW_CHANNEL_LABELS[preferredInterviewChannel]}
                    </strong>{" "}
                    para charlar y confirmar tus requisitos. Apenas te apruebe,
                    se habilita el pago.
                  </p>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 space-y-1">
                    <p className="flex items-center gap-1.5 font-extrabold text-[var(--text-primary)]">
                      <Clock className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
                      <span>
                        Respuesta esperada {submitState.result.hostResponseWindow.dueAtLabelEsAr}
                      </span>
                    </p>
                    <p className="text-[var(--text-secondary)]">
                      Horario confirmado: {submitState.result.hostResponseWindow.scheduleSummary}.
                      {submitState.result.hostResponseWindow.responseRatePct !== null
                        ? ` Tasa sincronizada: ${submitState.result.hostResponseWindow.responseRatePct}%.`
                        : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <a
                      href={`/mensajes?booking=${submitState.result.booking.id}`}
                      className="btn-primary-3d inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold"
                    >
                      <span>Abrir entrevista en Mensajes</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    <a
                      href="/perfil"
                      className="btn-secondary-3d inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold"
                    >
                      <span>Seguir el estado en Mi perfil</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    <a
                      href={`/checkout/${submitState.result.booking.id}?token=${submitState.result.guestVerifications[0]?.inviteToken ?? ""}`}
                      className="btn-secondary-3d inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold"
                    >
                      <span>Ver resumen de la solicitud</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </>
            ) : (
              <>
                <AchievementBanner
                  icon="check"
                  tone="emerald"
                  title="¡Reserva parcial confirmada por 1 hora!"
                  description={`Apartamos ${propertyTitle} del ${submitState.result.booking.checkIn} al ${submitState.result.booking.checkOut} (${submitState.result.booking.nightsCount} noches) por 60 minutos mientras completás el pago y el anfitrión confirma la reserva.`}
                />

                <PartialHoldStatusCard
                  compact
                  propertySlug={submitState.result.booking.propertySlug}
                  status={submitState.result.booking.status}
                  holdExpiresAt={submitState.result.booking.holdExpiresAt}
                  hostConfirmedAt={submitState.result.booking.hostConfirmedAt}
                  checkIn={submitState.result.booking.checkIn}
                  checkOut={submitState.result.booking.checkOut}
                  nightsCount={submitState.result.booking.nightsCount}
                />

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 space-y-1.5 text-xs">
                  <p className="flex items-center gap-1.5 font-extrabold text-[var(--text-primary)]">
                    <Clock className="h-3.5 w-3.5 text-[var(--brand-primary)] shrink-0" aria-hidden="true" />
                    <span>
                      Confirmación e instrucciones de ingreso:{" "}
                      {submitState.result.hostResponseWindow.dueAtLabelEsAr}
                    </span>
                  </p>
                  <p className="text-[var(--text-secondary)] leading-relaxed">
                    Luego de pagar y validar tu DNI, el anfitrión te escribe por Mensajes dentro de su horario:{" "}
                    <strong className="text-[var(--text-primary)]">
                      {submitState.result.hostResponseWindow.scheduleSummary}
                    </strong>
                    .
                    {submitState.result.hostResponseWindow.responseRatePct !== null
                      ? ` Tasa sincronizada: ${submitState.result.hostResponseWindow.responseRatePct}%.`
                      : ""}
                  </p>
                  <a
                    href={`/mensajes?booking=${submitState.result.booking.id}`}
                    className="inline-flex items-center gap-1 font-extrabold text-[var(--brand-primary)] underline"
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Abrir Mensajes de esta reserva →</span>
                  </a>
                </div>

                <div className="rounded-2xl border border-emerald-600/30 bg-[var(--bg-secondary)] p-4 space-y-2.5 text-xs">
                  <p className="font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                    <ShieldCheck
                      className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    Accesos listos para confirmar identidad (
                    {submitState.result.guestVerifications.length}{" "}
                    {submitState.result.guestVerifications.length === 1
                      ? "adulto"
                      : "adultos"}
                    ):
                  </p>

                  <ul className="space-y-1.5">
                    {submitState.result.guestVerifications.map((slot, idx) => (
                      <li
                        key={slot.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg-primary)] px-3 py-2"
                      >
                        <span className="font-bold">
                          {slot.isPrimaryGuest
                            ? "Titular (Vos)"
                            : `Acompañante #${idx + 1}`}
                        </span>
                        <a
                          href={slot.checkinPath}
                          className="text-emerald-700 dark:text-emerald-400 font-extrabold underline hover:opacity-80"
                        >
                          Validar DNI →
                        </a>
                      </li>
                    ))}
                  </ul>

                  <div className="grid grid-cols-1 gap-2 pt-1">
                    {submitState.result.booking.paymentCurrency === "ARS" ? (
                      <a
                        href={`/checkout/${submitState.result.booking.id}?token=${submitState.result.guestVerifications[0]?.inviteToken ?? ""}`}
                        className="btn-primary-3d inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold"
                      >
                        <span>Continuar al pago en pesos</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : (
                      <a
                        href={`/checkout/${submitState.result.booking.id}?token=${submitState.result.guestVerifications[0]?.inviteToken ?? ""}`}
                        className="btn-primary-3d inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold"
                      >
                        <span>Continuar al pago en USDT</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    )}
                    <a
                      href={`/checkin/${submitState.result.booking.id}`}
                      className="btn-secondary-3d inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold"
                    >
                      <span>Ir a confirmar identidad</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </form>

      {/* Pie tranquilizador */}
      <div className="border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-secondary)] space-y-1.5">
        <p className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
          <Lock
            className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
            aria-hidden="true"
          />
          Ingreso cuidado para vos y el edificio
        </p>
        <p>
          La clave de la cerradura se entrega automáticamente apenas los{" "}
          <strong>{declaredAdultsCount} adultos</strong> validen su identidad.
        </p>
        {hostResponseSummary && (
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
            Atención de {hostResponseSummary.hostName}:{" "}
            <strong className="text-[var(--text-primary)]">
              {hostResponseSummary.scheduleSummary}
            </strong>
            {hostResponseSummary.responseRatePct !== null
              ? ` · ${hostResponseSummary.responseRatePct}% a tiempo`
              : ""}
          </p>
        )}
        {!authenticatedEmail && (
          <p>
            ¿Ya tenés cuenta?{" "}
            <a
              href="/login"
              className="underline font-bold text-[var(--brand-primary)]"
            >
              Ingresá acá
            </a>{" "}
            antes de reservar.
          </p>
        )}
      </div>
    </aside>
  );
}

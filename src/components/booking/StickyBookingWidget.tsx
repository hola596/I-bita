"use client";

import { useState, useMemo } from "react";
import {
  ShieldCheck,
  CreditCard,
  Coins,
  Calendar,
  Users,
  Sparkles,
  FileCheck2,
  Lock,
  CheckCircle2,
  AlertCircle,
  Car,
  ArrowRight,
} from "lucide-react";
import { calculateStayPricing } from "@/lib/math/money";
import { createBookingRequestAction, type CreatedBookingResult } from "@/modules/bookings/actions";
import {
  calculateNightsBetweenDates,
  type BookingPaymentCurrency,
} from "@/modules/bookings/validators";
import type { OccupiedDateRange } from "@/modules/properties/queries";

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
  occupiedRanges: OccupiedDateRange[];
  authenticatedEmail: string | null;
}

function addDaysYmd(baseYmd: string, daysToAdd: number): string {
  const [y = 2027, m = 1, d = 1] = baseYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd));
  const outY = dt.getUTCFullYear();
  const outM = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const outD = String(dt.getUTCDate()).padStart(2, "0");
  return `${outY}-${outM}-${outD}`;
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
  occupiedRanges,
  authenticatedEmail,
}: StickyBookingWidgetProps) {
  const defaultCheckIn = "2027-03-10";
  const defaultCheckOut = "2027-03-15";

  const [checkIn, setCheckIn] = useState<string>(defaultCheckIn);
  const [checkOut, setCheckOut] = useState<string>(defaultCheckOut);
  const [declaredAdultsCount, setDeclaredAdultsCount] = useState<number>(
    Math.min(2, maxAdults)
  );
  const [paymentCurrency, setPaymentCurrency] =
    useState<BookingPaymentCurrency>("ARS");
  const [selectedInstallments, setSelectedInstallments] = useState<1 | 3 | 6>(
    3
  );
  const [vehiclePlate, setVehiclePlate] = useState<string>("");

  const [submitState, setSubmitState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    errorCode?: string;
    errorMessage?: string;
    result?: CreatedBookingResult;
  }>({ status: "idle" });

  const nights = useMemo(
    () => calculateNightsBetweenDates(checkIn, checkOut),
    [checkIn, checkOut]
  );

  const isDateRangeValid = nights >= 1 && nights <= 180;

  const overlappingRange = useMemo(() => {
    if (!isDateRangeValid) return null;
    return (
      occupiedRanges.find(
        (range) => checkIn < range.checkOut && checkOut > range.checkIn
      ) ?? null
    );
  }, [checkIn, checkOut, isDateRangeValid, occupiedRanges]);

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

  function applyQuickStayPreset(targetNights: number) {
    setCheckOut(addDaysYmd(checkIn, targetNights));
    setSubmitState({ status: "idle" });
  }

  async function handleBookingSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitState({ status: "submitting" });

    const res = await createBookingRequestAction({
      propertyId,
      checkIn,
      checkOut,
      declaredAdultsCount,
      paymentCurrency,
      installments: selectedInstallments,
      vehiclePlate: vehiclePlate.trim() || null,
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
  }

  return (
    <aside
      aria-label="Calculadora Tarifaria Exacta y Reserva Directa"
      className="sticky top-24 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-lg space-y-5"
    >
      {/* Cabecera de Precio por Noche + Conmutador Bi-Monetario ARS / USDT */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold tracking-tight">
              {formatMoneyDisplay(pricing.effectiveNightlyRate, paymentCurrency)}
            </span>
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              / noche
            </span>
          </div>
          {pricing.isMidTerm ? (
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
              Incluye {pricing.discountPct}% OFF mensual + Comisión reducida{" "}
              {pricing.platformFeePct}%
            </p>
          ) : (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Reservá 30+ noches para activar {monthlyDiscountPct}% OFF y fee
              del 6%
            </p>
          )}
        </div>

        {/* Conmutador ARS vs USDT */}
        <div
          role="group"
          aria-label="Seleccionar moneda de cotización y pago"
          className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-bold"
        >
          <button
            type="button"
            onClick={() => setPaymentCurrency("ARS")}
            aria-pressed={paymentCurrency === "ARS"}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition-colors cursor-pointer ${
              paymentCurrency === "ARS"
                ? "bg-[var(--brand-primary)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            ARS $
          </button>
          {acceptsUsdt && (
            <button
              type="button"
              onClick={() => setPaymentCurrency("USDT")}
              aria-pressed={paymentCurrency === "USDT"}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition-colors cursor-pointer ${
                paymentCurrency === "USDT"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              USDT ₮
            </button>
          )}
        </div>
      </div>

      {/* Selector Rápido de Modalidad: Estadía Corta vs. Media Estadía (30 a 180 noches) */}
      <div className="space-y-1.5">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
          Modo de Estadía (Simulador Instantáneo)
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => applyQuickStayPreset(5)}
            className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
              !pricing.isMidTerm
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 font-extrabold"
                : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] font-semibold"
            }`}
          >
            <span className="block">Por Día (5 noches)</span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              Fee estándar 11%
            </span>
          </button>
          <button
            type="button"
            onClick={() => applyQuickStayPreset(45)}
            className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
              pricing.isMidTerm
                ? "border-emerald-600 bg-[var(--badge-consorcio-bg)] font-extrabold text-[var(--badge-consorcio-text)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] font-semibold"
            }`}
          >
            <span className="block">Media Estadía (45n)</span>
            <span className="text-[11px] opacity-90">
              -{monthlyDiscountPct}% OFF · Fee 6%
            </span>
          </button>
        </div>
      </div>

      {/* Formulario de Fechas, Adultos y Financiación */}
      <form onSubmit={handleBookingSubmit} className="space-y-4">
        <div className="grid grid-cols-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] overflow-hidden">
          <div className="p-3 border-r border-[var(--border-subtle)]">
            <label
              htmlFor="booking-check-in"
              className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              <Calendar className="h-3 w-3" aria-hidden="true" />
              Check-in
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
              className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              <Calendar className="h-3 w-3" aria-hidden="true" />
              Check-out
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

        {/* Selector de Adultos Declarados + Patente Opcional */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
            <label
              htmlFor="booking-adults"
              className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Adultos Declarados
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
                  {cnt} {cnt === 1 ? "Adulto (Titular)" : `Adultos (1 Titular + ${cnt - 1} Acomp.)`}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3">
            <label
              htmlFor="booking-vehicle"
              className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              <Car className="h-3.5 w-3.5" aria-hidden="true" />
              Patente (Opcional)
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
        </div>

        {/* Selector de Cuotas en ARS (1, 3 y 6 cuotas con Mercado Pago / MODO) */}
        {paymentCurrency === "ARS" && isDateRangeValid && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold flex items-center gap-1.5">
                <CreditCard
                  className="h-4 w-4 text-[var(--brand-primary)]"
                  aria-hidden="true"
                />
                Financiación Local ARS (Sin Percepciones)
              </span>
              {absorbInstallmentsCost && (
                <span className="rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-2 py-0.5 text-[10px] font-extrabold">
                  Cuotas Sin Interés
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
                  className={`rounded-xl border p-2 text-center transition-colors cursor-pointer ${
                    selectedInstallments === plan.installments
                      ? "border-[var(--brand-primary)] bg-[var(--bg-primary)] font-extrabold shadow-xs"
                      : "border-[var(--border-subtle)] bg-transparent text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="block text-xs">
                    {plan.installments}{" "}
                    {plan.installments === 1 ? "Pago" : "Cuotas"}
                  </span>
                  <span className="block text-[10px] text-emerald-700 dark:text-emerald-400">
                    {plan.interestFree
                      ? "0% recargo"
                      : `+${plan.surchargePct}% CFT`}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Abonás{" "}
              <strong className="text-[var(--text-primary)]">
                {activeInstallmentPlan.installments}x{" "}
                {formatMoneyDisplay(
                  activeInstallmentPlan.installmentAmount,
                  "ARS"
                )}
              </strong>{" "}
              con Mercado Pago o MODO (Cero Impuesto PAIS / 0% retención dólar
              tarjeta).
            </p>
          </div>
        )}

        {/* Alerta de fechas inválidas o solapamiento detectado */}
        {!isDateRangeValid && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs font-bold text-red-800 dark:text-red-300"
          >
            {nights < 1
              ? "Seleccioná una fecha de check-out posterior al check-in (mínimo 1 noche)."
              : "El máximo legal para locación temporaria y Media Estadía es de 180 noches (6 meses — Art. 1199 CCyC)."}
          </div>
        )}

        {overlappingRange && (
          <div
            role="alert"
            className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs font-bold text-amber-900 dark:text-amber-300 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              Las fechas seleccionadas se superponen con un bloqueo activo del{" "}
              <code>{overlappingRange.checkIn}</code> al{" "}
              <code>{overlappingRange.checkOut}</code> (protegido en PostgreSQL
              por <code>btree_gist</code>).
            </div>
          </div>
        )}

        {/* Desglose Matemático Exacto con decimal.js */}
        {isDateRangeValid && (
          <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">
                Estadía base ({pricing.nights}{" "}
                {pricing.nights === 1 ? "noche" : "noches"}):
              </span>
              <span className="font-semibold">
                {formatMoneyDisplay(pricing.grossSubtotal, paymentCurrency)}
              </span>
            </div>

            {pricing.isMidTerm && (
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                <span>
                  Descuento Media Estadía (-{pricing.discountPct}%):
                </span>
                <span>
                  - {formatMoneyDisplay(pricing.discountAmount, paymentCurrency)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between">
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

            <div className="flex items-center justify-between">
              <span className="text-[var(--text-secondary)]">
                Comisión I-bita ({pricing.platformFeePct}%{" "}
                {pricing.isMidTerm ? "tramo reducido" : "estándar"}):
              </span>
              <span className="font-semibold">
                {formatMoneyDisplay(pricing.platformFeeAmount, paymentCurrency)}
              </span>
            </div>

            {Number(pricing.consortiumCanonPct) > 0 && (
              <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                <span>
                  Micro-Canon Consorcial ({pricing.consortiumCanonPct}% incluido
                  al edificio{consortiumName ? ` · ${consortiumName}` : ""}):
                </span>
                <span className="font-bold">
                  {formatMoneyDisplay(
                    pricing.consortiumCanonAmount,
                    paymentCurrency
                  )}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 text-base font-extrabold">
              <span>Total Reserva I-bita:</span>
              <span>
                {formatMoneyDisplay(pricing.totalGuestPayable, paymentCurrency)}
              </span>
            </div>

            {/* Desglose Especial de Media Estadía (30 a 180 noches): Mes 1 + Depósito Escrow + Art. 1199 CCyC */}
            {pricing.isMidTerm && (
              <div className="rounded-2xl border border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/60 p-3.5 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-extrabold text-[var(--badge-consorcio-text)]">
                  <FileCheck2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Régimen Media Estadía (30–180 noches · Art. 1199 CCyC)
                  </span>
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Incluye emisión automática de{" "}
                  <strong>Contrato Temporario Digital sellado con SHA-256</strong>{" "}
                  y custodia del depósito en garantía en <strong>Escrow</strong>:
                </p>
                <div className="space-y-1 border-t border-emerald-600/20 pt-2">
                  <div className="flex justify-between">
                    <span>Mes 1 ({pricing.firstMonthNights} noches + fee 6%):</span>
                    <span className="font-bold">
                      {formatMoneyDisplay(
                        String(
                          (
                            Number(pricing.firstMonthAccommodationAmount) +
                            Number(pricing.firstMonthPlatformFeeAmount)
                          ).toFixed(2)
                        ),
                        paymentCurrency
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Depósito en Garantía en Custodia (Escrow 15d):</span>
                    <span className="font-bold">
                      {formatMoneyDisplay(
                        pricing.escrowDepositAmount,
                        paymentCurrency
                      )}{" "}
                      ({pricing.escrowDepositUsdt} USDT)
                    </span>
                  </div>
                  <div className="flex justify-between font-extrabold text-[var(--badge-consorcio-text)] pt-1">
                    <span>Total exigible al Check-in (Mes 1 + Escrow):</span>
                    <span>
                      {formatMoneyDisplay(
                        pricing.dueAtCheckInAmount,
                        paymentCurrency
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tarjeta Comparativa: Ahorro Directo I-bita vs. Airbnb */}
            <div
              aria-label="Comparador de Ahorro Directo I-bita versus Airbnb"
              className="rounded-2xl border-2 border-[var(--brand-primary)]/40 bg-[var(--bg-secondary)] p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--brand-primary)]">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Ahorro Directo I-bita vs. Airbnb
                </span>
                <span className="rounded-full bg-[var(--brand-primary)] px-2.5 py-0.5 text-[11px] font-extrabold text-white">
                  Ahorrás {pricing.directSavingsPct}%
                </span>
              </div>

              <div className="text-xs space-y-1">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Misma estadía en OTA extranjera (~18% fee):</span>
                  <span className="line-through">
                    {formatMoneyDisplay(
                      pricing.estimatedAirbnbTotal,
                      paymentCurrency
                    )}
                  </span>
                </div>
                <div className="flex justify-between font-extrabold text-sm text-emerald-700 dark:text-emerald-400">
                  <span>Tu ahorro directo con el Anfitrión:</span>
                  <span>
                    {formatMoneyDisplay(
                      pricing.directSavingsAmount,
                      paymentCurrency
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Botón de Acción Principal */}
        <button
          type="submit"
          disabled={
            !isDateRangeValid || submitState.status === "submitting"
          }
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--brand-primary)] px-5 py-3.5 text-sm font-extrabold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 transition-colors cursor-pointer"
        >
          <span>
            {submitState.status === "submitting"
              ? "Validando disponibilidad y slots biométricos..."
              : pricing.isMidTerm
              ? "Iniciar Reserva de Media Estadía + Contrato CCyC"
              : "Iniciar Reserva Directa y Bloquear Fechas"}
          </span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>

        {/* Estado de Error */}
        {submitState.status === "error" && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-xs space-y-2"
          >
            <div className="flex items-center gap-1.5 font-extrabold text-red-800 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {submitState.errorCode === "BOOKING_OVERLAP_CONFLICT"
                  ? "Conflicto de Calendario (SQLSTATE 23P01 btree_gist)"
                  : submitState.errorCode === "UNAUTHORIZED"
                  ? "Inicio de Sesión Requerido"
                  : "No se pudo procesar la reserva"}
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
                Ir a /login para autenticarme y continuar →
              </a>
            )}
          </div>
        )}

        {/* Estado de Confirmación Exitosa: Reserva PENDING_PAYMENT + Slots Biométricos */}
        {submitState.status === "success" && submitState.result && (
          <div
            role="status"
            className="rounded-2xl border-2 border-emerald-600 bg-[var(--badge-consorcio-bg)] p-4 text-xs space-y-3"
          >
            <div className="flex items-center gap-2 font-extrabold text-[var(--badge-consorcio-text)] text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>
                ¡Reserva creada en estado{" "}
                <code>{submitState.result.booking.status}</code>!
              </span>
            </div>

            <p className="text-[var(--badge-consorcio-text)] leading-relaxed">
              El calendario de <strong>{propertyTitle}</strong> quedó bloqueado
              en PostgreSQL (<code>btree_gist</code>) del{" "}
              <strong>{submitState.result.booking.checkIn}</strong> al{" "}
              <strong>{submitState.result.booking.checkOut}</strong> (
              {submitState.result.booking.nightsCount} noches).
            </p>

            <div className="rounded-xl bg-[var(--bg-primary)] p-3 space-y-2 border border-emerald-600/30">
              <p className="font-extrabold text-[var(--text-primary)] flex items-center gap-1.5">
                <ShieldCheck
                  className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Slots Biométricos Generados (
                {submitState.result.guestVerifications.length} adultos en{" "}
                <code>public.guest_verifications</code>):
              </p>
              <ul className="space-y-1.5">
                {submitState.result.guestVerifications.map((slot, idx) => (
                  <li
                    key={slot.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1.5 font-mono text-[11px]"
                  >
                    <span>
                      {slot.isPrimaryGuest
                        ? `Adulto #1 (Titular)`
                        : `Adulto #${idx + 1} (Acompañante)`}
                    </span>
                    <a
                      href={slot.checkinPath}
                      className="truncate text-emerald-700 dark:text-emerald-400 font-bold underline hover:opacity-80"
                    >
                      Pre-Check-in ({slot.inviteToken.slice(0, 8)}…) →
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href={`/checkin/${submitState.result.booking.id}`}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-800"
              >
                <span>Ir al Flujo Móvil de Pre-Check-in Biométrico</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              {submitState.result.booking.paymentCurrency === "ARS" && (
                <a
                  href={`/checkout/${submitState.result.booking.id}?token=${submitState.result.guestVerifications[0]?.inviteToken ?? ""}`}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-800 px-3 py-2 text-xs font-extrabold text-white hover:bg-sky-900"
                >
                  <span>Pagar en pesos con Mercado Pago</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        )}
      </form>

      {/* Pie de Seguridad Zero-Trust Consorcial */}
      <div className="border-t border-[var(--border-subtle)] pt-3 text-[11px] text-[var(--text-secondary)] space-y-1.5">
        <p className="flex items-center gap-1.5 font-bold text-[var(--text-primary)]">
          <Lock
            className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
            aria-hidden="true"
          />
          Compuerta Criptográfica Zero-Trust Activa
        </p>
        <p>
          El PIN de cerradura electrónica está cifrado con{" "}
          <code>AES-256-GCM</code> y solo se revela cuando los{" "}
          <strong>{declaredAdultsCount} adultos declarados</strong> completen su
          Pre-Check-in Biométrico RENAPER.
        </p>
        {!authenticatedEmail && (
          <p className="text-[11px]">
            ¿Ya tenés cuenta?{" "}
            <a
              href="/login"
              className="underline font-bold text-[var(--brand-primary)]"
            >
              Iniciá sesión
            </a>{" "}
            antes de confirmar tu reserva.
          </p>
        )}
      </div>
    </aside>
  );
}

"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CreditCard, Lock } from "lucide-react";
import { AchievementBanner } from "@/components/ui/AchievementBanner";

export interface ArsCheckoutCardProps {
  bookingId: string;
  token?: string | null;
  status?: string;
  error?: string;
  formattedAmount: string;
  maxInstallments: number;
  payable: boolean;
  onStartMercadoPago: () => void | Promise<void>;
}

const STATUS_MESSAGES: Record<string, string> = {
  success:
    "¡Recibimos tu pago! Estamos terminando de confirmar tu reserva; actualizá la página en unos segundos.",
  pending: "Tu pago está en proceso de acreditación en Mercado Pago.",
  failure:
    "No se pudo completar el pago esta vez. Podés volver a intentarlo cuando quieras.",
};

/**
 * Checkout progresivo en Pesos (ARS) en 2 pasos:
 * Paso 1: Revisión serena del monto final y opciones de cuotas.
 * Paso 2: Confirmación e inicio seguro del pago en Mercado Pago.
 */
export function ArsCheckoutCard({
  bookingId,
  token,
  status,
  error,
  formattedAmount,
  maxInstallments,
  payable,
  onStartMercadoPago,
}: ArsCheckoutCardProps) {
  const [step, setStep] = useState<0 | 1>(0);

  return (
    <div className="space-y-6">
      {status === "success" && (
        <AchievementBanner
          icon="check"
          tone="emerald"
          title="¡Tu pago ya fue informado!"
          description={STATUS_MESSAGES.success!}
          action={{
            label: "Seguir a firmar tu acuerdo",
            href: `/contratos/${bookingId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
          }}
        />
      )}

      {status && status !== "success" && STATUS_MESSAGES[status] && (
        <p
          role="status"
          className="surface-card p-4 text-sm font-semibold text-[var(--text-primary)]"
        >
          {STATUS_MESSAGES[status]}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-sm font-bold text-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}

      {!payable ? (
        <section
          aria-labelledby="amount-heading"
          className="surface-card p-6 space-y-4"
        >
          <h2
            id="amount-heading"
            className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            Total de la operación
          </h2>
          <p
            className="text-4xl font-black text-[var(--text-primary)]"
            data-testid="ars-amount"
          >
            {formattedAmount}
          </p>
          <p className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Esta reserva ya no está esperando un pago en pesos en este momento.
            </span>
          </p>
        </section>
      ) : (
        <section
          aria-labelledby="amount-heading"
          className="surface-card p-6 sm:p-7 space-y-5"
        >
          {/* Barra segmentada en 2 pasos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-extrabold text-[var(--text-secondary)]">
              <span>Paso {step + 1} de 2</span>
              <span>
                {step === 0 ? "Revisar monto final" : "Pagar con Mercado Pago"}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={2}
              aria-valuenow={step + 1}
              aria-label="Progreso del pago en pesos"
              className="grid grid-cols-2 gap-1.5"
            >
              <div
                className={`h-1.5 rounded-full ${
                  step > 0 ? "bg-emerald-600" : "bg-[var(--brand-primary)]"
                }`}
              />
              <div
                className={`h-1.5 rounded-full ${
                  step === 1
                    ? "bg-[var(--brand-primary)]"
                    : "bg-[var(--border-subtle)]"
                }`}
              />
            </div>
          </div>

          {step === 0 ? (
            <div key="ars-step-0" className="animate-ibita-slide-next space-y-5">
              <div className="space-y-1.5">
                <h2
                  id="amount-heading"
                  className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
                >
                  1. Revisá tu total a abonar
                </h2>
                <p
                  className="text-4xl font-black text-[var(--text-primary)]"
                  data-testid="ars-amount"
                >
                  {formattedAmount}
                </p>
              </div>

              <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                Podés pagar con QR, MODO, dinero en cuenta o tarjeta en hasta{" "}
                <strong className="text-[var(--text-primary)]">
                  {maxInstallments} cuotas
                </strong>{" "}
                (sujetas a condiciones y costos del procesador de pagos Mercado
                Pago). La locación se celebra directamente entre Anfitrión y
                Huésped; I-bita provee la plataforma tecnológica.
              </p>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-primary-3d inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-extrabold"
              >
                <span>Todo listo, ir a confirmar pago</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div key="ars-step-1" className="animate-ibita-slide-next space-y-5">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 flex items-center justify-between gap-2">
                <span
                  id="amount-heading"
                  className="text-xs font-bold text-[var(--text-secondary)]"
                >
                  Total confirmado:
                </span>
                <span
                  className="text-lg sm:text-xl font-black text-[var(--text-primary)]"
                  data-testid="ars-amount"
                >
                  {formattedAmount}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                Al continuar se abre la ventana oficial y protegida de Mercado
                Pago. Apenas se acredite, volvemos al siguiente paso para
                confirmar tu identidad.
              </p>

              <form action={onStartMercadoPago} className="space-y-3">
                <button
                  type="submit"
                  className="btn-primary-3d inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-extrabold"
                >
                  <CreditCard className="h-5 w-5" aria-hidden="true" />
                  <span>Ir a pagar con Mercado Pago</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="btn-secondary-3d inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-xs font-extrabold"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Volver a revisar el monto</span>
                </button>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

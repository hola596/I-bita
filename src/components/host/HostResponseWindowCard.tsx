"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import {
  formatActiveDurationEsAr,
  formatDeadlineEsAr,
  type BookingHostResponseWindowSummary,
  type HostResponseMetrics,
} from "@/lib/host/response-schedule";

type HostResponseWindowCardProps =
  | {
      mode: "listing";
      hostName: string;
      metrics: HostResponseMetrics;
    }
  | {
      mode: "booking-status";
      bookingId: string;
      hostName: string;
      bookingStatus: string;
      windowSummary: BookingHostResponseWindowSummary;
    };

/**
 * Tarjeta reutilizable que comunica el intervalo confirmado de atención del anfitrión,
 * su plazo exacto en una reserva y la tasa de respuesta sincronizada con ese horario.
 */
export function HostResponseWindowCard(props: HostResponseWindowCardProps) {
  if (props.mode === "listing") {
    const { hostName, metrics } = props;
    const nextOpenLabel = metrics.nextOpenAtIso
      ? formatDeadlineEsAr(metrics.nextOpenAtIso).replace(
          /^hoy antes de las /,
          "hoy desde las "
        ).replace(/^mañana antes de las /, "mañana desde las ")
      : null;

    return (
      <section
        aria-label="Horario y tasa de respuesta del anfitrión"
        className="surface-card p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-extrabold border ${
                  metrics.isCurrentlyWithinSchedule
                    ? "badge-consorcio-friendly"
                    : "border-amber-500/40 bg-amber-500/12 text-amber-900 dark:text-amber-300"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full ${
                    metrics.isCurrentlyWithinSchedule
                      ? "bg-emerald-600 dark:bg-emerald-400"
                      : "bg-amber-500"
                  }`}
                />
                {metrics.isCurrentlyWithinSchedule
                  ? "En horario de respuesta ahora"
                  : "Fuera de horario ahora (reloj pausado)"}
              </span>

              {metrics.responseRatePct !== null ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-0.5 text-xs font-extrabold text-[var(--text-primary)]">
                  Tasa de respuesta sincronizada: {metrics.responseRatePct}%
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                  Compromiso horario verificado
                </span>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] pt-1">
              Confirmación e ingreso coordinados con {hostName}
            </h2>
          </div>

          {metrics.avgActiveResponseMinutes !== null && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-right">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                Demora promedio
              </span>
              <span className="text-sm font-black text-[var(--text-primary)]">
                {formatActiveDurationEsAr(metrics.avgActiveResponseMinutes)}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 space-y-1">
            <p className="flex items-center gap-1.5 font-extrabold text-[var(--text-primary)]">
              <Clock
                className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                aria-hidden="true"
              />
              Intervalo confirmado del anfitrión
            </p>
            <p className="font-bold text-[var(--text-primary)]">
              {metrics.scheduleSummary}
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Horario Argentina (GMT-3)
              {nextOpenLabel ? ` · Retoma atención ${nextOpenLabel.replace("antes de las ", "")}` : ""}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 space-y-1">
            <p className="flex items-center gap-1.5 font-extrabold text-[var(--text-primary)]">
              <MessageSquare
                className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              Qué sucede después de reservar
            </p>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Al abonar y validar tu DNI recibís automáticamente este plazo
              dentro de{" "}
              <strong className="text-[var(--text-primary)]">
                tu cuenta en I-bita
              </strong>{" "}
              para recibir confirmación e instrucciones de ingreso.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const { bookingId, hostName, windowSummary } = props;
  const hasHostResponded = Boolean(windowSummary.respondedAtIso);

  return (
    <section
      aria-label="Ventana de respuesta del anfitrión para esta reserva"
      className="surface-card p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {hasHostResponded ? (
              <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-extrabold">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                El anfitrión ya respondió en Mensajes
                {windowSummary.respondedOnTime ? " · En horario ✓" : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/12 px-3 py-0.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Esperando confirmación / instrucciones
              </span>
            )}

            {windowSummary.responseRatePct !== null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-0.5 text-xs font-extrabold">
                <ShieldCheck
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Tasa sincronizada: {windowSummary.responseRatePct}%
              </span>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] pt-1">
            {hasHostResponded
              ? `${hostName} ya se comunicó por tu reserva`
              : `Tu mensaje de ${hostName} llega ${windowSummary.dueAtLabelEsAr}`}
          </h2>
        </div>

        <Link
          href={`/mensajes?booking=${bookingId}`}
          className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold whitespace-nowrap"
        >
          <MessageSquare
            className="h-3.5 w-3.5 text-[var(--brand-primary)]"
            aria-hidden="true"
          />
          <span>Ver mensajes e instrucciones</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 text-xs text-[var(--text-secondary)] leading-relaxed">
        <strong className="text-[var(--text-primary)]">
          Horario confirmado del anfitrión:
        </strong>{" "}
        {windowSummary.scheduleSummary} (hora Argentina).{" "}
        {hasHostResponded
          ? "Revisá el chat interno de I-bita para ver la confirmación y los detalles de acceso."
          : "Una vez completados tu pago y validación de identidad, el anfitrión te confirma y envía las instrucciones de llegada dentro de esa ventana."}
      </p>
    </section>
  );
}

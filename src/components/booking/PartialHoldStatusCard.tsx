"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import {
  formatHoldRemainingLabel,
  isBookingPaid,
  resolveBookingConfirmationPhase,
} from "@/lib/bookings/partial-hold";

export interface PartialHoldStatusCardProps {
  propertySlug?: string | null;
  status: string;
  holdExpiresAt?: string | null;
  hostConfirmedAt?: string | null;
  checkIn?: string;
  checkOut?: string;
  nightsCount?: number;
  compact?: boolean;
}

/**
 * Muestra la reserva parcial de 1 hora (con cuenta regresiva en vivo)
 * y el progreso de doble llave: pago confirmado + confirmación del anfitrión.
 */
export function PartialHoldStatusCard({
  propertySlug,
  status,
  holdExpiresAt,
  hostConfirmedAt,
  checkIn,
  checkOut,
  nightsCount,
  compact = false,
}: PartialHoldStatusCardProps) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    if (status !== "PENDING_PAYMENT" || !holdExpiresAt) {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, holdExpiresAt]);

  const nowDate = nowMs !== null ? new Date(nowMs) : undefined;
  const phase = resolveBookingConfirmationPhase(
    { status, holdExpiresAt, hostConfirmedAt },
    nowDate
  );

  const paid = isBookingPaid(status);
  const hostConfirmed = Boolean(hostConfirmedAt);
  const countdown = holdExpiresAt
    ? formatHoldRemainingLabel(holdExpiresAt, nowDate)
    : null;

  if (phase === "EXPIRED") {
    return (
      <section
        role="alert"
        className={`rounded-2xl border-2 border-amber-600/50 bg-amber-500/12 ${
          compact ? "p-3.5 space-y-2.5" : "p-5 space-y-3"
        } text-xs`}
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="h-4 w-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-extrabold text-amber-950 dark:text-amber-200">
              Tu reserva parcial de 1 hora venció
            </p>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Como no se acreditó el pago dentro de los 60 minutos, las fechas
              {checkIn && checkOut ? ` (${checkIn} → ${checkOut})` : ""} volvieron
              a quedar disponibles en el calendario para evitar bloqueos ociosos.
            </p>
          </div>
        </div>
        {propertySlug && (
          <Link
            href={`/p/${propertySlug}`}
            className="btn-primary-3d inline-flex min-h-[40px] items-center justify-center rounded-xl px-4 text-xs font-extrabold"
          >
            Elegir fechas disponibles en el calendario →
          </Link>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="Estado de reserva parcial y doble confirmación"
      className={`rounded-2xl border ${
        phase === "CONFIRMED"
          ? "border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/45"
          : "border-amber-500/40 bg-amber-500/8"
      } ${compact ? "p-3.5 space-y-2.5" : "surface-card p-5 space-y-3.5"} text-xs`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {phase === "CONFIRMED" ? (
            <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 font-extrabold">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Reserva confirmada por ambas partes
            </span>
          ) : phase === "PAID_AWAITING_HOST" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/45 bg-amber-500/15 px-3 py-0.5 font-extrabold text-amber-950 dark:text-amber-200">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Reserva parcial · Falta confirmación del anfitrión
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/45 bg-amber-500/15 px-3 py-0.5 font-extrabold text-amber-950 dark:text-amber-200">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Reserva parcial confirmada por 1 hora
            </span>
          )}
        </div>

        {phase === "PARTIAL_HOLD" && countdown && (
          <span className="rounded-full bg-[var(--bg-primary)] border border-amber-500/45 px-2.5 py-0.5 font-mono font-black text-[11px] text-amber-950 dark:text-amber-200">
            {nowMs !== null ? `Vence en ${countdown.mmss}` : `Hasta ${countdown.expiresAtClockEsAr} hs`}
          </span>
        )}
      </div>

      <p className="text-[var(--text-secondary)] leading-relaxed">
        {phase === "CONFIRMED"
          ? `Tu estadía${checkIn && checkOut ? ` (${checkIn} → ${checkOut}${nightsCount ? `, ${nightsCount} noches` : ""})` : ""} cuenta con pago acreditado y confirmación del anfitrión.`
          : phase === "PAID_AWAITING_HOST"
            ? "Tu pago ya está acreditado y protegido. Las fechas siguen apartadas como reserva parcial hasta que el anfitrión confirme la estadía dentro de I-bita."
            : `Apartamos estas fechas de forma parcial por 1 hora${countdown ? ` (hasta las ${countdown.expiresAtClockEsAr} hs Argentina)` : ""}. La reserva queda definitiva cuando se confirme el pago y el anfitrión confirme la estadía.`}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2">
          {paid ? (
            <CheckCircle2
              className="h-4 w-4 text-emerald-600 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <Clock
              className="h-4 w-4 text-amber-600 shrink-0"
              aria-hidden="true"
            />
          )}
          <div>
            <p className="font-extrabold text-[var(--text-primary)]">
              1. Pago confirmado
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {paid ? "Acreditado ✓" : "Pendiente · tenés 1 hora"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2">
          {hostConfirmed ? (
            <CheckCircle2
              className="h-4 w-4 text-emerald-600 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <Clock
              className="h-4 w-4 text-amber-600 shrink-0"
              aria-hidden="true"
            />
          )}
          <div>
            <p className="font-extrabold text-[var(--text-primary)]">
              2. Confirmación del anfitrión
            </p>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {hostConfirmed
                ? "Confirmada ✓"
                : "Pendiente dentro de I-bita"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

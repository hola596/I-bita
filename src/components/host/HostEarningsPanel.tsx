"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import type {
  HostEarningBookingItem,
  HostEarningsSummary,
} from "@/lib/math/host-earnings";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface HostEarningsPanelProps {
  earnings: HostEarningsSummary;
  payoutSplitArsPct: number;
  variant?: "profile" | "dashboard";
}

type ReleaseFilter = "ALL" | "PENDING_RELEASE" | "AVAILABLE";

function formatMoney(amount: string, currency: "ARS" | "USDT"): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) return currency === "USDT" ? "0 USDT" : "$ 0 ARS";
  if (currency === "USDT") {
    return `${num.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDT`;
  }
  return `$ ${num.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ARS`;
}

function formatDateTimeAr(iso: string): string {
  try {
    const dt = new Date(iso);
    const dateStr = dt.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Argentina/Buenos_Aires",
    });
    const timeStr = dt.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    });
    return `${dateStr} · ${timeStr} hs`;
  } catch {
    return iso;
  }
}

function formatYmdAr(ymd: string): string {
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatCountdown(hours: number): string {
  if (hours <= 0) return "Liberación inminente";
  if (hours < 24) {
    return `en ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0) {
    return `en ${days} ${days === 1 ? "día" : "días"}`;
  }
  return `en ${days} ${days === 1 ? "día" : "días"} y ${remHours} hs`;
}

function formatNativeBreakdown(ars: string, usdt: string): string | null {
  const arsNum = Number(ars);
  const usdtNum = Number(usdt);
  if (arsNum > 0 && usdtNum > 0) {
    return `Original: ${formatMoney(ars, "ARS")} + ${formatMoney(usdt, "USDT")}`;
  }
  return null;
}

export function HostEarningsPanel({
  earnings,
  payoutSplitArsPct,
  variant = "profile",
}: HostEarningsPanelProps) {
  const { currency } = usePreferences();
  const [filter, setFilter] = useState<ReleaseFilter>("ALL");

  const usdtPct = Math.max(0, 100 - payoutSplitArsPct);

  const visibleItems = useMemo(() => {
    if (filter === "PENDING_RELEASE") {
      return earnings.items.filter(
        (item) => item.releaseState === "PENDING_RELEASE"
      );
    }
    if (filter === "AVAILABLE") {
      return earnings.items.filter(
        (item) => item.releaseState !== "PENDING_RELEASE"
      );
    }
    return earnings.items;
  }, [earnings.items, filter]);

  const generatedDisplay =
    currency === "ARS"
      ? formatMoney(earnings.generatedTotalArs, "ARS")
      : formatMoney(earnings.generatedTotalUsdt, "USDT");
  const availableDisplay =
    currency === "ARS"
      ? formatMoney(earnings.availableTotalArs, "ARS")
      : formatMoney(earnings.availableTotalUsdt, "USDT");
  const pendingDisplay =
    currency === "ARS"
      ? formatMoney(earnings.pendingReleaseTotalArs, "ARS")
      : formatMoney(earnings.pendingReleaseTotalUsdt, "USDT");

  const generatedBreakdown = formatNativeBreakdown(
    earnings.generatedArs,
    earnings.generatedUsdt
  );
  const availableBreakdown = formatNativeBreakdown(
    earnings.availableArs,
    earnings.availableUsdt
  );
  const pendingBreakdown = formatNativeBreakdown(
    earnings.pendingReleaseArs,
    earnings.pendingReleaseUsdt
  );

  return (
    <section
      aria-labelledby="host-earnings-heading"
      className="surface-card p-6 sm:p-8 space-y-6"
    >
      {/* Cabecera clara */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
        <div className="flex items-start gap-3.5">
          <Icon3D name="coin" size="lg" />
          <div className="space-y-1">
            <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-extrabold">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Liberación {earnings.releaseDelayHours} hs post check-in
            </span>
            <h2
              id="host-earnings-heading"
              className="text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]"
            >
              Ingresos y liberaciones
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              Cada estadía confirmada pasa de <strong>Ingresos a liberar</strong>{" "}
              a <strong>Ingresos disponibles</strong> exactamente{" "}
              <strong>{earnings.releaseDelayHours} hs</strong> después de la
              llegada del inquilino al hospedaje.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-1.5 text-xs font-extrabold text-[var(--text-primary)] whitespace-nowrap">
            Reparto: {payoutSplitArsPct}% ARS · {usdtPct}% USDT
          </span>
          {variant === "dashboard" && (
            <Link
              href="/onboarding/anfitrion?editar=1"
              className="btn-secondary-3d inline-flex min-h-[38px] items-center rounded-xl px-3.5 text-xs font-extrabold whitespace-nowrap"
            >
              Editar datos de cobro
            </Link>
          )}
        </div>
      </div>

      {/* 3 Bloques principales de ingresos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Ingresos generados */}
        <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/75 p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
              Ingresos generados
            </span>
            <TrendingUp
              className="h-4 w-4 text-[var(--brand-primary)] shrink-0"
              aria-hidden="true"
            />
          </div>
          <p className="text-2xl font-black tracking-tight text-[var(--text-primary)] whitespace-nowrap">
            {generatedDisplay}
          </p>
          <p className="text-xs font-semibold text-[var(--text-secondary)]">
            {earnings.qualifyingBookingsCount}{" "}
            {earnings.qualifyingBookingsCount === 1
              ? "estadía confirmada en total"
              : "estadías confirmadas en total"}
          </p>
          {generatedBreakdown && (
            <p className="text-[11px] font-bold text-[var(--text-secondary)]">
              {generatedBreakdown}
            </p>
          )}
        </article>

        {/* 2. Ingresos disponibles */}
        <article className="rounded-2xl border border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/55 p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--badge-consorcio-text)]">
              Ingresos disponibles
            </span>
            <CheckCircle2
              className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0"
              aria-hidden="true"
            />
          </div>
          <p className="text-2xl font-black tracking-tight text-[var(--badge-consorcio-text)] whitespace-nowrap">
            {availableDisplay}
          </p>
          <p className="text-xs font-bold text-[var(--badge-consorcio-text)]/90">
            {earnings.availableBookingsCount}{" "}
            {earnings.availableBookingsCount === 1
              ? "estadía liberada y lista para cobrar"
              : "estadías liberadas y listas para cobrar"}
          </p>
          {availableBreakdown && (
            <p className="text-[11px] font-bold text-[var(--badge-consorcio-text)]/85">
              {availableBreakdown}
            </p>
          )}
        </article>

        {/* 3. Ingresos a liberar + fecha de liberación */}
        <article className="rounded-2xl border border-amber-500/45 bg-amber-500/10 p-5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300">
              Ingresos a liberar
            </span>
            <Clock
              className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0"
              aria-hidden="true"
            />
          </div>
          <p className="text-2xl font-black tracking-tight text-amber-950 dark:text-amber-200 whitespace-nowrap">
            {pendingDisplay}
          </p>
          {earnings.nextReleaseAtIso ? (
            <p className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Próxima liberación:{" "}
                {formatDateTimeAr(earnings.nextReleaseAtIso)}
              </span>
            </p>
          ) : (
            <p className="text-xs font-semibold text-amber-900/80 dark:text-amber-300/80">
              0 estadías esperando cumplimiento
            </p>
          )}
          {pendingBreakdown && (
            <p className="text-[11px] font-bold text-amber-900/85 dark:text-amber-300/85">
              {pendingBreakdown}
            </p>
          )}
        </article>
      </div>

      {/* Cronograma detallado de estadías y fechas de liberación */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
              Detalle de liberaciones por estadía ({earnings.items.length})
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Seguí la fecha exacta en que se acredita cada estadía (check-in
              15:00 hs + 48 hs).
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Filtrar liberaciones de ingresos"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5"
          >
            {(
              [
                { key: "ALL", label: `Todas (${earnings.items.length})` },
                {
                  key: "PENDING_RELEASE",
                  label: `A liberar (${earnings.pendingReleaseBookingsCount})`,
                },
                {
                  key: "AVAILABLE",
                  label: `Disponibles (${earnings.availableBookingsCount})`,
                },
              ] as const
            ).map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.key)}
                  className={`min-h-[36px] shrink-0 rounded-full px-3.5 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {earnings.items.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Coins
                className="h-5 w-5 text-[var(--brand-primary)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="text-sm font-extrabold text-[var(--text-primary)]">
                  Todavía no tenés estadías pagadas para liberar
                </p>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Así funciona el ciclo automático de tus ingresos en I-bita:
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 space-y-1">
                <span className="font-black text-[var(--brand-primary)]">
                  1. Reserva abonada
                </span>
                <p className="text-[var(--text-secondary)]">
                  Cuando el huésped paga en ARS o USDT, el neto de tu estadía
                  figura en <strong>Ingresos a liberar</strong>.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 space-y-1">
                <span className="font-black text-amber-800 dark:text-amber-300">
                  2. Llegada + 48 hs
                </span>
                <p className="text-[var(--text-secondary)]">
                  Desde la fecha de llegada (check-in) corren{" "}
                  <strong>48 hs de resguardo</strong> para garantizar un ingreso
                  sin inconvenientes.
                </p>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 space-y-1">
                <span className="font-black text-emerald-700 dark:text-emerald-400">
                  3. Disponible en tu cuenta
                </span>
                <p className="text-[var(--text-secondary)]">
                  Cumplidas las 48 hs post check-in, pasa directo a{" "}
                  <strong>Ingresos disponibles</strong> según tu reparto ARS /
                  USDT.
                </p>
              </div>
            </div>

            {earnings.unpaidPendingBookingsCount > 0 && (
              <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs font-bold text-amber-900 dark:text-amber-300">
                Tenés {earnings.unpaidPendingBookingsCount}{" "}
                {earnings.unpaidPendingBookingsCount === 1
                  ? "solicitud en curso (esperando entrevista o pago)"
                  : "solicitudes en curso (esperando entrevista o pago)"}
                : se sumarán a &ldquo;A liberar&rdquo; en cuanto el huésped
                complete el pago.
              </p>
            )}
          </div>
        ) : visibleItems.length === 0 ? (
          <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 p-4 text-xs font-semibold text-[var(--text-secondary)]">
            No hay estadías en esta categoría con el filtro actual.
          </p>
        ) : (
          <ul className="space-y-3">
            {visibleItems.map((item: HostEarningBookingItem) => {
              const isPending = item.releaseState === "PENDING_RELEASE";
              const isSettled = item.releaseState === "SETTLED";
              const nativeFormatted = formatMoney(
                item.hostNetAmount,
                item.nativeCurrency
              );
              const altFormatted =
                currency !== item.nativeCurrency
                  ? formatMoney(
                      currency === "ARS"
                        ? item.convertedArsAmount
                        : item.convertedUsdtAmount,
                      currency
                    )
                  : null;

              return (
                <li
                  key={item.bookingId}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 dark:text-amber-300">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          A liberar
                        </span>
                      ) : (
                        <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          {isSettled ? "Liquidado" : "Disponible"}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-primary)]">
                        <CalendarClock
                          className="h-3 w-3 text-[var(--brand-primary)]"
                          aria-hidden="true"
                        />
                        {isPending ? (
                          <span>
                            Libera el {formatDateTimeAr(item.releaseAtIso)} (
                            {formatCountdown(item.hoursUntilRelease)})
                          </span>
                        ) : (
                          <span>
                            Liberado el {formatDateTimeAr(item.releaseAtIso)}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-extrabold text-[var(--text-primary)]">
                      <Link
                        href={`/p/${item.propertySlug}`}
                        className="hover:text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1 truncate"
                      >
                        <span className="truncate">{item.propertyTitle}</span>
                        <ExternalLink
                          className="h-3 w-3 shrink-0 opacity-70"
                          aria-hidden="true"
                        />
                      </Link>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">
                        · Huésped: {item.guestDisplayName}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)]">
                      Estadía: {formatYmdAr(item.checkIn)} →{" "}
                      {formatYmdAr(item.checkOut)} ({item.nightsCount}{" "}
                      {item.nightsCount === 1 ? "noche" : "noches"}) · Llegada:{" "}
                      {formatDateTimeAr(item.arrivalAtIso)} (+48 hs)
                    </p>
                  </div>

                  <div className="flex sm:flex-col items-baseline sm:items-end justify-between gap-1 shrink-0 border-t sm:border-t-0 border-[var(--border-subtle)] pt-2 sm:pt-0">
                    <span className="text-base sm:text-lg font-black text-[var(--text-primary)] whitespace-nowrap">
                      {nativeFormatted}
                    </span>
                    {altFormatted && (
                      <span className="text-[11px] font-bold text-[var(--text-secondary)] whitespace-nowrap">
                        ≈ {altFormatted}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

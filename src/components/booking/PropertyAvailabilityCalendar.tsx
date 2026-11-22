"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import {
  WEEKDAY_HEADERS_ES_AR,
  buildMonthGrid,
  calculateNightsBetweenYmd,
  findFirstAvailableWindow,
  formatLongAriaDateEsAr,
  formatShortEsArDate,
  getInitialCalendarMonth,
  hasRangeConflict,
  parseYmd,
  shiftMonth,
  type CalendarDayCell,
} from "@/lib/calendar/availability";
import type { OccupiedDateRange } from "@/modules/properties/queries";
import { formatHoldRemainingLabel } from "@/lib/bookings/partial-hold";
import { usePropertyDateSelection } from "./PropertyDateSelectionContext";

export interface PropertyAvailabilityCalendarProps {
  occupiedRanges: OccupiedDateRange[];
  todayYmd: string;
  variant?: "full" | "compact";
  readOnly?: boolean;
  selectedCheckIn?: string;
  selectedCheckOut?: string;
  onSelectRange?: (nextCheckIn: string, nextOut: string) => void;
}

/**
 * Calendario visual mensual de disponibilidad (lunes a domingo) que comunica con claridad
 * fechas libres, reservas parciales (1 h), fechas confirmadas no disponibles y bloqueos externos.
 */
export function PropertyAvailabilityCalendar({
  occupiedRanges,
  todayYmd,
  variant = "full",
  readOnly = false,
  selectedCheckIn,
  selectedCheckOut,
  onSelectRange,
}: PropertyAvailabilityCalendarProps) {
  const dateContext = usePropertyDateSelection();

  const effectiveOccupiedRanges =
    readOnly || !dateContext ? occupiedRanges : dateContext.occupiedRanges;
  const effectiveCheckIn = readOnly
    ? ""
    : selectedCheckIn ?? dateContext?.checkIn ?? "";
  const effectiveCheckOut = readOnly
    ? ""
    : selectedCheckOut ?? dateContext?.checkOut ?? "";

  const initialWindow = useMemo(
    () => findFirstAvailableWindow(effectiveOccupiedRanges, todayYmd, 5),
    [effectiveOccupiedRanges, todayYmd]
  );

  const todayParsed = useMemo(() => parseYmd(todayYmd), [todayYmd]);
  const initialMonth = useMemo(
    () =>
      getInitialCalendarMonth(
        todayYmd,
        initialWindow.checkIn,
        effectiveOccupiedRanges
      ),
    [todayYmd, initialWindow.checkIn, effectiveOccupiedRanges]
  );

  const [cursorMonth, setCursorMonth] = useState<{
    year: number;
    month: number;
  }>(initialMonth);
  const [draftCheckIn, setDraftCheckIn] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const hasIcalBlocks = useMemo(
    () => effectiveOccupiedRanges.some((r) => r.status === "ICAL_BLOCK"),
    [effectiveOccupiedRanges]
  );

  const visibleMonthCount = variant === "compact" ? 1 : 2;

  const monthGrids = useMemo(() => {
    return Array.from({ length: visibleMonthCount }, (_, idx) => {
      const target = shiftMonth(cursorMonth.year, cursorMonth.month, idx);
      return buildMonthGrid(
        target.year,
        target.month,
        effectiveOccupiedRanges,
        todayYmd
      );
    });
  }, [cursorMonth, visibleMonthCount, effectiveOccupiedRanges, todayYmd]);

  const monthsOffsetFromToday =
    (cursorMonth.year - todayParsed.year) * 12 +
    (cursorMonth.month - todayParsed.month);
  const canGoPrevMonth = monthsOffsetFromToday > 0;
  const canGoNextMonth = monthsOffsetFromToday < 24;

  const firstAvailableParsed = useMemo(
    () => parseYmd(initialWindow.checkIn),
    [initialWindow.checkIn]
  );
  const isViewingFirstAvailableMonth =
    cursorMonth.year === firstAvailableParsed.year &&
    cursorMonth.month === firstAvailableParsed.month;

  const activeNights = useMemo(() => {
    if (!effectiveCheckIn || !effectiveCheckOut) return 0;
    return calculateNightsBetweenYmd(effectiveCheckIn, effectiveCheckOut);
  }, [effectiveCheckIn, effectiveCheckOut]);

  function commitRange(nextIn: string, nextOut: string) {
    if (onSelectRange) {
      onSelectRange(nextIn, nextOut);
    } else if (dateContext) {
      dateContext.setDateRange(nextIn, nextOut);
    }
  }

  function isCheckoutOnlyBoundary(cell: CalendarDayCell): boolean {
    if (readOnly || !draftCheckIn || cell.ymd <= draftCheckIn) return false;
    if (
      cell.status !== "BOOKED" &&
      cell.status !== "PARTIAL_HOLD" &&
      cell.status !== "ICAL_BLOCK"
    ) {
      return false;
    }
    return !hasRangeConflict(draftCheckIn, cell.ymd, effectiveOccupiedRanges);
  }

  function handleDayClick(cell: CalendarDayCell) {
    if (readOnly) return;
    const allowAsCheckoutBoundary = isCheckoutOnlyBoundary(cell);
    const isSelectable =
      cell.status === "AVAILABLE" || allowAsCheckoutBoundary;
    if (!isSelectable) return;

    setRangeError(null);

    if (!draftCheckIn) {
      if (cell.status !== "AVAILABLE") return;
      setDraftCheckIn(cell.ymd);
      return;
    }

    if (cell.ymd === draftCheckIn) {
      setDraftCheckIn(null);
      return;
    }

    if (cell.ymd < draftCheckIn) {
      if (cell.status === "AVAILABLE") {
        setDraftCheckIn(cell.ymd);
      }
      return;
    }

    const nights = calculateNightsBetweenYmd(draftCheckIn, cell.ymd);
    const conflict = hasRangeConflict(
      draftCheckIn,
      cell.ymd,
      effectiveOccupiedRanges
    );

    if (conflict) {
      setRangeError(
        `Las fechas elegidas se cruzan con un período ocupado (${formatShortEsArDate(conflict.checkIn)} → ${formatShortEsArDate(conflict.checkOut)}). Elegí una salida anterior o tocá otro día libre.`
      );
      return;
    }

    if (nights > 180) {
      setRangeError(
        "El máximo permitido por reserva temporaria es de 180 noches (6 meses)."
      );
      return;
    }

    if (nights >= 1) {
      commitRange(draftCheckIn, cell.ymd);
      setDraftCheckIn(null);
    }
  }

  return (
    <div className={variant === "compact" ? "space-y-3" : "space-y-4"}>
      {/* Controles de navegación mensual */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              canGoPrevMonth &&
              setCursorMonth((prev) => shiftMonth(prev.year, prev.month, -1))
            }
            disabled={!canGoPrevMonth}
            aria-label="Mes anterior"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--brand-primary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() =>
              canGoNextMonth &&
              setCursorMonth((prev) => shiftMonth(prev.year, prev.month, 1))
            }
            disabled={!canGoNextMonth}
            aria-label="Mes siguiente"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--brand-primary)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() =>
              setCursorMonth({
                year: todayParsed.year,
                month: todayParsed.month,
              })
            }
            disabled={monthsOffsetFromToday === 0}
            className="inline-flex min-h-[36px] items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--brand-primary)] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed transition-colors"
          >
            Hoy
          </button>

          {!isViewingFirstAvailableMonth && (
            <button
              type="button"
              onClick={() =>
                setCursorMonth({
                  year: firstAvailableParsed.year,
                  month: firstAvailableParsed.month,
                })
              }
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-emerald-600/40 bg-[var(--badge-consorcio-bg)] px-3 text-xs font-extrabold text-[var(--badge-consorcio-text)] hover:brightness-95 cursor-pointer transition-all"
            >
              <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Próximo libre</span>
            </button>
          )}
        </div>

        <span className="text-[11px] font-bold text-[var(--text-secondary)]">
          Próxima disponibilidad desde{" "}
          <strong className="text-[var(--text-primary)]">
            {formatShortEsArDate(initialWindow.checkIn)}
          </strong>
        </span>
      </div>

      {/* Estado de selección interactiva */}
      {!readOnly && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-xs"
        >
          {draftCheckIn ? (
            <>
              <span className="font-bold text-[var(--text-primary)]">
                Elegiste llegada el{" "}
                <strong className="text-[var(--brand-primary)]">
                  {formatShortEsArDate(draftCheckIn)}
                </strong>
                . Ahora tocá tu fecha de salida.
              </span>
              <button
                type="button"
                onClick={() => {
                  setDraftCheckIn(null);
                  setRangeError(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Cancelar
              </button>
            </>
          ) : activeNights > 0 ? (
            <span className="font-bold text-[var(--text-primary)]">
              Tu estadía:{" "}
              <strong className="text-[var(--brand-primary)]">
                {formatShortEsArDate(effectiveCheckIn)} →{" "}
                {formatShortEsArDate(effectiveCheckOut)}
              </strong>{" "}
              <span className="text-[var(--text-secondary)]">
                ({activeNights} {activeNights === 1 ? "noche" : "noches"})
              </span>
            </span>
          ) : (
            <span className="font-semibold text-[var(--text-secondary)]">
              Tocá un día libre para elegir tu llegada y salida.
            </span>
          )}
        </div>
      )}

      {rangeError && (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/45 bg-amber-500/12 px-3.5 py-2.5 text-xs font-bold text-amber-900 dark:text-amber-200"
        >
          {rangeError}
        </p>
      )}

      {/* Grillas mensuales */}
      <div
        className={
          visibleMonthCount === 2
            ? "grid grid-cols-1 sm:grid-cols-2 gap-4"
            : "grid grid-cols-1 gap-3"
        }
      >
        {monthGrids.map((grid) => {
          const isCurrentFull =
            grid.availableCount === 0 && grid.unavailableCount > 0;

          return (
            <section
              key={`${grid.year}-${grid.month}`}
              aria-label={`Disponibilidad de ${grid.label}`}
              className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 sm:p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                  {grid.label}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                    isCurrentFull
                      ? "bg-rose-500/12 text-rose-800 dark:text-rose-300 border border-rose-500/25"
                      : "bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border border-emerald-600/25"
                  }`}
                >
                  {grid.availableCount}{" "}
                  {grid.availableCount === 1 ? "libre" : "libres"} ·{" "}
                  {grid.unavailableCount}{" "}
                  {grid.unavailableCount === 1 ? "no disponible" : "no disponibles"}
                  {grid.partialHoldCount > 0
                    ? ` (${grid.partialHoldCount} ${
                        grid.partialHoldCount === 1 ? "parcial" : "parciales"
                      })`
                    : ""}
                </span>
              </div>

              <div
                role="grid"
                aria-label={grid.label}
                className="grid grid-cols-7 gap-1"
              >
                {WEEKDAY_HEADERS_ES_AR.map((dayLabel) => (
                  <div
                    key={dayLabel}
                    className="pb-1 text-center text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-secondary)]"
                  >
                    {dayLabel}
                  </div>
                ))}

                {Array.from({ length: grid.leadingEmptySlots }).map((_, idx) => (
                  <div key={`empty-${idx}`} aria-hidden="true" />
                ))}

                {grid.days.map((cell) => {
                  const allowCheckoutBoundary = isCheckoutOnlyBoundary(cell);
                  const isDraftStart = draftCheckIn === cell.ymd;
                  const isRangeStart =
                    !draftCheckIn && effectiveCheckIn === cell.ymd;
                  const isRangeEnd =
                    !draftCheckIn && effectiveCheckOut === cell.ymd;
                  const isInSelectedRange =
                    !draftCheckIn &&
                    Boolean(effectiveCheckIn && effectiveCheckOut) &&
                    cell.ymd > effectiveCheckIn &&
                    cell.ymd < effectiveCheckOut &&
                    cell.status === "AVAILABLE";

                  const isEndpoint =
                    !readOnly && (isDraftStart || isRangeStart || isRangeEnd);
                  const isInteractive =
                    !readOnly &&
                    (cell.status === "AVAILABLE" || allowCheckoutBoundary);

                  const partialHoldClock =
                    cell.status === "PARTIAL_HOLD" &&
                    cell.matchingRange?.status === "PENDING_PAYMENT" &&
                    cell.matchingRange.holdExpiresAt
                      ? formatHoldRemainingLabel(
                          cell.matchingRange.holdExpiresAt
                        ).expiresAtClockEsAr
                      : null;

                  const partialHoldLabel = partialHoldClock
                    ? `Reserva parcial (1 h) · Vence a las ${partialHoldClock} · Falta pago y confirmación del anfitrión`
                    : "Reserva parcial · Pendiente de pago y confirmación del anfitrión";

                  let cellClasses =
                    "relative flex min-h-[38px] sm:min-h-[40px] flex-col items-center justify-center rounded-xl text-xs transition-all select-none ";

                  if (isEndpoint) {
                    cellClasses +=
                      "bg-[var(--brand-primary)] text-white font-black shadow-xs ring-2 ring-[var(--brand-primary)]/30 cursor-pointer";
                  } else if (isInSelectedRange) {
                    cellClasses +=
                      "bg-[var(--surface-tint)] text-[var(--brand-primary)] font-extrabold border border-[var(--brand-primary)]/35 cursor-pointer hover:brightness-95";
                  } else if (allowCheckoutBoundary) {
                    cellClasses +=
                      "bg-emerald-500/12 text-[var(--text-primary)] font-extrabold border border-dashed border-emerald-600/60 hover:border-[var(--brand-primary)] cursor-pointer";
                  } else if (cell.status === "AVAILABLE") {
                    cellClasses += `bg-[var(--bg-primary)] text-[var(--text-primary)] border border-emerald-600/35 font-bold ${
                      readOnly
                        ? "cursor-default"
                        : "hover:border-[var(--brand-primary)] hover:bg-[var(--surface-tint)]/60 cursor-pointer"
                    }`;
                  } else if (cell.status === "PARTIAL_HOLD") {
                    cellClasses +=
                      "bg-amber-500/15 dark:bg-amber-500/20 text-amber-950 dark:text-amber-200 border border-dashed border-amber-500/55 font-bold cursor-not-allowed";
                  } else if (cell.status === "BOOKED") {
                    cellClasses +=
                      "bg-rose-500/12 dark:bg-rose-500/20 text-rose-800/85 dark:text-rose-300/85 border border-rose-500/30 line-through decoration-2 font-semibold cursor-not-allowed";
                  } else if (cell.status === "ICAL_BLOCK") {
                    cellClasses +=
                      "bg-slate-500/15 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border border-slate-500/35 line-through decoration-2 font-semibold cursor-not-allowed";
                  } else {
                    cellClasses +=
                      "text-[var(--text-secondary)]/40 border border-transparent cursor-not-allowed";
                  }

                  const statusDescription = isDraftStart
                    ? "Llegada elegida"
                    : isRangeStart
                      ? "Tu llegada seleccionada"
                      : isRangeEnd
                        ? "Tu salida seleccionada"
                        : isInSelectedRange
                          ? "Incluido en tu estadía"
                          : allowCheckoutBoundary
                            ? "Disponible solo para salida (check-out)"
                            : cell.status === "AVAILABLE"
                              ? "Disponible"
                              : cell.status === "PARTIAL_HOLD"
                                ? partialHoldLabel
                                : cell.status === "BOOKED"
                                  ? "No disponible · Reserva confirmada"
                                  : cell.status === "ICAL_BLOCK"
                                    ? "No disponible · Calendario externo"
                                    : "Fecha pasada";

                  const tooltipText = allowCheckoutBoundary
                    ? "Disponible solo para salida (check-out)"
                    : cell.status === "PARTIAL_HOLD"
                      ? partialHoldLabel
                      : cell.status === "BOOKED"
                        ? "No disponible · Reserva confirmada"
                        : cell.status === "ICAL_BLOCK"
                          ? "No disponible · Calendario externo"
                          : cell.status === "AVAILABLE"
                            ? "Disponible"
                            : "Fecha pasada";

                  return (
                    <button
                      key={cell.ymd}
                      type="button"
                      disabled={!isInteractive}
                      onClick={() => handleDayClick(cell)}
                      title={tooltipText}
                      aria-label={`${formatLongAriaDateEsAr(cell.ymd)} · ${statusDescription}`}
                      aria-pressed={!readOnly && (isEndpoint || isInSelectedRange)}
                      className={cellClasses}
                    >
                      <span>{cell.dayNumber}</span>
                      {cell.status === "AVAILABLE" &&
                        !isEndpoint &&
                        !isInSelectedRange && (
                          <span
                            aria-hidden="true"
                            className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500"
                          />
                        )}
                      {cell.status === "PARTIAL_HOLD" &&
                        !allowCheckoutBoundary && (
                          <span
                            aria-hidden="true"
                            className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                          />
                        )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Leyenda clara de disponibilidad */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[11px] font-bold text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-emerald-600/45 bg-[var(--bg-primary)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Disponible
        </span>

        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-dashed border-amber-500/60 bg-amber-500/20"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          </span>
          Reserva parcial (1 h)
        </span>

        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-rose-500/35 bg-rose-500/15 text-[9px] font-extrabold text-rose-700 dark:text-rose-300 line-through"
          >
            8
          </span>
          No disponible (confirmada)
        </span>

        {hasIcalBlocks && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-slate-500/40 bg-slate-500/20 text-[9px] font-extrabold text-slate-700 dark:text-slate-300 line-through"
            >
              8
            </span>
            Calendario externo
          </span>
        )}

        {!readOnly && (
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-4 w-4 rounded-md bg-[var(--brand-primary)]"
            />
            Tu estadía
          </span>
        )}
      </div>
    </div>
  );
}

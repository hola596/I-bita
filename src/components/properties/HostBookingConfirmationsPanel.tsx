"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Users,
  X,
} from "lucide-react";
import {
  confirmHostBookingAction,
  type HostBookingConfirmationItem,
} from "@/modules/bookings/host-approval-actions";
import {
  formatHoldRemainingLabel,
  isBookingPaid,
  resolveBookingConfirmationPhase,
} from "@/lib/bookings/partial-hold";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export interface HostBookingConfirmationsPanelProps {
  initialItems: HostBookingConfirmationItem[];
}

export function HostBookingConfirmationsPanel({
  initialItems,
}: HostBookingConfirmationsPanelProps) {
  const { notify } = usePreferences();
  const [items, setItems] = useState<HostBookingConfirmationItem[]>(initialItems);
  const [filter, setFilter] = useState<"PENDING" | "CONFIRMED" | "ALL">(
    "PENDING"
  );
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "idle" | "success" | "error";
    text?: string;
  }>({ type: "idle" });

  const pendingItems = items.filter((item) => !item.hostConfirmedAt);
  const confirmedItems = items.filter((item) => Boolean(item.hostConfirmedAt));

  const visibleItems =
    filter === "PENDING"
      ? pendingItems
      : filter === "CONFIRMED"
        ? confirmedItems
        : items;

  async function handleAction(
    bookingId: string,
    decision: "CONFIRM" | "RELEASE"
  ) {
    setBusyId(bookingId);
    setFeedback({ type: "idle" });

    const res = await confirmHostBookingAction({
      bookingId,
      decision,
      notes: notesById[bookingId] ?? "",
    });

    setBusyId(null);

    if (!res.ok) {
      setFeedback({ type: "error", text: res.error.message });
      return;
    }

    if (decision === "RELEASE") {
      setItems((prev) => prev.filter((item) => item.bookingId !== bookingId));
      setFeedback({
        type: "success",
        text: "Liberaste la reserva parcial y las fechas volvieron a quedar disponibles en el calendario.",
      });
      notify("Fechas liberadas en tu calendario.", "info", "calendar");
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.bookingId === bookingId
          ? {
              ...item,
              status: res.data.status,
              hostConfirmedAt:
                res.data.hostConfirmedAt ?? new Date().toISOString(),
              hostDecisionNotes: notesById[bookingId]?.trim() || item.hostDecisionNotes,
            }
          : item
      )
    );
    setFeedback({
      type: "success",
      text: "¡Reserva confirmada! Actualizamos el estado y notificamos al huésped en Mensajes.",
    });
    notify("¡Confirmaste la reserva!", "celebration", "trophy");
  }

  return (
    <section
      aria-labelledby="host-booking-confirmations-heading"
      className="surface-card p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <Icon3D name="calendar" size="md" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="host-booking-confirmations-heading"
                className="text-lg sm:text-xl font-extrabold"
              >
                Confirmaciones y reservas parciales (1 h)
              </h2>
              {pendingItems.length > 0 && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                  {pendingItems.length}{" "}
                  {pendingItems.length === 1
                    ? "por confirmar"
                    : "por confirmar"}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Cada reserva aparta las fechas de forma parcial por 1 hora hasta
              que se acredite el pago y vos la confirmes acá.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar reservas"
          className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-extrabold"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === "PENDING"}
            onClick={() => setFilter("PENDING")}
            className={`rounded-full px-3 py-1.5 cursor-pointer transition-colors ${
              filter === "PENDING"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Por confirmar ({pendingItems.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "CONFIRMED"}
            onClick={() => setFilter("CONFIRMED")}
            className={`rounded-full px-3 py-1.5 cursor-pointer transition-colors ${
              filter === "CONFIRMED"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Confirmadas ({confirmedItems.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "ALL"}
            onClick={() => setFilter("ALL")}
            className={`rounded-full px-3 py-1.5 cursor-pointer transition-colors ${
              filter === "ALL"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Todas ({items.length})
          </button>
        </div>
      </div>

      {feedback.type !== "idle" && feedback.text && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-2xl px-4 py-3 text-xs font-extrabold ${
            feedback.type === "error"
              ? "border border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
              : "badge-consorcio-friendly"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs font-semibold text-[var(--text-secondary)]">
          {filter === "PENDING"
            ? "No tenés reservas pendientes de confirmación en este momento."
            : "Todavía no hay reservas en esta vista."}
        </p>
      ) : (
        <ul className="space-y-3.5">
          {visibleItems.map((item) => {
            const paid = isBookingPaid(item.status);
            const phase = resolveBookingConfirmationPhase({
              status: item.status,
              holdExpiresAt: item.holdExpiresAt,
              hostConfirmedAt: item.hostConfirmedAt,
            });
            const isBusy = busyId === item.bookingId;
            const holdInfo =
              item.status === "PENDING_PAYMENT" && item.holdExpiresAt
                ? formatHoldRemainingLabel(item.holdExpiresAt)
                : null;
            const formattedTotal = Number(item.totalAmount).toLocaleString(
              "es-AR",
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            );

            return (
              <li
                key={item.bookingId}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/65 p-4 sm:p-5 space-y-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {phase === "CONFIRMED" ? (
                        <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Pago y anfitrión confirmados
                        </span>
                      ) : phase === "PAID_AWAITING_HOST" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-950 dark:text-amber-200">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Pagada · Falta tu confirmación
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-950 dark:text-amber-200">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Reserva parcial (1 h)
                          {holdInfo ? ` · Vence ${holdInfo.expiresAtClockEsAr} hs` : ""}
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {item.checkIn} → {item.checkOut} ({item.nightsCount}{" "}
                        noches)
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold">
                      {item.guestName} ·{" "}
                      <span className="text-[var(--brand-primary)]">
                        {item.propertyTitle}
                      </span>
                    </h3>

                    <p className="text-xs text-[var(--text-secondary)]">
                      {item.guestEmail} ·{" "}
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" aria-hidden="true" />
                        {item.declaredAdultsCount}{" "}
                        {item.declaredAdultsCount === 1 ? "adulto" : "adultos"}
                      </span>{" "}
                      · Total:{" "}
                      <strong>
                        {formattedTotal} {item.paymentCurrency}
                      </strong>
                    </p>
                  </div>

                  <Link
                    href={`/mensajes?booking=${item.bookingId}`}
                    className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold"
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Abrir Mensajes</span>
                  </Link>
                </div>

                {!item.hostConfirmedAt ? (
                  <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-3">
                    <input
                      type="text"
                      maxLength={500}
                      value={notesById[item.bookingId] ?? ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [item.bookingId]: e.target.value,
                        }))
                      }
                      aria-label={`Mensaje de confirmación para ${item.guestName}`}
                      placeholder="Nota u horario de ingreso dentro de la plataforma (opcional)"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAction(item.bookingId, "CONFIRM")}
                        className="btn-primary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>Confirmar reserva</span>
                      </button>

                      {!paid && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleAction(item.bookingId, "RELEASE")}
                          className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold text-red-700 dark:text-red-400 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Liberar fechas</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  item.hostDecisionNotes && (
                    <p className="text-xs text-[var(--text-secondary)]">
                      <strong>Nota de confirmación:</strong>{" "}
                      {item.hostDecisionNotes}
                    </p>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

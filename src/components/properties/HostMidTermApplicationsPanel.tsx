"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Check,
  Clock,
  Globe2,
  Loader2,
  MessageSquare,
  Users,
  X,
} from "lucide-react";
import {
  reviewMidTermBookingAction,
  type HostMidTermApplicationItem,
} from "@/modules/bookings/host-approval-actions";
import { INTERVIEW_CHANNEL_LABELS } from "@/modules/properties/mid-term-policy";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export interface HostMidTermApplicationsPanelProps {
  initialApplications: HostMidTermApplicationItem[];
}

export function HostMidTermApplicationsPanel({
  initialApplications,
}: HostMidTermApplicationsPanelProps) {
  const { notify } = usePreferences();
  const [applications, setApplications] =
    useState<HostMidTermApplicationItem[]>(initialApplications);
  const [activeTab, setActiveTab] = useState<"PENDING" | "REVIEWED">("PENDING");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "idle" | "success" | "error";
    text?: string;
  }>({ type: "idle" });

  const pendingList = applications.filter(
    (app) => app.status === "PENDING_HOST_APPROVAL"
  );
  const reviewedList = applications.filter(
    (app) => app.status !== "PENDING_HOST_APPROVAL"
  );

  const visibleList = activeTab === "PENDING" ? pendingList : reviewedList;

  async function handleDecision(
    bookingId: string,
    decision: "APPROVE" | "REJECT"
  ) {
    setProcessingId(bookingId);
    setFeedback({ type: "idle" });

    const res = await reviewMidTermBookingAction({
      bookingId,
      decision,
      notes: notesById[bookingId] ?? "",
    });

    setProcessingId(null);

    if (!res.ok) {
      setFeedback({ type: "error", text: res.error.message });
      return;
    }

    setApplications((prev) =>
      prev.map((item) =>
        item.bookingId === bookingId
          ? {
              ...item,
              status: res.data.status,
              hostDecisionNotes: notesById[bookingId]?.trim() || null,
              hostReviewedAt: res.data.hostReviewedAt,
            }
          : item
      )
    );

    if (decision === "APPROVE") {
      setFeedback({
        type: "success",
        text: "¡Huésped aprobado! Ya se habilitó el pago de la estadía larga.",
      });
      notify(
        "¡Listo! Aprobaste al huésped y habilitamos su pago.",
        "celebration",
        "trophy"
      );
    } else {
      setFeedback({
        type: "success",
        text: "Solicitud rechazada. Las fechas volvieron a quedar libres en tu calendario.",
      });
      notify("Liberamos esas fechas en tu calendario.", "info", "calendar");
    }
  }

  if (applications.length === 0) {
    return (
      <section
        aria-labelledby="midterm-inbox-heading"
        className="surface-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <Icon3D name="chat" size="sm" />
          <div className="space-y-0.5">
            <h2
              id="midterm-inbox-heading"
              className="text-sm sm:text-base font-extrabold"
            >
              Entrevistas y solicitudes de estadías largas (1 a 6 meses)
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Todavía no tenés solicitudes pendientes de entrevista. Cuando un
              huésped pida una estadía de 30 a 180 noches en una propiedad con
              aprobación previa, va a aparecer acá para que puedas hablar y
              aprobarla.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)] whitespace-nowrap self-start sm:self-center">
          0 pendientes
        </span>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="midterm-inbox-heading"
      className="surface-card p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <Icon3D name="chat" size="md" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="midterm-inbox-heading"
                className="text-lg sm:text-xl font-extrabold"
              >
                Solicitudes de estadías largas (1 a 6 meses)
              </h2>
              {pendingList.length > 0 && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                  {pendingList.length}{" "}
                  {pendingList.length === 1
                    ? "esperando entrevista"
                    : "esperando entrevista"}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Revisá las respuestas, conversá con el huésped dentro de I-bita y
              decidí si habilitás su pago.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar solicitudes de estadía larga"
          className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-extrabold"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "PENDING"}
            onClick={() => setActiveTab("PENDING")}
            className={`rounded-full px-3.5 py-1.5 cursor-pointer transition-colors ${
              activeTab === "PENDING"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Pendientes ({pendingList.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "REVIEWED"}
            onClick={() => setActiveTab("REVIEWED")}
            className={`rounded-full px-3.5 py-1.5 cursor-pointer transition-colors ${
              activeTab === "REVIEWED"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Revisadas ({reviewedList.length})
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

      {visibleList.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs font-semibold text-[var(--text-secondary)]">
          {activeTab === "PENDING"
            ? "No tenés solicitudes pendientes de entrevista en este momento."
            : "Todavía no hay solicitudes revisadas en el historial."}
        </p>
      ) : (
        <ul className="space-y-4">
          {visibleList.map((app) => {
            const detail = app.midTermApplication;
            const isPending = app.status === "PENDING_HOST_APPROVAL";
            const isBusy = processingId === app.bookingId;
            const formattedTotal = Number(app.totalAmount).toLocaleString(
              "es-AR",
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }
            );

            return (
              <li
                key={app.bookingId}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 p-4 sm:p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 dark:text-amber-300">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Esperando entrevista
                        </span>
                      ) : app.status === "CANCELLED" ? (
                        <span className="rounded-full bg-red-100 text-red-900 border border-red-400/40 px-2.5 py-0.5 text-[11px] font-extrabold">
                          Rechazada
                        </span>
                      ) : (
                        <span className="badge-consorcio-friendly rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                          Aprobada para pago ({app.status})
                        </span>
                      )}

                      {detail?.isForeigner && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-2.5 py-0.5 text-[11px] font-extrabold">
                          <Globe2 className="h-3 w-3" aria-hidden="true" />
                          Huésped extranjero
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {app.checkIn} → {app.checkOut} ({app.nightsCount} noches)
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold">
                      {app.guestName} ·{" "}
                      <span className="text-[var(--brand-primary)]">
                        {app.propertyTitle}
                      </span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {app.guestEmail} ·{" "}
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" aria-hidden="true" />
                        {app.declaredAdultsCount}{" "}
                        {app.declaredAdultsCount === 1 ? "adulto" : "adultos"}
                      </span>{" "}
                      · Total estimado:{" "}
                      <strong>
                        {formattedTotal} {app.paymentCurrency}
                      </strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/mensajes?booking=${app.bookingId}`}
                      className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400"
                    >
                      <MessageSquare
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      <span>Abrir entrevista en Mensajes</span>
                    </Link>
                  </div>
                </div>

                {detail && (
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 space-y-3 text-xs">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="rounded-full bg-[var(--surface-tint)] border border-[var(--brand-primary)]/30 px-2.5 py-0.5 font-extrabold text-[var(--brand-primary)]">
                        Canal preferido:{" "}
                        {INTERVIEW_CHANNEL_LABELS[
                          detail.preferredInterviewChannel
                        ] ?? detail.preferredInterviewChannel}
                      </span>
                      {detail.availabilityNote && (
                        <span className="font-semibold text-[var(--text-secondary)]">
                          Disponibilidad: {detail.availabilityNote}
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="font-extrabold text-[var(--text-primary)] mb-1">
                        Presentación del huésped:
                      </p>
                      <p className="text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                        {detail.guestIntro}
                      </p>
                    </div>

                    {detail.questionAnswers.length > 0 && (
                      <div className="border-t border-[var(--border-subtle)] pt-2.5 space-y-1.5">
                        <p className="font-extrabold text-[var(--text-primary)]">
                          Respuestas a tus preguntas previas:
                        </p>
                        {detail.questionAnswers.map((qa, idx) => (
                          <div
                            key={`${qa.question}-${idx}`}
                            className="rounded-xl bg-[var(--bg-secondary)] px-3 py-2"
                          >
                            <p className="font-bold text-[var(--text-primary)]">
                              {qa.question}
                            </p>
                            <p className="text-[var(--text-secondary)] mt-0.5">
                              {qa.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {detail.acknowledgedRequirementLabels.length > 0 && (
                      <div className="border-t border-[var(--border-subtle)] pt-2.5">
                        <p className="font-extrabold text-[var(--text-primary)] mb-1.5">
                          Requisitos confirmados por el huésped:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {detail.acknowledgedRequirementLabels.map((lbl) => (
                            <span
                              key={lbl}
                              className="badge-consorcio-friendly rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                            >
                              ✓ {lbl}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isPending ? (
                  <div className="space-y-3 border-t border-[var(--border-subtle)] pt-3">
                    <input
                      type="text"
                      maxLength={500}
                      value={notesById[app.bookingId] ?? ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [app.bookingId]: e.target.value,
                        }))
                      }
                      aria-label={`Nota de decisión para ${app.guestName}`}
                      placeholder="Nota opcional tras la entrevista (ej: Videollamada realizada, todo en orden)"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDecision(app.bookingId, "APPROVE")}
                        className="btn-primary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>Aprobar huésped y habilitar pago</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDecision(app.bookingId, "REJECT")}
                        className="btn-secondary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold text-red-700 dark:text-red-400 disabled:opacity-50"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        <span>Rechazar y liberar fechas</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  app.hostDecisionNotes && (
                    <p className="text-xs text-[var(--text-secondary)]">
                      <strong>Nota de tu revisión:</strong>{" "}
                      {app.hostDecisionNotes}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  ShieldCheck,
  X,
} from "lucide-react";
import { updateHostResponseScheduleAction } from "@/modules/auth/actions";
import {
  formatActiveDurationEsAr,
  type HostResponseMetrics,
} from "@/lib/host/response-schedule";
import {
  HostResponseScheduleEditor,
  type HostResponseScheduleFormValue,
} from "./HostResponseScheduleEditor";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface HostResponseProfileCardProps {
  metrics: HostResponseMetrics;
}

/**
 * Panel para el anfitrión en `/perfil`: muestra su tasa de respuesta sincronizada con
 * sus días/horarios y le permite confirmar o actualizar su intervalo sin perder aprobación.
 */
export function HostResponseProfileCard({
  metrics,
}: HostResponseProfileCardProps) {
  const router = useRouter();
  const { notify } = usePreferences();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summaryText, setSummaryText] = useState(metrics.scheduleSummary);
  const [confirmedNow, setConfirmedNow] = useState(metrics.scheduleConfirmed);
  const [feedback, setFeedback] = useState<{
    type: "idle" | "error" | "success";
    text?: string;
  }>({ type: "idle" });

  const [formValue, setFormValue] = useState<HostResponseScheduleFormValue>({
    days: metrics.schedule.days,
    startHour: metrics.schedule.startHour,
    endHour: metrics.schedule.endHour,
    maxResponseHours: metrics.schedule.maxResponseHours,
    confirmedCommitment: metrics.scheduleConfirmed,
  });

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formValue.confirmedCommitment) {
      setFeedback({
        type: "error",
        text: "Marcá la casilla de confirmación obligatoria para guardar tu horario de respuesta.",
      });
      return;
    }

    setSaving(true);
    setFeedback({ type: "idle" });

    const res = await updateHostResponseScheduleAction({
      days: formValue.days,
      startHour: formValue.startHour,
      endHour: formValue.endHour,
      maxResponseHours: formValue.maxResponseHours,
      confirmedCommitment: true,
    });

    setSaving(false);

    if (!res.ok) {
      setFeedback({ type: "error", text: res.error.message });
      return;
    }

    setSummaryText(res.data.scheduleSummary);
    setConfirmedNow(true);
    setIsEditing(false);
    setFeedback({
      type: "success",
      text: "Horario confirmado y sincronizado con tus futuras reservas.",
    });
    notify("¡Horario y tasa de respuesta sincronizados!", "celebration", "check");
    router.refresh();
  }

  return (
    <section
      aria-labelledby="host-response-sla-heading"
      className="surface-card p-6 space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <Icon3D name="chat" size="md" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold border ${
                  confirmedNow
                    ? "badge-consorcio-friendly"
                    : "border-amber-500/45 bg-amber-500/15 text-amber-900 dark:text-amber-300"
                }`}
              >
                {confirmedNow ? (
                  <>
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Intervalo confirmado ✓
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Falta confirmar intervalo obligatorio
                  </>
                )}
              </span>

              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold border ${
                  metrics.isCurrentlyWithinSchedule
                    ? "border-emerald-600/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {metrics.isCurrentlyWithinSchedule
                  ? "En horario activo"
                  : "Fuera de horario (pausado)"}
              </span>
            </div>

            <h2
              id="host-response-sla-heading"
              className="text-lg font-extrabold mt-1"
            >
              Tu horario y tasa de respuesta
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Cada reserva comunica este intervalo al huésped y mide tu cumplimiento solo dentro de tus horarios.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setFeedback({ type: "idle" });
            setIsEditing((prev) => !prev);
          }}
          className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold shrink-0"
        >
          {isEditing ? (
            <>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cancelar</span>
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{confirmedNow ? "Editar horario" : "Confirmar ahora"}</span>
            </>
          )}
        </button>
      </div>

      {/* KPIs sincronizados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">
            Tasa de respuesta sincronizada
          </span>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {metrics.responseRatePct !== null
              ? `${metrics.responseRatePct}%`
              : "100%*"}
          </p>
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {metrics.evaluatedCount > 0
              ? `${metrics.respondedOnTimeCount} de ${metrics.evaluatedCount} reservas a tiempo`
              : "Sin reservas vencidas aún (*base inicial)"}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">
            Tiempo promedio activo
          </span>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {metrics.avgActiveResponseMinutes !== null
              ? formatActiveDurationEsAr(metrics.avgActiveResponseMinutes)
              : `≤ ${metrics.schedule.maxResponseHours} hs`}
          </p>
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
            Solo cuenta minutos dentro de tu horario
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">
            Ventana configurada
          </span>
          <p className="text-sm font-extrabold text-[var(--text-primary)] leading-snug pt-0.5">
            {summaryText}
          </p>
          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            {metrics.pendingWithinWindowCount > 0
              ? `${metrics.pendingWithinWindowCount} por responder en plazo`
              : "Sin mensajes vencidos"}
          </p>
        </div>
      </div>

      {!confirmedNow && !isEditing && (
        <div className="rounded-2xl border border-amber-500/45 bg-amber-500/12 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <p className="font-bold text-amber-900 dark:text-amber-200 leading-relaxed">
            Confirmá tus días y franja horaria de atención para que I-bita comunique automáticamente tu plazo real a cada huésped al reservar.
          </p>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="btn-primary-3d inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Confirmar intervalo</span>
          </button>
        </div>
      )}

      {feedback.type === "error" && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-900 dark:text-red-300"
        >
          {feedback.text}
        </p>
      )}

      {feedback.type === "success" && (
        <p
          role="status"
          className="badge-consorcio-friendly rounded-xl px-4 py-3 text-xs font-extrabold"
        >
          ✓ {feedback.text}
        </p>
      )}

      {isEditing && (
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 p-4 sm:p-5 space-y-4"
        >
          <HostResponseScheduleEditor
            value={formValue}
            onChange={setFormValue}
            mode="profile"
          />

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={saving}
              className="btn-secondary-3d inline-flex min-h-[44px] items-center rounded-xl px-4 text-xs font-extrabold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !formValue.confirmedCommitment}
              className="btn-primary-3d inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-5 text-xs font-extrabold disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Guardar y sincronizar horario</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

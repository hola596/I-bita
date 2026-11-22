"use client";

import { useMemo } from "react";
import { Check, CheckCircle2, Clock, MessageSquare } from "lucide-react";
import {
  ALLOWED_MAX_RESPONSE_HOURS,
  HOST_RESPONSE_PRESETS,
  WEEKDAY_CODES,
  WEEKDAY_SHORT_LABELS,
  calculateScheduledResponseDeadline,
  formatDeadlineEsAr,
  formatHourLabel,
  formatResponseScheduleSummary,
  type HostResponseSchedule,
  type MaxResponseHours,
  type WeekdayCode,
} from "@/lib/host/response-schedule";

export interface HostResponseScheduleFormValue {
  days: WeekdayCode[];
  startHour: number;
  endHour: number;
  maxResponseHours: MaxResponseHours;
  confirmedCommitment: boolean;
}

interface HostResponseScheduleEditorProps {
  value: HostResponseScheduleFormValue;
  onChange: (next: HostResponseScheduleFormValue) => void;
  mode?: "onboarding" | "profile";
}

const START_HOURS = Array.from({ length: 23 }, (_, i) => i);
const END_HOURS = Array.from({ length: 23 }, (_, i) => i + 2);

/**
 * Selector progresivo y obligatorio del intervalo de días, horarios y plazo máximo de
 * respuesta del anfitrión (hora Argentina GMT-3). Muestra vista previa en tiempo real.
 */
export function HostResponseScheduleEditor({
  value,
  onChange,
  mode = "onboarding",
}: HostResponseScheduleEditorProps) {
  const isHourSpanValid = value.endHour - value.startHour >= 2;
  const isDaysValid = value.days.length >= 1;
  const isScheduleValid = isDaysValid && isHourSpanValid;

  const previewSchedule: HostResponseSchedule = useMemo(
    () => ({
      days: value.days.length > 0 ? value.days : ["MON"],
      startHour: value.startHour,
      endHour: isHourSpanValid ? value.endHour : Math.min(24, value.startHour + 2),
      maxResponseHours: value.maxResponseHours,
      timezone: "America/Argentina/Buenos_Aires",
      confirmedAt: value.confirmedCommitment ? new Date().toISOString() : null,
    }),
    [value, isHourSpanValid]
  );

  const scheduleSummary = useMemo(
    () => formatResponseScheduleSummary(previewSchedule),
    [previewSchedule]
  );

  const exampleDeadlineLabel = useMemo(() => {
    const due = calculateScheduledResponseDeadline(new Date(), previewSchedule);
    return formatDeadlineEsAr(due.toISOString());
  }, [previewSchedule]);

  function toggleDay(dayCode: WeekdayCode) {
    const exists = value.days.includes(dayCode);
    if (exists && value.days.length === 1) {
      return;
    }
    const nextDays = exists
      ? value.days.filter((d) => d !== dayCode)
      : WEEKDAY_CODES.filter((code) => value.days.includes(code) || code === dayCode);
    onChange({
      ...value,
      days: nextDays,
    });
  }

  return (
    <div className="space-y-4">
      {/* Plantillas rápidas para reducir fricción */}
      <div className="space-y-2">
        <p className="text-xs font-extrabold text-[var(--text-primary)]">
          Plantillas sugeridas (o personalizá tus días y horas abajo):
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {HOST_RESPONSE_PRESETS.map((preset) => {
            const matches =
              value.startHour === preset.startHour &&
              value.endHour === preset.endHour &&
              value.maxResponseHours === preset.maxResponseHours &&
              value.days.length === preset.days.length &&
              preset.days.every((d) => value.days.includes(d));

            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={matches}
                onClick={() =>
                  onChange({
                    ...value,
                    days: [...preset.days],
                    startHour: preset.startHour,
                    endHour: preset.endHour,
                    maxResponseHours: preset.maxResponseHours,
                  })
                }
                className={`rounded-2xl border p-3 text-left transition-all cursor-pointer space-y-0.5 ${
                  matches
                    ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] ring-2 ring-[var(--brand-primary)]/20"
                    : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--brand-primary)]/60"
                }`}
              >
                <span className="block text-xs font-extrabold text-[var(--text-primary)]">
                  {preset.label}
                </span>
                <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                  {preset.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selector de días de la semana */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-extrabold">
          <span>Días activos para responder reservas *</span>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {value.days.length} {value.days.length === 1 ? "día" : "días"}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_CODES.map((dayCode) => {
            const active = value.days.includes(dayCode);
            return (
              <button
                key={dayCode}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDay(dayCode)}
                className={`min-h-[42px] rounded-xl border text-xs font-extrabold transition-colors cursor-pointer ${
                  active
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white shadow-xs"
                    : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]"
                }`}
              >
                {WEEKDAY_SHORT_LABELS[dayCode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Franja horaria (Argentina GMT-3) */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`schedule-start-${mode}`}
            className="block text-xs font-extrabold text-[var(--text-primary)]"
          >
            Desde (hora AR) *
          </label>
          <select
            id={`schedule-start-${mode}`}
            value={value.startHour}
            onChange={(e) => {
              const nextStart = Number(e.target.value);
              onChange({
                ...value,
                startHour: nextStart,
                endHour:
                  value.endHour - nextStart >= 2
                    ? value.endHour
                    : Math.min(24, nextStart + 2),
              });
            }}
            className="min-h-[46px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm font-bold focus:border-[var(--brand-primary)] focus:outline-none"
          >
            {START_HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {formatHourLabel(hour)} hs
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`schedule-end-${mode}`}
            className="block text-xs font-extrabold text-[var(--text-primary)]"
          >
            Hasta (hora AR) *
          </label>
          <select
            id={`schedule-end-${mode}`}
            value={value.endHour}
            onChange={(e) =>
              onChange({
                ...value,
                endHour: Number(e.target.value),
              })
            }
            className="min-h-[46px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm font-bold focus:border-[var(--brand-primary)] focus:outline-none"
          >
            {END_HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {formatHourLabel(hour)} hs
              </option>
            ))}
          </select>
        </div>
      </div>

      {!isHourSpanValid && (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/45 bg-amber-500/12 px-3.5 py-2.5 text-xs font-bold text-amber-900 dark:text-amber-200"
        >
          El intervalo debe tener al menos 2 horas de diferencia entre inicio y cierre.
        </p>
      )}

      {/* Plazo máximo dentro del horario activo */}
      <div className="space-y-2">
        <p className="text-xs font-extrabold text-[var(--text-primary)]">
          Tiempo máximo de respuesta dentro de tu horario *
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {ALLOWED_MAX_RESPONSE_HOURS.map((hours) => {
            const active = value.maxResponseHours === hours;
            return (
              <button
                key={hours}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange({
                    ...value,
                    maxResponseHours: hours,
                  })
                }
                className={`min-h-[42px] rounded-xl border text-xs font-extrabold transition-colors cursor-pointer ${
                  active
                    ? "border-emerald-600 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)] ring-2 ring-emerald-500/20"
                    : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-emerald-600/50"
                }`}
              >
                {hours} {hours === 1 ? "hora" : "hs"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vista previa de cómo se le comunica al huésped */}
      {isScheduleValid && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-1.5 font-extrabold text-[var(--text-primary)]">
            <MessageSquare
              className="h-3.5 w-3.5 text-[var(--brand-primary)] shrink-0"
              aria-hidden="true"
            />
            <span>Así lo verá automáticamente cada huésped al reservar:</span>
          </div>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            &ldquo;Este anfitrión confirma la reserva y envía instrucciones de ingreso:{" "}
            <strong className="text-[var(--text-primary)]">
              {scheduleSummary}
            </strong>
            . Si reservás ahora, respondería{" "}
            <strong className="text-[var(--brand-primary)]">
              {exampleDeadlineLabel}
            </strong>
            .&rdquo;
          </p>
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Tu tasa de respuesta se pausa automáticamente fuera de tus días y horarios elegidos.
          </p>
        </div>
      )}

      {/* Confirmación obligatoria */}
      <label className="flex items-start gap-3 rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 cursor-pointer hover:border-[var(--brand-primary)]/60 transition-colors">
        <input
          type="checkbox"
          checked={value.confirmedCommitment}
          onChange={(e) =>
            onChange({
              ...value,
              confirmedCommitment: e.target.checked,
            })
          }
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-primary)] rounded cursor-pointer"
        />
        <div className="space-y-1 text-xs">
          <span className="flex items-center gap-1.5 font-extrabold text-[var(--text-primary)]">
            {value.confirmedCommitment ? (
              <CheckCircle2
                className="h-4 w-4 text-emerald-600 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <Check
                className="h-4 w-4 text-[var(--brand-primary)] shrink-0"
                aria-hidden="true"
              />
            )}
            <span>
              Confirmo obligatoriamente este intervalo de días y horarios de respuesta *
            </span>
          </span>
          <p className="text-[var(--text-secondary)] leading-relaxed">
            Entiendo que cuando un huésped reserva, paga y valida su identidad, I-bita le comunicará esta ventana para que reciba mi confirmación e instrucciones de ingreso en Mensajes.
          </p>
        </div>
      </label>
    </div>
  );
}

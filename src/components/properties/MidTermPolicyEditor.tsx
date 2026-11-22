"use client";

import { useState } from "react";
import {
  CheckCircle2,
  MessageSquare,
  Phone,
  Plus,
  Trash2,
  Video,
  Zap,
  ShieldCheck,
} from "lucide-react";
import {
  EXTRA_REQUIREMENT_PRESETS,
  INTERVIEW_CHANNELS,
  INTERVIEW_CHANNEL_LABELS,
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_CATEGORY_LABELS,
  RESPONSE_TIME_OPTIONS,
  SUGGESTED_SCREENING_QUESTIONS,
  type InterviewChannel,
  type MidTermApprovalMode,
  type MidTermPolicy,
  type MidTermRequirement,
  type RequirementCategory,
  type ResponseTimeHours,
} from "@/modules/properties/mid-term-policy";
import { Icon3D } from "@/components/ui/Icon3D";

export interface MidTermPolicyEditorProps {
  value: MidTermPolicy;
  onChange: (next: MidTermPolicy) => void;
}

function getChannelIcon(channel: InterviewChannel) {
  switch (channel) {
    case "PLATFORM_VOICE":
      return <Phone className="h-3.5 w-3.5" aria-hidden="true" />;
    case "PLATFORM_CHAT":
      return <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />;
    case "PLATFORM_VIDEO":
      return <Video className="h-3.5 w-3.5" aria-hidden="true" />;
  }
}

export function MidTermPolicyEditor({
  value,
  onChange,
}: MidTermPolicyEditorProps) {
  const [channelHint, setChannelHint] = useState<string | null>(null);
  const [newQuestionInput, setNewQuestionInput] = useState("");
  const [showCustomReqForm, setShowCustomReqForm] = useState(false);
  const [customReqLabel, setCustomReqLabel] = useState("");
  const [customReqDetail, setCustomReqDetail] = useState("");
  const [customReqCategory, setCustomReqCategory] =
    useState<RequirementCategory>("CUSTOM");
  const [customReqRequired, setCustomReqRequired] = useState(true);
  const [customReqError, setCustomReqError] = useState<string | null>(null);

  const enabledCount = value.requirements.filter((r) => r.enabled).length;
  const requiredCount = value.requirements.filter(
    (r) => r.enabled && r.required
  ).length;

  const availableExtraPresets = EXTRA_REQUIREMENT_PRESETS.filter(
    (preset) => !value.requirements.some((req) => req.key === preset.key)
  );

  const availableQuestionSuggestions = SUGGESTED_SCREENING_QUESTIONS.filter(
    (q) =>
      !value.screeningQuestions.some(
        (existing) => existing.trim().toLowerCase() === q.trim().toLowerCase()
      )
  );

  function setApprovalMode(approvalMode: MidTermApprovalMode) {
    setChannelHint(null);
    onChange({
      ...value,
      approvalMode,
      interviewChannels:
        approvalMode === "HOST_APPROVAL_INTERVIEW" &&
        value.interviewChannels.length === 0
          ? ["PLATFORM_CHAT", "PLATFORM_VIDEO"]
          : value.interviewChannels,
    });
  }

  function toggleChannel(channel: InterviewChannel) {
    const exists = value.interviewChannels.includes(channel);
    if (exists && value.interviewChannels.length === 1) {
      setChannelHint(
        "Dejá al menos una opción de contacto para poder hacer la entrevista."
      );
      return;
    }
    setChannelHint(null);
    const nextChannels = exists
      ? value.interviewChannels.filter((c) => c !== channel)
      : [...value.interviewChannels, channel];
    onChange({ ...value, interviewChannels: nextChannels });
  }

  function updateRequirement(
    id: string,
    patch: Partial<MidTermRequirement>
  ) {
    onChange({
      ...value,
      requirements: value.requirements.map((req) =>
        req.id === id ? { ...req, ...patch } : req
      ),
    });
  }

  function removeRequirement(id: string) {
    onChange({
      ...value,
      requirements: value.requirements.filter((req) => req.id !== id),
    });
  }

  function addPresetRequirement(
    preset: (typeof EXTRA_REQUIREMENT_PRESETS)[number]
  ) {
    if (value.requirements.length >= 15) return;
    const newItem: MidTermRequirement = {
      ...preset,
      id: `req-${preset.key}-${Date.now().toString(36)}`,
    };
    onChange({
      ...value,
      requirements: [...value.requirements, newItem],
    });
  }

  function handleAddCustomRequirement() {
    const cleanLabel = customReqLabel.trim();
    const cleanDetail = customReqDetail.trim();
    if (cleanLabel.length < 2) {
      setCustomReqError(
        "Escribí un título corto para el requisito (mín. 2 caracteres)."
      );
      return;
    }
    if (value.requirements.length >= 15) {
      setCustomReqError("Podés configurar hasta 15 requisitos por propiedad.");
      return;
    }

    const keySlug = cleanLabel
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

    const newItem: MidTermRequirement = {
      id: `custom-${Date.now().toString(36)}`,
      key: keySlug || `custom_${Date.now().toString(36)}`,
      label: cleanLabel,
      detail: cleanDetail,
      enabled: true,
      required: customReqRequired,
      category: customReqCategory,
      isCustom: true,
    };

    onChange({
      ...value,
      requirements: [...value.requirements, newItem],
    });
    setCustomReqLabel("");
    setCustomReqDetail("");
    setCustomReqCategory("CUSTOM");
    setCustomReqRequired(true);
    setCustomReqError(null);
    setShowCustomReqForm(false);
  }

  function addQuestion(questionText: string) {
    const clean = questionText.trim();
    if (clean.length < 3 || value.screeningQuestions.length >= 8) return;
    if (
      value.screeningQuestions.some(
        (existing) => existing.toLowerCase() === clean.toLowerCase()
      )
    ) {
      return;
    }
    onChange({
      ...value,
      screeningQuestions: [...value.screeningQuestions, clean],
    });
    setNewQuestionInput("");
  }

  function removeQuestion(index: number) {
    onChange({
      ...value,
      screeningQuestions: value.screeningQuestions.filter(
        (_, idx) => idx !== index
      ),
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70 p-4 sm:p-5 space-y-5">
      {/* Cabecera clara */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-start gap-3">
          <Icon3D name="contract" size="sm" />
          <div className="space-y-0.5">
            <h3 className="text-sm sm:text-base font-extrabold">
              Estadías largas (1 a 6 meses): aprobación y requisitos
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Elegí si querés confirmar de forma automática o entrevistar primero
              al huésped y definí exactamente qué requisitos pedís.
            </p>
          </div>
        </div>

        <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1 text-[11px] font-extrabold text-[var(--text-primary)] whitespace-nowrap">
          {value.approvalMode === "HOST_APPROVAL_INTERVIEW"
            ? "Entrevista previa"
            : "Confirmación automática"}{" "}
          · {enabledCount} {enabledCount === 1 ? "requisito" : "requisitos"}
        </span>
      </div>

      {/* Paso A: Selector de modalidad */}
      <div className="space-y-2.5">
        <p className="text-xs font-extrabold text-[var(--text-primary)]">
          ¿Cómo preferís aprobar las estadías de 30 a 180 noches?
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setApprovalMode("INSTANT")}
            aria-pressed={value.approvalMode === "INSTANT"}
            className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer space-y-1.5 ${
              value.approvalMode === "INSTANT"
                ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] shadow-xs"
                : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--brand-primary)]/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold">
                <Zap
                  className="h-4 w-4 text-[var(--brand-primary)]"
                  aria-hidden="true"
                />
                Confirmación automática
              </span>
              {value.approvalMode === "INSTANT" && (
                <CheckCircle2
                  className="h-4 w-4 text-[var(--brand-primary)] shrink-0"
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              El huésped acepta tus condiciones, reserva sus fechas y pasa
              directo al pago y verificación de identidad.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setApprovalMode("HOST_APPROVAL_INTERVIEW")}
            aria-pressed={value.approvalMode === "HOST_APPROVAL_INTERVIEW"}
            className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer space-y-1.5 ${
              value.approvalMode === "HOST_APPROVAL_INTERVIEW"
                ? "border-emerald-600 bg-[var(--badge-consorcio-bg)]/60 shadow-xs"
                : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-emerald-600/40"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold">
                <ShieldCheck
                  className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Aprobación previa con entrevista
              </span>
              {value.approvalMode === "HOST_APPROVAL_INTERVIEW" && (
                <CheckCircle2
                  className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0"
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Primero indagás y hablás con el huésped dentro del chat y sala de
              entrevistas de I-bita. El pago se habilita recién cuando lo aprobás.
            </p>
          </button>
        </div>
      </div>

      {/* Paso B: Configuración de entrevista (solo cuando elige entrevista previa) */}
      {value.approvalMode === "HOST_APPROVAL_INTERVIEW" && (
        <div className="animate-ibita-fade-up rounded-2xl border border-emerald-600/35 bg-[var(--bg-primary)] p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              Modalidades dentro de I-bita para entrevistar al huésped *
            </p>
            <div className="flex flex-wrap gap-2">
              {INTERVIEW_CHANNELS.map((ch) => {
                const active = value.interviewChannels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    aria-pressed={active}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-colors cursor-pointer ${
                      active
                        ? "border-emerald-600 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {getChannelIcon(ch)}
                    <span>{INTERVIEW_CHANNEL_LABELS[ch]}</span>
                  </button>
                );
              })}
            </div>
            {channelHint && (
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                {channelHint}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="midterm-response-hours"
                className="block text-xs font-bold mb-1"
              >
                Tiempo estimado para responder
              </label>
              <select
                id="midterm-response-hours"
                value={value.responseTimeHours}
                onChange={(e) =>
                  onChange({
                    ...value,
                    responseTimeHours: Number(
                      e.target.value
                    ) as ResponseTimeHours,
                  })
                }
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-bold"
              >
                {RESPONSE_TIME_OPTIONS.map((hrs) => (
                  <option key={hrs} value={hrs}>
                    Dentro de {hrs} horas
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="midterm-instructions"
                className="block text-xs font-bold mb-1"
              >
                Aclaraciones para coordinar la entrevista (opcional)
              </label>
              <input
                id="midterm-instructions"
                type="text"
                maxLength={500}
                value={value.interviewInstructions}
                onChange={(e) =>
                  onChange({
                    ...value,
                    interviewInstructions: e.target.value,
                  })
                }
                placeholder="Ej: Coordinamos una charla de 10 minutos de lunes a viernes de 10 a 19 hs."
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Preguntas previas personalizadas */}
          <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-[var(--text-primary)]">
                Preguntas previas para conocer al huésped ({value.screeningQuestions.length}/8)
              </p>
            </div>

            {value.screeningQuestions.length > 0 && (
              <ul className="space-y-1.5">
                {value.screeningQuestions.map((question, idx) => (
                  <li
                    key={`${question}-${idx}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
                  >
                    <span className="font-semibold">
                      {idx + 1}. {question}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeQuestion(idx)}
                      aria-label={`Quitar pregunta ${idx + 1}`}
                      className="text-red-700 dark:text-red-400 hover:opacity-80 cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {availableQuestionSuggestions.length > 0 &&
              value.screeningQuestions.length < 8 && (
                <div className="flex flex-wrap gap-1.5">
                  {availableQuestionSuggestions.map((suggested) => (
                    <button
                      key={suggested}
                      type="button"
                      onClick={() => addQuestion(suggested)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" />
                      <span>{suggested}</span>
                    </button>
                  ))}
                </div>
              )}

            {value.screeningQuestions.length < 8 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={200}
                  value={newQuestionInput}
                  onChange={(e) => setNewQuestionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addQuestion(newQuestionInput);
                    }
                  }}
                  placeholder="Escribí una pregunta propia (ej: ¿Necesitás cochera o factura A?)"
                  className="flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => addQuestion(newQuestionInput)}
                  disabled={newQuestionInput.trim().length < 3}
                  className="btn-secondary-3d inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-extrabold disabled:opacity-45"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Agregar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paso C: Constructor personalizable de requisitos */}
      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs sm:text-sm font-extrabold">
              Requisitos personalizables de la solicitud ({requiredCount}{" "}
              obligatorios · {enabledCount} visibles)
            </h4>
            <p className="text-xs text-[var(--text-secondary)]">
              Activá, editá montos/condiciones o sumá tus propios requisitos
              (adelanto, depósito, gastos administrativos, respaldo para
              extranjeros, ingresos, contacto de emergencia, etc.).
            </p>
          </div>
        </div>

        <ul className="space-y-2.5">
          {value.requirements.map((req) => (
            <li
              key={req.id}
              className={`rounded-2xl border p-3.5 space-y-2.5 transition-colors ${
                req.enabled
                  ? "border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                  : "border-[var(--border-subtle)]/60 bg-[var(--bg-secondary)]/40 opacity-80"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2.5 text-xs sm:text-sm font-extrabold cursor-pointer flex-1 min-w-[200px]">
                  <input
                    type="checkbox"
                    checked={req.enabled}
                    onChange={(e) =>
                      updateRequirement(req.id, { enabled: e.target.checked })
                    }
                    className="h-4 w-4 accent-[var(--brand-primary)] shrink-0"
                  />
                  {req.isCustom ? (
                    <input
                      type="text"
                      maxLength={120}
                      value={req.label}
                      onChange={(e) =>
                        updateRequirement(req.id, { label: e.target.value })
                      }
                      aria-label={`Nombre del requisito ${req.label}`}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-extrabold"
                    />
                  ) : (
                    <span>{req.label}</span>
                  )}
                </label>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
                    {REQUIREMENT_CATEGORY_LABELS[req.category]}
                  </span>

                  {req.enabled && (
                    <button
                      type="button"
                      onClick={() =>
                        updateRequirement(req.id, { required: !req.required })
                      }
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold cursor-pointer ${
                        req.required
                          ? "bg-[var(--brand-primary)] text-white"
                          : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {req.required ? "Obligatorio" : "Opcional"}
                    </button>
                  )}

                  {req.isCustom && (
                    <button
                      type="button"
                      onClick={() => removeRequirement(req.id)}
                      aria-label={`Eliminar requisito ${req.label}`}
                      className="rounded-lg p-1 text-red-700 dark:text-red-400 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {req.enabled && (
                <div className="pl-6">
                  <input
                    type="text"
                    maxLength={320}
                    value={req.detail}
                    onChange={(e) =>
                      updateRequirement(req.id, { detail: e.target.value })
                    }
                    aria-label={`Detalle o monto para ${req.label}`}
                    placeholder="Personalizá cómo lo aplicás en tu propiedad (monto, porcentaje, documentos...)"
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* Botones rápidos para sumar otros requisitos frecuentes */}
        {availableExtraPresets.length > 0 && value.requirements.length < 15 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] mr-1">
              Sumar rápido:
            </span>
            {availableExtraPresets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => addPresetRequirement(preset)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-bold hover:border-[var(--brand-primary)] cursor-pointer"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Constructor de requisito personalizado */}
        {value.requirements.length < 15 && (
          <div>
            {!showCustomReqForm ? (
              <button
                type="button"
                onClick={() => setShowCustomReqForm(true)}
                className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Agregar requisito personalizado</span>
              </button>
            ) : (
              <div className="animate-ibita-fade-up rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 space-y-3">
                <p className="text-xs font-extrabold">
                  Nuevo requisito personalizado
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="custom-req-label"
                      className="block text-[11px] font-bold mb-1"
                    >
                      Nombre del requisito *
                    </label>
                    <input
                      id="custom-req-label"
                      type="text"
                      maxLength={120}
                      value={customReqLabel}
                      onChange={(e) => {
                        setCustomReqLabel(e.target.value);
                        setCustomReqError(null);
                      }}
                      placeholder="Ej: Sin mascotas o Seguro de caución"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="custom-req-category"
                      className="block text-[11px] font-bold mb-1"
                    >
                      Categoría
                    </label>
                    <select
                      id="custom-req-category"
                      value={customReqCategory}
                      onChange={(e) =>
                        setCustomReqCategory(
                          e.target.value as RequirementCategory
                        )
                      }
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
                    >
                      {REQUIREMENT_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {REQUIREMENT_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="custom-req-detail"
                    className="block text-[11px] font-bold mb-1"
                  >
                    Detalle, monto o aclaración
                  </label>
                  <input
                    id="custom-req-detail"
                    type="text"
                    maxLength={320}
                    value={customReqDetail}
                    onChange={(e) => setCustomReqDetail(e.target.value)}
                    placeholder="Ej: Se solicita constancia laboral o recibo de respaldo."
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customReqRequired}
                    onChange={(e) => setCustomReqRequired(e.target.checked)}
                    className="h-4 w-4 accent-[var(--brand-primary)]"
                  />
                  <span>Es obligatorio para confirmar la estadía</span>
                </label>

                {customReqError && (
                  <p className="text-xs font-bold text-red-700 dark:text-red-400">
                    {customReqError}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleAddCustomRequirement}
                    className="btn-primary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Agregar a la lista</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomReqForm(false);
                      setCustomReqError(null);
                    }}
                    className="btn-secondary-3d inline-flex min-h-[38px] items-center rounded-xl px-3 text-xs font-extrabold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

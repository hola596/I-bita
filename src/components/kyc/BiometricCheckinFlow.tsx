"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Copy,
  Loader2,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";
import type {
  BookingCheckinState,
  SanitizedVerificationSlotSummary,
} from "@/modules/consortium/actions";
import { compressAndValidateKycImage } from "@/lib/kyc/imageQuality";
import type {
  CompressedKycImage,
  LivenessCaptureMetadata,
  ParsedArgentineDni,
  VerifyIdentityApiResponse,
} from "@/lib/kyc/types";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { DniBarcodeScanner } from "./DniBarcodeScanner";
import { DniFrontCapture } from "./DniFrontCapture";
import {
  LiveSelfieCapture,
  type LiveSelfieCaptureResult,
} from "./LiveSelfieCapture";

export interface BiometricCheckinFlowProps {
  initialState: BookingCheckinState;
}

const ENABLE_KYC_MOCK =
  process.env.NEXT_PUBLIC_ENABLE_KYC_MOCK === "true";

async function createMockCanvasImage(
  kind: "dni-front" | "selfie",
  parsed: ParsedArgentineDni | null,
  slotId: string
): Promise<CompressedKycImage> {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = kind === "dni-front" ? "#0f172a" : "#064e3b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = kind === "dni-front" ? "#38bdf8" : "#34d399";
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(
      kind === "dni-front"
        ? "DNI FRENTE DE PRUEBA (QA MOCK)"
        : "SELFIE EN VIVO DE PRUEBA (QA MOCK)",
      36,
      62
    );

    ctx.font = "16px monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`Titular: ${parsed?.fullName ?? "ADULTO QA"}`, 36, 115);
    ctx.fillText(`DNI: ${parsed?.documentNumber ?? "38941205"}`, 36, 150);
    ctx.fillText(`Slot ID: ${slotId}`, 36, 185);
    ctx.fillText(`Evidencia: ${kind.toUpperCase()}`, 36, 220);

    ctx.beginPath();
    ctx.arc(
      kind === "dni-front" ? 500 : 490,
      210,
      kind === "dni-front" ? 58 : 66,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = kind === "dni-front" ? "#38bdf8" : "#10b981";
    ctx.fill();
  }

  return compressAndValidateKycImage(canvas, kind, {
    skipQualityCheck: true,
  });
}

function getFriendlySlotStatus(
  status: SanitizedVerificationSlotSummary["status"]
): string {
  if (status === "VERIFIED") return "Confirmado";
  if (status === "MANUAL_REVIEW") return "En revisión";
  if (status === "REJECTED") return "Revisar";
  return "Pendiente";
}

export function BiometricCheckinFlow({
  initialState,
}: BiometricCheckinFlowProps) {
  const { notify } = usePreferences();

  const [booking, setBooking] = useState(initialState.booking);
  const [slots, setSlots] = useState<SanitizedVerificationSlotSummary[]>(
    initialState.slots
  );
  const [selectedToken, setSelectedToken] = useState<string>(
    initialState.activeSlot?.inviteToken ??
      initialState.slots[0]?.inviteToken ??
      ""
  );
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  const activeSlot = useMemo(
    () =>
      slots.find((s) => s.inviteToken === selectedToken) ?? slots[0] ?? null,
    [slots, selectedToken]
  );

  const defaultMockIdx = useMemo(() => {
    const idx = (activeSlot?.slotIndex ?? 1) - 1;
    return Math.max(0, Math.min(idx, 2));
  }, [activeSlot?.slotIndex]);

  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<string | null>(
    null
  );

  const [pdf417RawPayload, setPdf417RawPayload] = useState("");
  const [parsedDni, setParsedDni] = useState<ParsedArgentineDni | null>(null);

  const [dniFrontImage, setDniFrontImage] =
    useState<CompressedKycImage | null>(null);
  const [liveSelfie, setLiveSelfie] = useState<LiveSelfieCaptureResult | null>(
    null
  );
  const [usingMockEvidence, setUsingMockEvidence] = useState(false);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<{
    status: "idle" | "submitting" | "verified" | "manual_review" | "rejected";
    message?: string;
    similarityScore?: number;
    livenessScore?: number;
    auditHash?: string;
  }>({ status: "idle" });

  function resetSlotEvidence() {
    if (dniFrontImage?.previewUrl) {
      URL.revokeObjectURL(dniFrontImage.previewUrl);
    }
    if (liveSelfie?.image.previewUrl) {
      URL.revokeObjectURL(liveSelfie.image.previewUrl);
    }
    setPdf417RawPayload("");
    setParsedDni(null);
    setDniFrontImage(null);
    setLiveSelfie(null);
    setUsingMockEvidence(false);
    setSubmitState({ status: "idle" });
  }

  async function handleSelectSlot(slot: SanitizedVerificationSlotSummary) {
    setSelectedToken(slot.inviteToken);
    setWizardStep(1);
    setConsentAccepted(false);
    setConsentAcceptedAt(null);
    resetSlotEvidence();
    notify(
      `Ahora estás viendo el paso de ${
        slot.isPrimaryGuest
          ? "la persona titular"
          : `el acompañante #${slot.slotIndex}`
      }.`,
      "info",
      "user"
    );
  }

  async function handleCopyInviteLink(slot: SanitizedVerificationSlotSummary) {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${slot.checkinPath}`
        : slot.checkinPath;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Continuar con notificación
    }
    setCopiedToken(slot.inviteToken);
    notify("Link copiado para compartir con tu acompañante.", "success", "check");
    window.setTimeout(() => setCopiedToken(null), 2500);
  }

  async function handleGenerateMockEvidences() {
    if (!ENABLE_KYC_MOCK || !activeSlot) return;

    const [front, selfie] = await Promise.all([
      createMockCanvasImage("dni-front", parsedDni, activeSlot.id),
      createMockCanvasImage("selfie", parsedDni, activeSlot.id),
    ]);

    const mockLiveness: LivenessCaptureMetadata = {
      mode: "mock-test-mode",
      challenges: [
        {
          type: "TURN_LEFT",
          label: "QA Mock Head Yaw",
          completedAt: new Date().toISOString(),
          peakMetric: 16,
        },
        {
          type: "BLINK",
          label: "QA Mock Blink",
          completedAt: new Date().toISOString(),
          peakMetric: 0.72,
        },
      ],
      faceCountAtCapture: 1,
      yawAtCaptureDeg: 1.5,
      capturedAt: new Date().toISOString(),
    };

    setDniFrontImage(front);
    setLiveSelfie({ image: selfie, liveness: mockLiveness });
    setUsingMockEvidence(true);
    notify("Preparamos las dos imágenes de prueba (modo QA).", "info", "sparkle");
  }

  async function handleSubmitBiometrics(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeSlot || !consentAccepted || !parsedDni || !dniFrontImage || !liveSelfie) {
      return;
    }

    setSubmitState({ status: "submitting" });

    try {
      const formData = new FormData();
      formData.append("bookingId", booking.id);
      formData.append("inviteToken", activeSlot.inviteToken);
      formData.append("consentAccepted", "true");
      formData.append(
        "consentAcceptedAt",
        consentAcceptedAt ?? new Date().toISOString()
      );
      formData.append("pdf417RawPayload", pdf417RawPayload);
      formData.append("livenessMetadata", JSON.stringify(liveSelfie.liveness));
      formData.append("dni_front", dniFrontImage.file);
      formData.append("selfie", liveSelfie.image.file);

      if (ENABLE_KYC_MOCK && usingMockEvidence) {
        formData.append("mockMode", "true");
      }

      const response = await fetch("/api/checkin/verify-identity", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as VerifyIdentityApiResponse;

      if (data.slot) {
        setSlots((prev) =>
          prev.map((s) =>
            s.inviteToken === data.slot!.inviteToken
              ? { ...data.slot!, slotIndex: s.slotIndex }
              : s
          )
        );
      }

      if (
        typeof data.verifiedAdultsCount === "number" &&
        typeof data.declaredAdultsCount === "number" &&
        typeof data.bookingStatus === "string" &&
        typeof data.allAdultsVerified === "boolean"
      ) {
        setBooking((prev) => ({
          ...prev,
          verifiedAdultsCount: data.verifiedAdultsCount!,
          declaredAdultsCount: data.declaredAdultsCount!,
          status: data.bookingStatus!,
          allAdultsVerified: data.allAdultsVerified!,
          accessCodeLocked: !data.allAdultsVerified,
        }));
      }

      if (!data.ok) {
        setSubmitState({
          status: "rejected",
          message: data.error.message,
          similarityScore: data.similarityScore,
          livenessScore: data.livenessScore,
        });
        return;
      }

      setSubmitState({
        status: data.status,
        message: data.message,
        similarityScore: data.similarityScore,
        livenessScore: data.livenessScore,
        auditHash: data.auditHash,
      });

      if (data.status === "manual_review") {
        notify(
          "Tu verificación quedó en revisión rápida por zona intermedia.",
          "info",
          "shield"
        );
      } else {
        notify(
          data.allAdultsVerified
            ? "¡Grupo 100% confirmado! Recargá la página para ver tu clave de entrada."
            : "¡Identidad aprobada! Podés seguir con la siguiente persona.",
          "celebration",
          "trophy"
        );
      }
    } catch {
      setSubmitState({
        status: "rejected",
        message:
          "No pudimos comunicarnos con el servidor de verificación. Revisá tu conexión e intentá nuevamente.",
      });
    }
  }

  const progressPct = Math.min(
    100,
    Math.round(
      (booking.verifiedAdultsCount / Math.max(1, booking.declaredAdultsCount)) *
        100
    )
  );

  const goToStep = (nextStep: 1 | 2 | 3) => {
    setWizardStep(nextStep);
    setSubmitState((prev) =>
      prev.status === "rejected" ? { status: "idle" } : prev
    );
  };

  return (
    <div className="space-y-6">
      {/* Progreso del grupo */}
      <section
        aria-labelledby="group-progress-heading"
        className="surface-card p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon3D name="shield" size="md" />
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {initialState.consortium?.consortiumName ??
                  "Consorcio verificado"}
              </span>
              <h2
                id="group-progress-heading"
                className="text-xl sm:text-2xl font-extrabold tracking-tight"
              >
                Huéspedes confirmados:{" "}
                <span className="text-[var(--brand-primary)]">
                  {booking.verifiedAdultsCount} de{" "}
                  {booking.declaredAdultsCount}
                </span>{" "}
                ({progressPct}%)
              </h2>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold ${
              booking.allAdultsVerified
                ? "badge-consorcio-friendly"
                : "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40"
            }`}
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {booking.allAdultsVerified
              ? "Grupo 100% confirmado"
              : "Faltan personas por confirmar"}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={booking.verifiedAdultsCount}
          aria-valuemin={0}
          aria-valuemax={booking.declaredAdultsCount}
          aria-label="Adultos con identidad confirmada"
          className="h-3.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
        >
          <div
            className="h-full bg-emerald-600 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {booking.allAdultsVerified ? (
          <AchievementBanner
            icon="trophy"
            tone="emerald"
            title="¡Todas las personas del viaje están confirmadas!"
            description="El edificio ya tiene su pase listo y podés ver tu clave de acceso en la tarjeta de abajo."
          />
        ) : (
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Elegí a una persona de la lista para completar sus 3 pasos o
            compartile su link personal para que lo haga desde su propio
            teléfono.
          </p>
        )}

        {/* Tarjetas simétricas de huéspedes adultos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {slots.map((slot) => {
            const isSelected = slot.inviteToken === activeSlot?.inviteToken;
            const isVerified = slot.status === "VERIFIED";
            const isManualReview = slot.status === "MANUAL_REVIEW";

            return (
              <div
                key={slot.id}
                className={`rounded-2xl border p-4 transition-all space-y-3 ${
                  isSelected
                    ? "border-[var(--brand-primary)] bg-[var(--bg-primary)] ring-2 ring-[var(--brand-primary)]/20"
                    : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {slot.isPrimaryGuest
                      ? `Adulto #${slot.slotIndex} (Titular)`
                      : `Adulto #${slot.slotIndex} (Acompañante)`}
                  </span>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                      isVerified
                        ? "badge-consorcio-friendly"
                        : isManualReview
                          ? "bg-sky-500/15 text-sky-900 dark:text-sky-200 border border-sky-500/40"
                          : slot.status === "REJECTED"
                            ? "bg-red-100 text-red-900"
                            : "bg-amber-500/20 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    {getFriendlySlotStatus(slot.status)}
                  </span>
                </div>

                {isVerified || isManualReview ? (
                  <div className="text-xs space-y-0.5">
                    <p className="font-extrabold text-[var(--text-primary)] truncate">
                      {slot.fullNameExtracted}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                      DNI {slot.maskedDocumentNumber}
                      {slot.biometricConfidenceScore !== null
                        ? ` · Similitud ${slot.biometricConfidenceScore}%`
                        : ""}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Falta validar su DNI y selfie en vivo.
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                      isSelected ? "btn-primary-3d" : "btn-secondary-3d"
                    }`}
                  >
                    {isVerified
                      ? "Ver ficha"
                      : isSelected
                        ? "Completando ahora"
                        : "Completar este"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyInviteLink(slot)}
                    title="Copiar link personal para invitar a esta persona"
                    className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold"
                  >
                    {copiedToken === slot.inviteToken ? (
                      <>
                        <Check
                          className="h-3.5 w-3.5 text-emerald-600"
                          aria-hidden="true"
                        />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Enviar link</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Asistente progresivo de 3 pasos para el adulto elegido */}
      {activeSlot && (
        <form onSubmit={handleSubmitBiometrics} className="space-y-6">
          <div className="surface-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">
                Validando a:{" "}
                <span className="text-[var(--brand-primary)]">
                  Adulto #{activeSlot.slotIndex} (
                  {activeSlot.isPrimaryGuest ? "Titular" : "Acompañante"})
                </span>
              </p>
              <span className="text-xs font-bold text-[var(--text-secondary)]">
                Paso {wizardStep} de 3
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { step: 1 as const, label: "1. Tu permiso" },
                { step: 2 as const, label: "2. Tu DNI" },
                { step: 3 as const, label: "3. Foto y selfie" },
              ].map((item) => {
                const isCurrent = wizardStep === item.step;
                const isDone =
                  (item.step === 1 && consentAccepted && wizardStep > 1) ||
                  (item.step === 2 && Boolean(parsedDni) && wizardStep > 2);

                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => {
                      if (item.step === 1) goToStep(1);
                      if (item.step === 2 && consentAccepted) goToStep(2);
                      if (item.step === 3 && consentAccepted && parsedDni) {
                        goToStep(3);
                      }
                    }}
                    aria-current={isCurrent ? "step" : undefined}
                    className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                      isCurrent
                        ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                        : isDone
                          ? "border-emerald-600/40 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]"
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {isDone ? `✓ ${item.label}` : item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PASO 1: Consentimiento Ley 25.326 */}
          {wizardStep === 1 && (
            <section
              aria-labelledby="step1-consent-heading"
              className="surface-card animate-ibita-fade-up p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center gap-3.5">
                <Icon3D name="shield" size="md" />
                <div>
                  <span className="text-xs font-extrabold text-[var(--brand-primary)]">
                    PASO 1 DE 3
                  </span>
                  <h3
                    id="step1-consent-heading"
                    className="text-lg sm:text-xl font-extrabold"
                  >
                    Tu permiso para cuidar tus datos
                  </h3>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 sm:p-5 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={consentAccepted}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConsentAccepted(checked);
                    setConsentAcceptedAt(
                      checked ? new Date().toISOString() : null
                    );
                  }}
                  className="mt-1 h-5 w-5 accent-[var(--brand-primary)] shrink-0"
                />
                <span className="text-xs sm:text-sm leading-relaxed text-[var(--text-primary)]">
                  <strong>
                    Autorizo el uso biométrico de mi DNI y mi selfie en vivo
                    únicamente para validar mi identidad e ingreso
                  </strong>{" "}
                  ante el consorcio{" "}
                  <strong>
                    {initialState.consortium?.consortiumName ??
                      booking.propertyTitle}
                  </strong>{" "}
                  conforme a la Ley 25.326. Las imágenes crudas se almacenan de
                  forma privada y se eliminan automáticamente entre 24 y 72 hs
                  después de completar la auditoría.
                </span>
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={!consentAccepted}
                  onClick={() => goToStep(2)}
                  className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold disabled:opacity-50"
                >
                  <span>Sí, autorizo y sigo al paso 2</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          {/* PASO 2: Escáner PDF417 con zxing-wasm */}
          {wizardStep === 2 && (
            <section
              aria-labelledby="step2-pdf417-heading"
              className="surface-card animate-ibita-fade-up p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center gap-3.5">
                <Icon3D name="card" size="md" />
                <div>
                  <span className="text-xs font-extrabold text-[var(--brand-primary)]">
                    PASO 2 DE 3
                  </span>
                  <h3
                    id="step2-pdf417-heading"
                    className="text-lg sm:text-xl font-extrabold"
                  >
                    Leemos el código de barras de tu DNI
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    Escanealo en tiempo real con la cámara o subí una foto nítida
                    del código PDF417 del DNI tarjeta argentino.
                  </p>
                </div>
              </div>

              <DniBarcodeScanner
                value={parsedDni}
                rawPayload={pdf417RawPayload}
                enableMock={ENABLE_KYC_MOCK}
                defaultMockIndex={defaultMockIdx}
                onDecoded={(parsed, raw) => {
                  setParsedDni(parsed);
                  setPdf417RawPayload(raw);
                }}
                onNotify={(msg, tone) =>
                  notify(msg, tone === "success" ? "success" : "info", "card")
                }
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="btn-secondary-3d inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Paso anterior</span>
                </button>

                <button
                  type="button"
                  disabled={!parsedDni}
                  onClick={() => goToStep(3)}
                  className="btn-primary-3d inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold disabled:opacity-50"
                >
                  <span>Continuar al paso 3</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          {/* PASO 3: Frente del DNI + Selfie en vivo con MediaPipe Liveness */}
          {wizardStep === 3 && (
            <section
              aria-labelledby="step3-biometric-heading"
              className="surface-card animate-ibita-fade-up p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center gap-3.5">
                <Icon3D name="face" size="md" />
                <div>
                  <span className="text-xs font-extrabold text-[var(--brand-primary)]">
                    PASO 3 DE 3
                  </span>
                  <h3
                    id="step3-biometric-heading"
                    className="text-lg sm:text-xl font-extrabold"
                  >
                    Frente de tu DNI + Selfie en vivo
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    Optimizamos cada imagen automáticamente en tu dispositivo y
                    validamos prueba de vida real sin exponer tus fotos.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DniFrontCapture
                  value={dniFrontImage}
                  onChange={(img) => {
                    setDniFrontImage(img);
                    setUsingMockEvidence(false);
                  }}
                  onNotify={(msg, tone) =>
                    notify(msg, tone === "success" ? "success" : "info", "card")
                  }
                />

                <LiveSelfieCapture
                  value={liveSelfie}
                  onCaptured={(result) => {
                    setLiveSelfie(result);
                    setUsingMockEvidence(false);
                  }}
                  onNotify={(msg, tone) =>
                    notify(msg, tone === "success" ? "success" : "info", "face")
                  }
                />
              </div>

              {/* Solo visible cuando NEXT_PUBLIC_ENABLE_KYC_MOCK === "true" */}
              {ENABLE_KYC_MOCK && (
                <ProgressiveDisclosure
                  icon="sparkle"
                  title="Modo QA · Usar imágenes de prueba"
                  subtitle="Disponible únicamente en entornos con NEXT_PUBLIC_ENABLE_KYC_MOCK=true."
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-[var(--text-secondary)]">
                      Generá ambas capturas de muestra comprimidas (&lt; 300 KB)
                      para pruebas automatizadas sin cámara.
                    </p>
                    <button
                      type="button"
                      onClick={handleGenerateMockEvidences}
                      className="btn-secondary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                    >
                      <Sparkles
                        className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                        aria-hidden="true"
                      />
                      <span>Usar imágenes de prueba</span>
                    </button>
                  </div>
                </ProgressiveDisclosure>
              )}

              {submitState.status === "rejected" && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl bg-red-100 text-red-900 p-4 text-xs font-bold"
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{submitState.message}</span>
                </div>
              )}

              {submitState.status === "manual_review" && (
                <div
                  role="status"
                  className="flex items-start gap-2.5 rounded-2xl border border-sky-500/40 bg-sky-500/12 text-sky-950 dark:text-sky-100 p-4 text-xs font-bold"
                >
                  <Clock
                    className="h-4 w-4 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300"
                    aria-hidden="true"
                  />
                  <div className="space-y-1">
                    <p className="font-extrabold">
                      Verificación en revisión manual
                    </p>
                    <p>{submitState.message}</p>
                  </div>
                </div>
              )}

              {submitState.status === "verified" && (
                <AchievementBanner
                  icon="trophy"
                  tone="emerald"
                  title={`¡Identidad confirmada! (Similitud ${Math.round(
                    (submitState.similarityScore ?? 0) * 100
                  )}% · Vida ${Math.round(
                    (submitState.livenessScore ?? 0) * 100
                  )}%)`}
                  description={submitState.message ?? "Ya podés continuar."}
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="btn-secondary-3d inline-flex min-h-[50px] items-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Paso anterior</span>
                </button>

                <button
                  type="submit"
                  disabled={
                    !consentAccepted ||
                    !parsedDni ||
                    !dniFrontImage ||
                    !liveSelfie ||
                    submitState.status === "submitting"
                  }
                  className="btn-primary-3d inline-flex min-h-[50px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold disabled:opacity-50"
                >
                  {submitState.status === "submitting" ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      <span>Auditando biometría en vivo...</span>
                    </>
                  ) : (
                    <span>
                      Confirmar identidad de Adulto #{activeSlot.slotIndex}
                    </span>
                  )}
                </button>
              </div>
            </section>
          )}
        </form>
      )}
    </div>
  );
}

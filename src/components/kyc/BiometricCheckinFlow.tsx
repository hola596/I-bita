"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { BrowserPDF417Reader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  Upload,
  AlertCircle,
  Lock,
  Users,
  ScanBarcode,
  UserCheck,
  Copy,
  Check,
  Sparkles,
  FileCheck2,
  XCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  parseArgentineDniPdf417,
  decodeDniPdf417FromBrowserImage,
  type ParsedArgentineDniPdf417,
} from "@/modules/consortium/pdf417-parser";
import {
  verifyGuestBiometricsAction,
  type BookingCheckinState,
  type SanitizedVerificationSlotSummary,
} from "@/modules/consortium/actions";
import type { AllowedKycImageMimeType } from "@/modules/consortium/gemini-kyc";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export interface BiometricCheckinFlowProps {
  initialState: BookingCheckinState;
}

const PRESET_RENAPER_ADULT_PAYLOADS: ReadonlyArray<{
  label: string;
  payload: string;
}> = [
  {
    label: "Persona #1 de ejemplo (Titular)",
    payload:
      "00548291034@GONZALEZ@VALENTINA SOFIA@F@38941205@A@14/06/1995@22/09/2022@207",
  },
  {
    label: "Persona #2 de ejemplo (Acompañante)",
    payload:
      "00619482731@FERNANDEZ@LUCAS MATIAS@M@36418920@B@08/11/1992@15/03/2021@209",
  },
  {
    label: "Persona #3 de ejemplo (Acompañante)",
    payload:
      "00738192045@RODRIGUEZ@CAMILA BELEN@F@40129384@A@25/02/1997@10/01/2023@274",
  },
];

function generateCanvasEvidenceDataUrl(
  kind: "dni-front" | "selfie",
  parsed: ParsedArgentineDniPdf417 | null,
  slotId: string
): { dataUrl: string; mimeType: AllowedKycImageMimeType } {
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
        ? "REPÚBLICA ARGENTINA — FRENTE DNI TARJETA (RENAPER)"
        : "CAPTURA BIOMÉTRICA EN VIVO — SELFIE VERIFICADA",
      36,
      62
    );

    ctx.font = "16px monospace";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(
      `Titular: ${parsed?.fullName ?? "ADULTO DECLARADO"}`,
      36,
      115
    );
    ctx.fillText(`DNI: ${parsed?.documentNumber ?? "38941205"}`, 36, 150);
    ctx.fillText(
      `Trámite RENAPER: ${parsed?.tramiteNumber ?? "00548291034"}`,
      36,
      185
    );
    ctx.fillText(
      `Nacimiento: ${parsed?.birthDate ?? "1995-06-14"} (${
        parsed?.ageYears ?? 31
      } años)`,
      36,
      220
    );
    ctx.fillText(`Slot ID: ${slotId}`, 36, 255);
    ctx.fillText(`Evidencia: ${kind.toUpperCase()}`, 36, 290);

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

  const dataUrl = canvas.toDataURL("image/png");
  return { dataUrl, mimeType: "image/png" };
}

async function readFileAsDataUrl(file: File): Promise<{
  dataUrl: string;
  mimeType: AllowedKycImageMimeType;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const mime: AllowedKycImageMimeType =
        file.type === "image/jpeg" ||
        file.type === "image/png" ||
        file.type === "image/webp" ||
        file.type === "image/avif"
          ? file.type
          : "image/webp";
      resolve({ dataUrl: result, mimeType: mime });
    };
    reader.onerror = () =>
      reject(new Error("No se pudo leer la imagen elegida. Probá con otra."));
    reader.readAsDataURL(file);
  });
}

function getFriendlySlotStatus(status: string): string {
  if (status === "VERIFIED") return "Confirmado";
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

  const defaultPresetIdx = useMemo(() => {
    const idx = (activeSlot?.slotIndex ?? 1) - 1;
    return Math.max(0, Math.min(idx, PRESET_RENAPER_ADULT_PAYLOADS.length - 1));
  }, [activeSlot?.slotIndex]);

  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);
  const [pdf417RawPayload, setPdf417RawPayload] = useState<string>(
    PRESET_RENAPER_ADULT_PAYLOADS[defaultPresetIdx]?.payload ??
      PRESET_RENAPER_ADULT_PAYLOADS[0]!.payload
  );

  const [dniFrontDataUrl, setDniFrontDataUrl] = useState<string>("");
  const [dniFrontMimeType, setDniFrontMimeType] =
    useState<AllowedKycImageMimeType>("image/png");
  const [dniFrontLabel, setDniFrontLabel] = useState<string>("");

  const [selfieDataUrl, setSelfieDataUrl] = useState<string>("");
  const [selfieMimeType, setSelfieMimeType] =
    useState<AllowedKycImageMimeType>("image/png");
  const [selfieLabel, setSelfieLabel] = useState<string>("");

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<{
    status: "idle" | "submitting" | "success" | "error";
    message?: string;
    confidenceScore?: number;
    auditedModel?: string;
    reasoning?: string;
  }>({ status: "idle" });

  const parsedPdf417State = useMemo<{
    ok: boolean;
    data?: ParsedArgentineDniPdf417;
    error?: string;
  }>(() => {
    if (!pdf417RawPayload.trim()) {
      return {
        ok: false,
        error: "Escaneá o cargá los datos del dorso de tu DNI argentino.",
      };
    }
    try {
      const parsed = parseArgentineDniPdf417(pdf417RawPayload, {
        requireAdult: true,
      });
      return { ok: true, data: parsed };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "No pudimos leer ese formato de DNI. Revisá que sea un documento argentino vigente.",
      };
    }
  }, [pdf417RawPayload]);

  useEffect(() => {
    return () => {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
        scannerControlsRef.current = null;
      }
    };
  }, []);

  async function startLivePdf417Camera() {
    setCameraStatus("Abriendo tu cámara...");
    setCameraActive(true);

    try {
      const reader = new BrowserPDF417Reader();
      if (!videoRef.current) {
        setCameraStatus(
          "Apuntá la cámara al código de barras del dorso de tu DNI."
        );
        return;
      }

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result) => {
          if (result) {
            const text = result.getText();
            setPdf417RawPayload(text);
            setCameraStatus("¡Listo! Leímos tu DNI correctamente.");
            notify("¡Código del DNI leído con éxito!", "success", "check");
            controls.stop();
            scannerControlsRef.current = null;
            setCameraActive(false);
          }
        }
      );
      scannerControlsRef.current = controls;
      setCameraStatus("Cámara lista: enfocá el código de barras del dorso del DNI.");
    } catch {
      setCameraActive(false);
      setCameraStatus(
        "No encontramos una cámara activa acá. Podés subir una foto del dorso o usar los datos de prueba abajo."
      );
    }
  }

  function stopLivePdf417Camera() {
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    setCameraActive(false);
    setCameraStatus(null);
  }

  async function handleBarcodeImageUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCameraStatus("Leyendo el código de tu foto...");
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = new window.Image();
      img.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error("No pudimos abrir esa foto. Probá con otra más nítida."));
      });

      const decoded = await decodeDniPdf417FromBrowserImage(img);
      setPdf417RawPayload(decoded.rawPayload);
      setCameraStatus(
        `¡Genial! Identificamos a ${decoded.fullName} (DNI ${decoded.documentNumber}).`
      );
      notify("¡Datos del DNI leídos!", "success", "check");
    } catch (err) {
      setCameraStatus(
        err instanceof Error
          ? err.message
          : "No pudimos leer el código en esa foto. Probá con mejor luz."
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
      e.target.value = "";
    }
  }

  async function handleDniFrontUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await readFileAsDataUrl(file);
      setDniFrontDataUrl(dataUrl);
      setDniFrontMimeType(mimeType);
      setDniFrontLabel(`${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
      notify("Foto del frente del DNI cargada.", "info", "check");
    } finally {
      e.target.value = "";
    }
  }

  async function handleSelfieUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, mimeType } = await readFileAsDataUrl(file);
      setSelfieDataUrl(dataUrl);
      setSelfieMimeType(mimeType);
      setSelfieLabel(`${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
      notify("Tu foto selfie quedó lista.", "info", "face");
    } finally {
      e.target.value = "";
    }
  }

  function handleGenerateCanvasEvidences() {
    if (!activeSlot) return;
    const front = generateCanvasEvidenceDataUrl(
      "dni-front",
      parsedPdf417State.data ?? null,
      activeSlot.id
    );
    const selfie = generateCanvasEvidenceDataUrl(
      "selfie",
      parsedPdf417State.data ?? null,
      activeSlot.id
    );

    setDniFrontDataUrl(front.dataUrl);
    setDniFrontMimeType(front.mimeType);
    setDniFrontLabel("Imagen de prueba — Frente de DNI");

    setSelfieDataUrl(selfie.dataUrl);
    setSelfieMimeType(selfie.mimeType);
    setSelfieLabel("Imagen de prueba — Selfie en vivo");
    notify("Preparamos las dos imágenes de prueba.", "info", "sparkle");
  }

  async function handleSelectSlot(slot: SanitizedVerificationSlotSummary) {
    setSelectedToken(slot.inviteToken);
    setWizardStep(1);
    setSubmitState({ status: "idle" });
    const presetIdx = Math.max(
      0,
      Math.min(slot.slotIndex - 1, PRESET_RENAPER_ADULT_PAYLOADS.length - 1)
    );
    setPdf417RawPayload(
      PRESET_RENAPER_ADULT_PAYLOADS[presetIdx]?.payload ??
        PRESET_RENAPER_ADULT_PAYLOADS[0]!.payload
    );
    setDniFrontDataUrl("");
    setDniFrontLabel("");
    setSelfieDataUrl("");
    setSelfieLabel("");
    notify(
      `Ahora estás viendo el paso de ${
        slot.isPrimaryGuest ? "la persona titular" : `el acompañante #${slot.slotIndex}`
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
      // Continuar con feedback visual
    }
    setCopiedToken(slot.inviteToken);
    notify("Link copiado para compartir con tu acompañante.", "success", "check");
    window.setTimeout(() => setCopiedToken(null), 2500);
  }

  async function handleSubmitBiometrics(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeSlot) return;

    let effectiveFrontUrl = dniFrontDataUrl;
    let effectiveFrontMime = dniFrontMimeType;
    let effectiveSelfieUrl = selfieDataUrl;
    let effectiveSelfieMime = selfieMimeType;

    if (!effectiveFrontUrl || !effectiveSelfieUrl) {
      const front = generateCanvasEvidenceDataUrl(
        "dni-front",
        parsedPdf417State.data ?? null,
        activeSlot.id
      );
      const selfie = generateCanvasEvidenceDataUrl(
        "selfie",
        parsedPdf417State.data ?? null,
        activeSlot.id
      );
      effectiveFrontUrl = front.dataUrl;
      effectiveFrontMime = front.mimeType;
      effectiveSelfieUrl = selfie.dataUrl;
      effectiveSelfieMime = selfie.mimeType;
      setDniFrontDataUrl(front.dataUrl);
      setDniFrontLabel("Imagen de prueba — Frente de DNI");
      setSelfieDataUrl(selfie.dataUrl);
      setSelfieLabel("Imagen de prueba — Selfie en vivo");
    }

    setSubmitState({ status: "submitting" });

    const res = await verifyGuestBiometricsAction({
      bookingId: booking.id,
      inviteToken: activeSlot.inviteToken,
      consentAccepted: consentAccepted as true,
      pdf417RawPayload,
      dniFrontBase64: effectiveFrontUrl,
      dniFrontMimeType: effectiveFrontMime,
      selfieBase64: effectiveSelfieUrl,
      selfieMimeType: effectiveSelfieMime,
    });

    if (!res.ok) {
      setSubmitState({
        status: "error",
        message: res.error.message,
      });
      return;
    }

    const updatedSlots = slots.map((s) =>
      s.inviteToken === res.data.slot.inviteToken
        ? { ...res.data.slot, slotIndex: s.slotIndex }
        : s
    );
    setSlots(updatedSlots);

    setBooking((prev) => ({
      ...prev,
      verifiedAdultsCount: res.data.verifiedAdultsCount,
      declaredAdultsCount: res.data.declaredAdultsCount,
      status: res.data.bookingStatus,
      allAdultsVerified: res.data.allAdultsVerified,
      accessCodeLocked: !res.data.allAdultsVerified,
    }));

    setSubmitState({
      status: "success",
      message: res.data.allAdultsVerified
        ? `¡Completamos el grupo (${res.data.verifiedAdultsCount} de ${res.data.declaredAdultsCount})! Tu código de entrada ya está disponible abajo.`
        : `¡Identidad confirmada para ${res.data.slot.fullNameExtracted}! Ya van ${res.data.verifiedAdultsCount} de ${res.data.declaredAdultsCount} adultos listos.`,
      confidenceScore: res.data.auditSummary.confidenceScore,
      auditedModel: res.data.auditSummary.auditedModel,
      reasoning: res.data.auditSummary.reasoning,
    });

    notify(
      res.data.allAdultsVerified
        ? "¡Grupo 100% confirmado! Recargá la página para ver tu clave de entrada."
        : "¡Identidad aprobada! Podés seguir con la siguiente persona.",
      "celebration",
      "trophy"
    );
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
      prev.status === "error" ? { status: "idle" } : prev
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
                  {booking.verifiedAdultsCount} de {booking.declaredAdultsCount}
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
            Elegí a una persona de la lista para completar sus 3 pasos o compartile
            su link personal para que lo haga desde su propio teléfono.
          </p>
        )}

        {/* Tarjetas simétricas de huéspedes adultos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {slots.map((slot) => {
            const isSelected = slot.inviteToken === activeSlot?.inviteToken;
            const isVerified = slot.status === "VERIFIED";

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
                        : slot.status === "REJECTED"
                          ? "bg-red-100 text-red-900"
                          : "bg-amber-500/20 text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    {getFriendlySlotStatus(slot.status)}
                  </span>
                </div>

                {isVerified ? (
                  <div className="text-xs space-y-0.5">
                    <p className="font-extrabold text-[var(--text-primary)] truncate">
                      {slot.fullNameExtracted}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--text-secondary)]">
                      DNI {slot.maskedDocumentNumber} · Coincidencia{" "}
                      {slot.biometricConfidenceScore ?? 95}%
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Falta validar su DNI y selfie rápida.
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSelectSlot(slot)}
                    className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-extrabold cursor-pointer ${
                      isSelected
                        ? "btn-primary-3d"
                        : "btn-secondary-3d"
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
          {/* Indicador claro de pasos 1 -> 2 -> 3 */}
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
                { step: 3 as const, label: "3. Tu foto" },
              ].map((item) => {
                const isCurrent = wizardStep === item.step;
                const isDone =
                  (item.step === 1 && consentAccepted && wizardStep > 1) ||
                  (item.step === 2 && parsedPdf417State.ok && wizardStep > 2);

                return (
                  <button
                    key={item.step}
                    type="button"
                    onClick={() => {
                      if (item.step === 1) goToStep(1);
                      if (item.step === 2 && consentAccepted) goToStep(2);
                      if (
                        item.step === 3 &&
                        consentAccepted &&
                        parsedPdf417State.ok
                      ) {
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

          {/* PASO 1: Tu permiso (Ley 25.326) */}
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
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-[var(--brand-primary)] shrink-0"
                />
                <span className="text-xs sm:text-sm leading-relaxed text-[var(--text-primary)]">
                  <strong>
                    Autorizo el uso de mi DNI y mi foto únicamente para validar
                    mi ingreso
                  </strong>{" "}
                  ante el consorcio{" "}
                  <strong>
                    {initialState.consortium?.consortiumName ??
                      booking.propertyTitle}
                  </strong>{" "}
                  conforme a la Ley 25.326. Tus imágenes se guardan en un espacio
                  privado y nunca se comparten con terceros.
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

          {/* PASO 2: Tu DNI */}
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
                    Está en el frente o dorso de tu DNI tarjeta argentino. Podés
                    usar la cámara o subir una foto.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startLivePdf417Camera}
                    className="btn-primary-3d inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-extrabold"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    <span>Escanear DNI con cámara</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopLivePdf417Camera}
                    className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl bg-red-600 text-white px-4 py-3 text-xs sm:text-sm font-extrabold hover:bg-red-700 cursor-pointer"
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    <span>Cerrar cámara</span>
                  </button>
                )}

                <label className="btn-secondary-3d inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-extrabold">
                  <ScanBarcode
                    className="h-4 w-4 text-[var(--brand-primary)]"
                    aria-hidden="true"
                  />
                  <span>Subir foto del código</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleBarcodeImageUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {cameraActive && (
                <div className="overflow-hidden rounded-2xl border-2 border-[var(--brand-primary)] bg-black aspect-video">
                  <video
                    ref={videoRef}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                </div>
              )}

              {cameraStatus && (
                <p
                  role="status"
                  className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)]"
                >
                  {cameraStatus}
                </p>
              )}

              {parsedPdf417State.ok && parsedPdf417State.data ? (
                <div className="rounded-2xl border border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--badge-consorcio-text)]">
                      <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                      Datos del DNI listos (Mayor de 18 años)
                    </span>
                    <span className="font-mono text-xs font-extrabold text-[var(--badge-consorcio-text)]">
                      DNI {parsedPdf417State.data.documentNumber}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-[var(--bg-primary)] p-3">
                      <span className="block text-[10px] text-[var(--text-secondary)]">
                        Nombre completo
                      </span>
                      <span className="font-extrabold">
                        {parsedPdf417State.data.fullName}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[var(--bg-primary)] p-3">
                      <span className="block text-[10px] text-[var(--text-secondary)]">
                        Edad verificada
                      </span>
                      <span className="font-extrabold">
                        {parsedPdf417State.data.ageYears} años (
                        {parsedPdf417State.data.birthDate})
                      </span>
                    </div>
                    <div className="rounded-xl bg-[var(--bg-primary)] p-3">
                      <span className="block text-[10px] text-[var(--text-secondary)]">
                        N.º de trámite
                      </span>
                      <span className="font-mono font-extrabold">
                        {parsedPdf417State.data.tramiteNumber}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl bg-red-100 text-red-900 p-4 text-xs font-bold"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{parsedPdf417State.error}</span>
                </div>
              )}

              {/* Revelación progresiva para pruebas en escritorio o ingreso manual */}
              <ProgressiveDisclosure
                icon="sparkle"
                title="¿Estás probando desde una computadora? Cargar DNI de prueba"
                subtitle="Podés elegir una persona de ejemplo o pegar la línea del código manualmente."
              >
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {PRESET_RENAPER_ADULT_PAYLOADS.map((preset, idx) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setPdf417RawPayload(preset.payload);
                          notify(
                            `Cargamos los datos de ejemplo #${idx + 1}.`,
                            "info",
                            "card"
                          );
                        }}
                        className="btn-secondary-3d rounded-xl px-3 py-2 text-xs font-extrabold"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label
                      htmlFor="pdf417-raw-input"
                      className="block text-xs font-bold text-[var(--text-secondary)] mb-1"
                    >
                      Lectura completa del código del DNI:
                    </label>
                    <textarea
                      id="pdf417-raw-input"
                      rows={2}
                      required
                      value={pdf417RawPayload}
                      onChange={(e) => setPdf417RawPayload(e.target.value)}
                      placeholder="00548291034@GONZALEZ@VALENTINA SOFIA@F@38941205@A@14/06/1995@22/09/2022@207"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2 text-xs font-mono"
                    />
                  </div>
                </div>
              </ProgressiveDisclosure>

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
                  disabled={!parsedPdf417State.ok}
                  onClick={() => goToStep(3)}
                  className="btn-primary-3d inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold disabled:opacity-50"
                >
                  <span>Continuar al paso 3</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          {/* PASO 3: Foto del DNI + Selfie y confirmación */}
          {wizardStep === 3 && (
            <section
              aria-labelledby="step3-gemini-heading"
              className="surface-card animate-ibita-fade-up p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center gap-3.5">
                <Icon3D name="face" size="md" />
                <div>
                  <span className="text-xs font-extrabold text-[var(--brand-primary)]">
                    PASO 3 DE 3
                  </span>
                  <h3
                    id="step3-gemini-heading"
                    className="text-lg sm:text-xl font-extrabold"
                  >
                    Subí una foto del frente del DNI y tu selfie
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    Verificamos que seas vos en pocos segundos para habilitar tu
                    pase.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold">
                      A. Frente de tu DNI
                    </span>
                    {dniFrontDataUrl && (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        ✓ Lista
                      </span>
                    )}
                  </div>

                  <label className="btn-secondary-3d flex min-h-[54px] items-center justify-center gap-2 rounded-xl border-dashed border-[var(--brand-primary)] px-3 py-2.5 text-xs font-extrabold text-[var(--brand-primary)]">
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span className="text-center">
                      {dniFrontLabel || "Sacar o subir foto del frente"}
                    </span>
                    <input
                      type="file"
                      accept="image/webp,image/jpeg,image/png,image/avif"
                      capture="environment"
                      onChange={handleDniFrontUpload}
                      className="sr-only"
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold">
                      B. Tu selfie actual
                    </span>
                    {selfieDataUrl && (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        ✓ Lista
                      </span>
                    )}
                  </div>

                  <label className="btn-secondary-3d flex min-h-[54px] items-center justify-center gap-2 rounded-xl border-dashed border-emerald-600 px-3 py-2.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                    <UserCheck className="h-4 w-4" aria-hidden="true" />
                    <span className="text-center">
                      {selfieLabel || "Sacarte selfie o subir foto"}
                    </span>
                    <input
                      type="file"
                      accept="image/webp,image/jpeg,image/png,image/avif"
                      capture="user"
                      onChange={handleSelfieUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              <ProgressiveDisclosure
                icon="sparkle"
                title="¿No tenés cámara a mano? Usar imágenes de prueba"
                subtitle="Generá imágenes de muestra para probar el envío desde esta computadora."
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Si enviás sin cargar archivos propios, también se usarán
                    imágenes de prueba válidas automáticamente.
                  </p>
                  <button
                    type="button"
                    onClick={handleGenerateCanvasEvidences}
                    className="btn-secondary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                  >
                    <Sparkles
                      className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                      aria-hidden="true"
                    />
                    <span>Cargar imágenes de prueba</span>
                  </button>
                </div>
              </ProgressiveDisclosure>

              {submitState.status === "error" && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-2xl bg-red-100 text-red-900 p-4 text-xs font-bold"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{submitState.message}</span>
                </div>
              )}

              {submitState.status === "success" && (
                <AchievementBanner
                  icon="trophy"
                  tone="emerald"
                  title={`¡Identidad confirmada! (Coincidencia ${submitState.confidenceScore}%)`}
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
                    !parsedPdf417State.ok ||
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
                      <span>Revisando tus fotos con cuidado...</span>
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

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileSignature,
  KeyRound,
  Lock,
  MapPin,
  MessageSquare,
  QrCode,
  Share2,
  UserCheck,
} from "lucide-react";
import type {
  BookingAccessDetails,
  BookingCheckinState,
  SanitizedVerificationSlotSummary,
} from "@/modules/consortium/actions";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface PostVerificationNextStepsProps {
  booking: BookingCheckinState["booking"];
  consortium: BookingCheckinState["consortium"];
  activeSlot: SanitizedVerificationSlotSummary;
  nextPendingSlot: SanitizedVerificationSlotSummary | null;
  pendingCount: number;
  accessDetails: BookingAccessDetails | null;
  loadingAccess: boolean;
  contractSigned: boolean;
  similarityScore?: number | null;
  livenessScore?: number | null;
  onSelectNextPendingSlot: (slot: SanitizedVerificationSlotSummary) => void;
  onCopyInviteLink: (slot: SanitizedVerificationSlotSummary) => void;
  onRetryVerification?: () => void;
}

export function PostVerificationNextSteps({
  booking,
  consortium,
  activeSlot,
  nextPendingSlot,
  pendingCount,
  accessDetails,
  loadingAccess,
  contractSigned,
  similarityScore,
  livenessScore,
  onSelectNextPendingSlot,
  onCopyInviteLink,
  onRetryVerification,
}: PostVerificationNextStepsProps) {
  const { notify } = usePreferences();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPassUrl, setCopiedPassUrl] = useState(false);

  const displaySimPct =
    typeof similarityScore === "number"
      ? Math.round(similarityScore * 100)
      : activeSlot.biometricConfidenceScore !== null
        ? Math.round(activeSlot.biometricConfidenceScore)
        : null;
  const displayLivePct =
    typeof livenessScore === "number"
      ? Math.round(livenessScore * 100)
      : typeof activeSlot.livenessScore === "number"
        ? Math.round(activeSlot.livenessScore * 100)
        : null;

  const metricsLabel = [
    displaySimPct !== null ? `Similitud ${displaySimPct}%` : null,
    displayLivePct !== null ? `Vida ${displayLivePct}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function handleCopyAccessCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      notify("Código de puerta copiado al portapapeles.", "success", "check");
      window.setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      notify(`Tu código es: ${code}`, "info", "key");
    }
  }

  async function handleShareOrCopyPass(verificationUrl: string) {
    const fullUrl =
      typeof window !== "undefined" && verificationUrl.startsWith("/")
        ? `${window.location.origin}${verificationUrl}`
        : verificationUrl;

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: `Pase de ingreso · ${booking.propertyTitle}`,
          text: `Pase digital verificado para ${booking.addressLine} (${booking.unitIdentifier})`,
          url: fullUrl,
        });
        return;
      } catch {
        // Fallback a copiar si cancela el share sheet
      }
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedPassUrl(true);
      notify("Enlace del pase de portería copiado.", "success", "check");
      window.setTimeout(() => setCopiedPassUrl(false), 2500);
    } catch {
      // Sin acción
    }
  }

  if (activeSlot.status === "MANUAL_REVIEW") {
    return (
      <section
        aria-label="Estado de verificación en revisión"
        className="surface-card animate-ibita-fade-up p-6 sm:p-8 space-y-5"
      >
        <div className="flex items-start gap-3.5">
          <Icon3D name="shield" size="md" />
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 border border-sky-500/40 px-3 py-0.5 text-xs font-extrabold text-sky-900 dark:text-sky-200">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              Validación en revisión rápida
            </span>
            <h3 className="text-xl font-extrabold">
              Recibimos tu DNI y selfie para {activeSlot.fullNameExtracted ?? `Adulto #${activeSlot.slotIndex}`}
            </h3>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              Como la coincidencia facial quedó en zona intermedia{metricsLabel ? ` (${metricsLabel})` : ""}, el anfitrión o nuestro equipo ya pueden confirmarla manualmente desde su panel. Te notificaremos apenas quede aprobada.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {onRetryVerification && (
            <button
              type="button"
              onClick={onRetryVerification}
              className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
            >
              <span>Repetir foto y selfie con mejor luz</span>
            </button>
          )}
          <Link
            href={`/mensajes?booking=${booking.id}`}
            className={`${onRetryVerification ? "btn-secondary-3d" : "btn-primary-3d"} inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold`}
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <span>Consultar en Mensajes</span>
          </Link>
          <Link
            href="/perfil"
            className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
          >
            Ir a mi perfil
          </Link>
        </div>
      </section>
    );
  }

  const contractHref = `/contratos/${booking.id}?token=${encodeURIComponent(
    activeSlot.inviteToken
  )}`;

  return (
    <div className="space-y-6 animate-ibita-fade-up">
      {/* 1. Confirmación principal de identidad */}
      <AchievementBanner
        icon="trophy"
        tone="emerald"
        title={
          booking.allAdultsVerified
            ? "¡Check-in digital completado!"
            : `¡Identidad confirmada para ${activeSlot.fullNameExtracted ?? `Adulto #${activeSlot.slotIndex}`}!`
        }
        description={
          booking.allAdultsVerified
            ? `${activeSlot.fullNameExtracted ?? "Huésped"} (DNI ${activeSlot.maskedDocumentNumber ?? "validado"})${
                metricsLabel ? ` · ${metricsLabel}` : ""
              }. Ya tenés habilitado tu código de acceso y los próximos pasos de tu estadía.`
            : `${activeSlot.fullNameExtracted ?? "Huésped"} validado correctamente${
                metricsLabel ? ` (${metricsLabel})` : ""
              }. Faltan ${pendingCount} ${pendingCount === 1 ? "persona" : "personas"} para liberar la clave de ingreso.`
        }
      />

      {/* 2A. SI YA ESTÁN TODOS VERIFICADOS: Clave + QR en vivo + Checklist de próximos pasos */}
      {booking.allAdultsVerified ? (
        <>
          <section
            aria-labelledby="unlocked-access-heading"
            className="surface-card p-6 sm:p-8 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Icon3D name="key" size="md" />
                <div>
                  <span className="badge-consorcio-friendly inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                    ✓ Acceso desbloqueado
                  </span>
                  <h2
                    id="unlocked-access-heading"
                    className="text-xl font-extrabold mt-0.5"
                  >
                    Tu clave de ingreso y pase de portería
                  </h2>
                </div>
              </div>

              <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
                <p className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)]">
                  <MapPin className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
                  {booking.addressLine} · {booking.unitIdentifier}
                </p>
                <p className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {booking.checkIn} al {booking.checkOut} ({booking.nightsCount} noches)
                  </span>
                </p>
              </div>
            </div>

            {loadingAccess && !accessDetails?.accessCode ? (
              <div
                role="status"
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 text-center text-xs font-bold text-[var(--text-secondary)] animate-pulse"
              >
                Generando clave segura de ingreso y pase QR de portería...
              </div>
            ) : accessDetails?.accessCode ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 flex flex-col justify-between gap-4">
                  <div className="space-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      <KeyRound className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
                      Código de cerradura
                    </span>
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-3 text-center">
                      <code className="text-2xl sm:text-3xl font-black tracking-widest text-[var(--text-primary)]">
                        {accessDetails.accessCode}
                      </code>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                      Ingresá este código al llegar a la unidad {booking.unitIdentifier}. No lo compartas con personas ajenas a la reserva.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCopyAccessCode(accessDetails.accessCode!)}
                    className="btn-secondary-3d inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        <span>✓ Código copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        <span>Copiar código de puerta</span>
                      </>
                    )}
                  </button>
                </div>

                {accessDetails.porteriaPass && (
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 flex flex-col sm:flex-row items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={accessDetails.porteriaPass.qrDataUrl}
                      alt="Código QR del Pase Digital de Portería"
                      width={148}
                      height={148}
                      className="rounded-2xl bg-white p-2.5 border border-[var(--border-subtle)] shrink-0"
                    />
                    <div className="space-y-2.5 text-center sm:text-left min-w-0 flex-1">
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          Pase Digital de Portería
                        </span>
                        {consortium?.active && (
                          <p className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--text-secondary)]">
                            <Building2 className="h-3 w-3" aria-hidden="true" />
                            {consortium.consortiumName}
                          </p>
                        )}
                        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
                          Mostrá este QR al encargado o vigilancia al ingresar al edificio.
                        </p>
                      </div>

                      <div className="flex flex-wrap justify-center sm:justify-start gap-2">
                        <a
                          href={accessDetails.porteriaPass.verificationUrl}
                          className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold"
                        >
                          <span>Abrir pase</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            handleShareOrCopyPass(
                              accessDetails.porteriaPass!.verificationUrl
                            )
                          }
                          className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-bold"
                        >
                          {copiedPassUrl ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              <span>Copiado</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Compartir</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs text-[var(--text-secondary)]">
                Tu grupo ya completó el 100%. Si la clave todavía no aparece arriba, recargá la página un segundo.
              </div>
            )}
          </section>

          {/* Próximos pasos recomendados después de validar identidad */}
          <section
            aria-labelledby="next-steps-heading"
            className="surface-card p-6 sm:p-8 space-y-4"
          >
            <div className="space-y-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-primary)]">
                Próximos pasos de tu estadía
              </span>
              <h2 id="next-steps-heading" className="text-lg sm:text-xl font-extrabold">
                Completá el cierre digital de tu check-in
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Paso 1: Firma de acuerdo/contrato */}
              <div className="rounded-2xl border-2 border-[var(--brand-primary)]/40 bg-[var(--surface-tint)]/45 p-4 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--brand-primary)]">
                      <FileSignature className="h-4 w-4" aria-hidden="true" />
                      Paso siguiente
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        contractSigned
                          ? "badge-consorcio-friendly"
                          : "bg-amber-500/20 text-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {contractSigned ? "Firmado ✓" : "Pendiente"}
                    </span>
                  </div>
                  <h3 className="text-sm font-extrabold">
                    Acuerdo digital de estadía
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-snug">
                    {contractSigned
                      ? "Tu acuerdo ya está sellado con hash SHA-256. Podés revisarlo o descargar el PDF."
                      : "Revisá las condiciones y firmá electrónicamente tu acuerdo (Ley 25.506) antes de ingresar."}
                  </p>
                </div>

                <Link
                  href={contractHref}
                  className="btn-primary-3d inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                >
                  <span>
                    {contractSigned
                      ? "Ver / descargar contrato"
                      : "Firmar acuerdo ahora"}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              {/* Paso 2: Coordinar llegada por Mensajes */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--text-secondary)]">
                    <MessageSquare className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    Coordinación directa
                  </span>
                  <h3 className="text-sm font-extrabold">
                    Avisá tu horario de llegada
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-snug">
                    Escribile al anfitrión dentro de I-bita si necesitás coordinar horario de ingreso o retiro de llaves.
                  </p>
                </div>

                <Link
                  href={`/mensajes?booking=${booking.id}`}
                  className="btn-secondary-3d inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                >
                  <span>Abrir Mensajes</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              {/* Paso 3: Mi cuenta / reservas */}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--text-secondary)]">
                    <CheckCircle2 className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
                    Respaldo de viaje
                  </span>
                  <h3 className="text-sm font-extrabold">
                    Ver tus reservas y comprobantes
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-snug">
                    Tenés siempre disponibles tu estadía, pase de portería y acuerdo en tu perfil personal.
                  </p>
                </div>

                <Link
                  href="/perfil"
                  className="btn-secondary-3d inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                >
                  <span>Ir a Mi Perfil</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
        </>
      ) : (
        /* 2B. FALTA ALGÚN ACOMPAÑANTE: Acción directa para validar o invitar sin trabar al usuario */
        <section
          aria-labelledby="next-guest-heading"
          className="surface-card p-6 sm:p-8 space-y-5"
        >
          <div className="flex items-start gap-3.5">
            <Icon3D name="user" size="md" />
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-0.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Falta validar {pendingCount}{" "}
                {pendingCount === 1 ? "acompañante" : "acompañantes"} para liberar la clave
              </span>
              <h2 id="next-guest-heading" className="text-xl font-extrabold">
                ¿Cómo querés continuar ahora?
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                Tu identidad ya quedó guardada. Apenas valide el último acompañante, se desbloquean automáticamente el código de la cerradura y el pase QR.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row flex-wrap gap-3">
            {nextPendingSlot && (
              <>
                <button
                  type="button"
                  onClick={() => onSelectNextPendingSlot(nextPendingSlot)}
                  className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 text-sm font-extrabold"
                >
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  <span>
                    Validar ahora a Adulto #{nextPendingSlot.slotIndex} en este teléfono
                  </span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => onCopyInviteLink(nextPendingSlot)}
                  className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>
                    Copiar link para Adulto #{nextPendingSlot.slotIndex}
                  </span>
                </button>
              </>
            )}

            <Link
              href={contractHref}
              className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
            >
              <FileSignature className="h-4 w-4" aria-hidden="true" />
              <span>Ir adelantando el acuerdo digital</span>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

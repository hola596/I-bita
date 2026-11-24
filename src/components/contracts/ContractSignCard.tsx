"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  CheckCircle2,
  Download,
  Loader2,
  Clock,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import {
  generateAndSignContractAction,
  generateAndSignShortStayAgreementAction,
  getContractDownloadSignedUrlAction,
} from "@/modules/contracts/actions";
import { type ContractRecord } from "@/modules/contracts/types";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface ContractSignCardProps {
  bookingId: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  isMidTerm?: boolean;
  totalAmount: string;
  currency: string;
  escrowDepositUsdt?: string | null;
  initialContract: ContractRecord | null;
  token?: string | null;
  userRole?: "GUEST" | "HOST";
}

const STAY_PURPOSES = [
  { value: "TURISMO", label: "Turismo y descanso" },
  { value: "NOMADA_DIGITAL", label: "Trabajo remoto / estadía flexible" },
  { value: "ESTUDIO", label: "Estudios universitarios o posgrado" },
  { value: "TRATAMIENTO_MEDICO", label: "Atención médica o salud" },
  { value: "CORPORATIVO_ENERGIA", label: "Motivos laborales o corporativos" },
  { value: "OTRO", label: "Otro motivo temporario" },
];

export function ContractSignCard({
  bookingId,
  propertyTitle,
  checkIn,
  checkOut,
  nightsCount,
  isMidTerm = false,
  totalAmount,
  currency,
  escrowDepositUsdt,
  initialContract,
  token,
  userRole = "GUEST",
}: ContractSignCardProps) {
  const { notify } = usePreferences();
  const [contractStep, setContractStep] = useState<0 | 1>(0);
  const [contract, setContract] = useState<ContractRecord | null>(
    initialContract
  );
  const [stayPurpose, setStayPurpose] = useState(
    initialContract?.stayPurpose || "TURISMO"
  );
  const [acceptedConsent, setAcceptedConsent] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isShortStay = nightsCount < 30 && !isMidTerm;
  const nightsLabel = `${nightsCount} ${nightsCount === 1 ? "noche" : "noches"}`;
  const checkinHref = `/checkin/${bookingId}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const hasEscrowDeposit =
    Boolean(escrowDepositUsdt) && Number(escrowDepositUsdt) > 0;

  const handleSign = async () => {
    if (!acceptedConsent) {
      setErrorMessage(
        "Marcá la casilla de aceptación para poder firmar tu acuerdo."
      );
      return;
    }

    setErrorMessage(null);
    setIsSigning(true);

    try {
      const res = isShortStay
        ? await generateAndSignShortStayAgreementAction(
            bookingId,
            {
              stayPurpose: "ESTADIA_CORTA",
              role: userRole,
            },
            token
          )
        : await generateAndSignContractAction(
            bookingId,
            {
              stayPurpose,
              role: userRole,
              agreementKind: "MID_TERM_ART1199",
            },
            token
          );

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setContract(res.data);
        notify(
          isShortStay
            ? "¡Acuerdo simple firmado! Ya podés continuar con tu reserva."
            : "¡Acuerdo firmado! Ya podés descargar tu copia en PDF.",
          "celebration",
          "trophy"
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No pudimos completar la firma ahora. Intentá nuevamente."
      );
    } finally {
      setIsSigning(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setErrorMessage(null);

    try {
      const res = await getContractDownloadSignedUrlAction(bookingId, token);
      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        window.open(res.data.signedUrl, "_blank", "noopener,noreferrer");
        notify("Abrimos tu acuerdo en una pestaña nueva.", "success", "contract");
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No pudimos generar el enlace de descarga."
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const isGuestSigned = Boolean(contract?.guestSignedAt);
  const isHostSigned = Boolean(contract?.hostSignedAt);

  const formattedTotalAmount = Number.isFinite(Number(totalAmount))
    ? Number(totalAmount).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : totalAmount;

  const partyStatusesBlock = (signedGuest: boolean) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 flex items-center gap-3">
        {isHostSigned ? (
          <CheckCircle2
            className="h-5 w-5 text-emerald-600 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <Clock
            className="h-5 w-5 text-amber-500 shrink-0"
            aria-hidden="true"
          />
        )}
        <div className="text-xs">
          <p className="font-extrabold">Anfitrión</p>
          <p className="text-[var(--text-secondary)]">
            {isHostSigned ? "Firmado" : "Listo para firmar"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 flex items-center gap-3">
        {signedGuest ? (
          <CheckCircle2
            className="h-5 w-5 text-emerald-600 shrink-0"
            aria-hidden="true"
          />
        ) : (
          <Clock
            className="h-5 w-5 text-amber-500 shrink-0"
            aria-hidden="true"
          />
        )}
        <div className="text-xs">
          <p className="font-extrabold">Huésped (Vos)</p>
          <p className="text-[var(--text-secondary)]">
            {signedGuest ? "Firmado con éxito" : "Falta tu firma"}
          </p>
        </div>
      </div>
    </div>
  );

  const consentAndSignFooter = (showBackToPurpose: boolean) => (
    <div className="space-y-4">
      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-bold text-red-950 dark:text-red-200"
        >
          {errorMessage}
        </div>
      )}

      <label className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs sm:text-sm text-[var(--text-primary)] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={acceptedConsent}
          onChange={(e) => setAcceptedConsent(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-zinc-300 accent-[var(--brand-primary)] shrink-0"
        />
        <span>
          {isShortStay
            ? "Sí, leí el resumen y acepto este acuerdo directo entre Anfitrión y Huésped (I-bita provee únicamente la plataforma tecnológica de software y sellado)."
            : "Sí, leí el resumen y acepto celebrar este contrato de locación temporaria directa y exclusivamente con la contraparte (I-bita no actúa como inmobiliaria)."}
        </span>
      </label>

      <div className="flex flex-col sm:flex-row gap-2.5">
        {showBackToPurpose && (
          <button
            type="button"
            onClick={() => setContractStep(0)}
            disabled={isSigning}
            className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl px-4 text-xs font-extrabold"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Motivo</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleSign}
          disabled={isSigning || !acceptedConsent}
          className="btn-primary-3d inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-extrabold disabled:opacity-50"
        >
          {isSigning ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>Preparando y firmando tu PDF...</span>
            </>
          ) : (
            <>
              <FileText className="h-5 w-5" aria-hidden="true" />
              <span>
                {isShortStay
                  ? "Firmar acuerdo simple y continuar"
                  : "Firmar mi acuerdo digital"}
              </span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {isGuestSigned && (
        <AchievementBanner
          icon="trophy"
          tone="emerald"
          title={
            isShortStay
              ? "¡Listo! Tu acuerdo simple ya está firmado"
              : "¡Excelente! Tu acuerdo ya está firmado"
          }
          description={
            isShortStay
              ? "Guardamos tu acuerdo en PDF y ya podés pasar al último paso para confirmar tu identidad y recibir tu pase de ingreso."
              : "El documento quedó guardado y protegido. Ahora podés confirmar tu identidad para recibir tu pase de entrada."
          }
          action={{
            label: "Continuar a confirmar identidad",
            href: checkinHref,
          }}
        />
      )}

      <section
        aria-labelledby="contract-heading"
        className="surface-card p-6 sm:p-8 space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="badge-consorcio-friendly inline-flex items-center rounded-full px-3.5 py-1 text-xs font-extrabold">
            {isShortStay
              ? "Acuerdo simple · Estadía corta (< 30 noches)"
              : "Contrato temporario · Ley argentina (Art. 1199)"}
          </span>
          <span className="rounded-full px-3 py-1 text-xs font-bold bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200">
            Estadía de {nightsLabel}
          </span>
        </div>

        <div className="flex items-center gap-3.5">
          <Icon3D name="contract" size="lg" />
          <div>
            <h1
              id="contract-heading"
              className="text-xl sm:text-2xl font-extrabold tracking-tight"
            >
              {isShortStay
                ? "Firmá tu acuerdo simple para continuar"
                : "Revisá los 4 puntos clave de tu acuerdo"}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {propertyTitle} · Del {checkIn} al {checkOut}
            </p>
          </div>
        </div>

        {/* Sin firmar: flujo directo de 1 paso para estadía corta (<30 noches) o 2 pasos para Art. 1199 */}
        {!isGuestSigned ? (
          isShortStay ? (
            <div className="animate-ibita-slide-next space-y-5">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 sm:p-5 space-y-3 text-xs sm:text-sm">
                <p className="font-extrabold text-[var(--text-primary)]">
                  Resumen simple de tu estadía corta:
                </p>
                <ul className="space-y-2 text-[var(--text-secondary)]">
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-[var(--brand-primary)]">
                      1.
                    </span>
                    <span>
                      <strong>Estadía corta confirmada:</strong> alojamiento por{" "}
                      <strong>{nightsLabel}</strong> (del {checkIn} al{" "}
                      {checkOut}), sin trámite de contrato largo Art. 1199.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-[var(--brand-primary)]">
                      2.
                    </span>
                    <span>
                      <strong>Precio cerrado:</strong> el total pactado es de{" "}
                      <strong>
                        {formattedTotalAmount} {currency}
                      </strong>
                      , sin cargos ocultos durante tu estadía.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-[var(--brand-primary)]">
                      3.
                    </span>
                    <span>
                      <strong>Cuidado del departamento:</strong> devolución de
                      la unidad en buen estado y cumplimiento de los horarios de
                      ingreso y egreso coordinados dentro de I-bita
                      {hasEscrowDeposit
                        ? ` (depósito protegido de ${escrowDepositUsdt} USDT)`
                        : ""}
                      .
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-extrabold text-[var(--brand-primary)]">
                      4.
                    </span>
                    <span>
                      <strong>Buena convivencia:</strong> respeto por la
                      tranquilidad del edificio y validación de identidad de
                      todos los adultos declarados.
                    </span>
                  </li>
                </ul>
              </div>

              {partyStatusesBlock(false)}
              {consentAndSignFooter(false)}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Barra segmentada en 2 pasos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-extrabold text-[var(--text-secondary)]">
                  <span>Paso {contractStep + 1} de 2</span>
                  <span>
                    {contractStep === 0
                      ? "Motivo de tu estadía"
                      : "Revisar resumen y firmar"}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={1}
                  aria-valuemax={2}
                  aria-valuenow={contractStep + 1}
                  aria-label="Progreso de firma de acuerdo"
                  className="grid grid-cols-2 gap-1.5"
                >
                  <div
                    className={`h-1.5 rounded-full ${
                      contractStep > 0
                        ? "bg-emerald-600"
                        : "bg-[var(--brand-primary)]"
                    }`}
                  />
                  <div
                    className={`h-1.5 rounded-full ${
                      contractStep === 1
                        ? "bg-[var(--brand-primary)]"
                        : "bg-[var(--border-subtle)]"
                    }`}
                  />
                </div>
              </div>

              {contractStep === 0 ? (
                <div
                  key="contract-step-0"
                  className="animate-ibita-slide-next space-y-4"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-[var(--text-primary)]">
                      ¿Cuál es el motivo principal de tu estadía?
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      La ley argentina pide dejar constancia del motivo por el
                      cual alquilás de manera temporaria.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {STAY_PURPOSES.map((p) => {
                      const selected = stayPurpose === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setStayPurpose(p.value)}
                          aria-pressed={selected}
                          className={`rounded-2xl border-2 p-3.5 text-left text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                            selected
                              ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setContractStep(1)}
                    className="btn-primary-3d inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm sm:text-base font-extrabold"
                  >
                    <span>Continuar a revisar el acuerdo</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div
                  key="contract-step-1"
                  className="animate-ibita-slide-next space-y-5"
                >
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-[var(--text-secondary)]">
                        Motivo elegido:
                      </span>{" "}
                      <strong className="text-[var(--text-primary)]">
                        {STAY_PURPOSES.find((p) => p.value === stayPurpose)
                          ?.label ?? stayPurpose}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => setContractStep(0)}
                      className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>

                  {/* Resumen claro en 4 puntos */}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 sm:p-5 space-y-3 text-xs sm:text-sm">
                    <p className="font-extrabold text-[var(--text-primary)]">
                      Resumen simple antes de firmar:
                    </p>
                    <ul className="space-y-2 text-[var(--text-secondary)]">
                      <li className="flex items-start gap-2">
                        <span className="font-extrabold text-[var(--brand-primary)]">
                          1.
                        </span>
                        <span>
                          <strong>Uso temporario:</strong> es un alojamiento por
                          tiempo limitado acorde al motivo declarado.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-extrabold text-[var(--brand-primary)]">
                          2.
                        </span>
                        <span>
                          <strong>Precio cerrado:</strong> el total pactado es
                          de{" "}
                          <strong>
                            {formattedTotalAmount} {currency}
                          </strong>
                          , sin sorpresas ni cambios durante la estadía.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-extrabold text-[var(--brand-primary)]">
                          3.
                        </span>
                        <span>
                          <strong>Garantía cuidada:</strong> el depósito queda
                          protegido y se reintegra a las 24 h de la salida sin
                          daños.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-extrabold text-[var(--brand-primary)]">
                          4.
                        </span>
                        <span>
                          <strong>Buena convivencia:</strong> nos comprometemos
                          a respetar las normas de tranquilidad del edificio.
                        </span>
                      </li>
                    </ul>
                  </div>

                  {partyStatusesBlock(false)}
                  {consentAndSignFooter(true)}
                </div>
              )}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 text-xs">
              {isShortStay || contract?.agreementKind === "SHORT_STAY_SIMPLE" ? (
                <>
                  <span className="font-bold">Tipo de documento:</span> Acuerdo
                  simple de estadía corta
                </>
              ) : (
                <>
                  <span className="font-bold">Motivo registrado:</span>{" "}
                  {STAY_PURPOSES.find((p) => p.value === contract?.stayPurpose)
                    ?.label ?? contract?.stayPurpose}
                </>
              )}
            </div>

            {partyStatusesBlock(true)}

            <div className="space-y-2.5 pt-1">
              <Link
                href={checkinHref}
                className="btn-primary-3d inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-extrabold"
              >
                <span>Continuar a confirmar identidad</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isDownloading}
                className="btn-secondary-3d inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm sm:text-base font-extrabold"
              >
                {isDownloading ? (
                  <>
                    <Loader2
                      className="h-5 w-5 animate-spin"
                      aria-hidden="true"
                    />
                    <span>Abriendo tu PDF seguro...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-5 w-5" aria-hidden="true" />
                    <span>Descargar mi acuerdo en PDF</span>
                    <ExternalLink
                      className="h-4 w-4 ml-1 opacity-70"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>

              <div className="text-center pt-1">
                <Link
                  href="/perfil"
                  className="text-xs font-extrabold text-[var(--text-secondary)] hover:text-[var(--brand-primary)] underline"
                >
                  Ver estado en Mi perfil
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {contract?.pdfSha256Hash && (
        <ProgressiveDisclosure
          icon="shield"
          title="Ver comprobante técnico y auditoría probatoria (Ley 25.506)"
          subtitle="Sello criptográfico SHA-256 y registro inmutable de firma electrónica (Art. 288 CCCN)."
        >
          <div className="space-y-3 text-xs">
            <p className="font-mono break-all text-[var(--text-primary)]">
              <strong>Sello SHA-256 del documento:</strong> {contract.pdfSha256Hash}
            </p>
            {contract.auditLogs && contract.auditLogs.length > 0 && (
              <div className="space-y-2 border-t border-[var(--border-subtle)] pt-3">
                <p className="font-extrabold text-[var(--text-primary)]">
                  Registro inmutable de firmas ({contract.auditLogs.length}):
                </p>
                <ul className="space-y-2">
                  {contract.auditLogs.map((log) => (
                    <li
                      key={log.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 font-mono text-[11px] space-y-0.5"
                    >
                      <p>
                        <strong>Rol:</strong> {log.signerRole} ·{" "}
                        <strong>Email:</strong> {log.email}
                      </p>
                      <p>
                        <strong>Fecha UTC:</strong> {log.signedAtUtc} ·{" "}
                        <strong>IP:</strong> {log.ipAddress}
                      </p>
                      <p className="truncate text-[var(--text-secondary)]">
                        <strong>Agente:</strong> {log.userAgent} ·{" "}
                        <strong>OTP:</strong>{" "}
                        {log.otpVerifiedAt
                          ? `${log.otpChannel || "EMAIL_OTP"} (${log.otpVerifiedAt})`
                          : "Pendiente / no requerido en esta instancia"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </ProgressiveDisclosure>
      )}
    </div>
  );
}

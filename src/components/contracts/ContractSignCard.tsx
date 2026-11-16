"use client";

import { useState } from "react";
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  Download,
  Loader2,
  Clock,
  ExternalLink,
} from "lucide-react";
import {
  generateAndSignContractAction,
  getContractDownloadSignedUrlAction,
} from "@/modules/contracts/actions";
import { type ContractRecord } from "@/modules/contracts/types";

interface ContractSignCardProps {
  bookingId: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  totalAmount: string;
  currency: string;
  initialContract: ContractRecord | null;
  token?: string | null;
  userRole?: "GUEST" | "HOST";
}

const STAY_PURPOSES = [
  { value: "TURISMO", label: "Turismo y Descanso" },
  { value: "NOMADA_DIGITAL", label: "Trabajo Remoto / Nómada Digital" },
  { value: "ESTUDIO", label: "Estudios Universitarios / Posgrado" },
  { value: "TRATAMIENTO_MEDICO", label: "Tratamiento Médico / Salud" },
  { value: "CORPORATIVO_ENERGIA", label: "Corporativo / Negocios / Energía" },
  { value: "OTRO", label: "Otro motivo transitorio determinado" },
];

export function ContractSignCard({
  bookingId,
  propertyTitle,
  checkIn,
  checkOut,
  nightsCount,
  totalAmount,
  currency,
  initialContract,
  token,
  userRole = "GUEST",
}: ContractSignCardProps) {
  const [contract, setContract] = useState<ContractRecord | null>(initialContract);
  const [stayPurpose, setStayPurpose] = useState(
    initialContract?.stayPurpose || "TURISMO"
  );
  const [acceptedConsent, setAcceptedConsent] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSign = async () => {
    if (!acceptedConsent) {
      setErrorMessage("Debes aceptar los términos y condiciones antes de firmar.");
      return;
    }

    setErrorMessage(null);
    setIsSigning(true);

    try {
      const res = await generateAndSignContractAction(
        bookingId,
        {
          stayPurpose,
          role: userRole,
        },
        token
      );

      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setContract(res.data);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error al procesar la firma del contrato."
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
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error al obtener enlace de descarga."
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const isGuestSigned = Boolean(contract?.guestSignedAt);
  const isHostSigned = Boolean(contract?.hostSignedAt);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="contract-heading"
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 sm:p-8 space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-black">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Marco Jurídico · Art. 1199 CCyC
          </span>
          <span className="rounded-full px-3 py-1 text-xs font-bold bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-200">
            Media Estadía ({nightsCount} noches)
          </span>
        </div>

        <div>
          <h2 id="contract-heading" className="text-xl sm:text-2xl font-black">
            Contrato de Locación Temporaria Digital
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {propertyTitle} · {checkIn} al {checkOut}
          </p>
        </div>

        {/* Resumen de Cláusulas Esenciales */}
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 space-y-3 text-xs">
          <p className="font-bold text-[var(--text-primary)]">
            Cláusulas Clave del Contrato:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-[var(--text-secondary)]">
            <li>
              <strong>Destino determinado (Art. 1199 inc. b):</strong> Locación con
              fines transitorios y específicos de habitación.
            </li>
            <li>
              <strong>Precio total cerrado:</strong> {totalAmount} {currency}{" "}
              abonado en su totalidad mediante I-bita.
            </li>
            <li>
              <strong>Garantía Escrow:</strong> Custodia protegida restituible a las
              24h del check-out verificado.
            </li>
            <li>
              <strong>Reglamento Consorcial:</strong> Obligación de cumplir con las
              normas de convivencia del edificio.
            </li>
          </ul>
        </div>

        {/* Selector de Finalidad de la Estadía */}
        {!isGuestSigned ? (
          <div className="space-y-2">
            <label
              htmlFor="stay-purpose-select"
              className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              Finalidad Específica de la Estadía (Exigencia Art. 1199 CCyC)
            </label>
            <select
              id="stay-purpose-select"
              value={stayPurpose}
              onChange={(e) => setStayPurpose(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-3 text-sm font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {STAY_PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--text-secondary)]">
              La ley exige declarar expresamente la causa transitoria que justifica
              la locación temporaria.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800/60 p-3 text-xs">
            <span className="font-bold">Finalidad declarada:</span>{" "}
            {contract?.stayPurpose}
          </div>
        )}

        {/* Estado de Firmas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="rounded-2xl border border-[var(--border-subtle)] p-3.5 flex items-center gap-3">
            {isHostSigned ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : (
              <Clock className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />
            )}
            <div className="text-xs">
              <p className="font-bold">Anfitrión (Locador)</p>
              <p className="text-[var(--text-secondary)]">
                {isHostSigned ? "Firmado electrónicamente" : "Pendiente de firma"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] p-3.5 flex items-center gap-3">
            {isGuestSigned ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : (
              <Clock className="h-5 w-5 text-amber-500 shrink-0" aria-hidden="true" />
            )}
            <div className="text-xs">
              <p className="font-bold">Huésped (Locatario)</p>
              <p className="text-[var(--text-secondary)]">
                {isGuestSigned ? "Firmado electrónicamente" : "Pendiente de firma"}
              </p>
            </div>
          </div>
        </div>

        {/* Sello Criptográfico SHA-256 */}
        {contract?.pdfSha256Hash && (
          <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 p-3.5 border border-zinc-200 dark:border-zinc-700 space-y-1 text-xs font-mono break-all text-zinc-900 dark:text-zinc-100">
            <p className="font-bold text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              Sellado Criptográfico SHA-256 (Inmutabilidad del PDF)
            </p>
            <p className="text-[11px]">{contract.pdfSha256Hash}</p>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border-2 border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-bold text-red-950 dark:text-red-200"
          >
            {errorMessage}
          </div>
        )}

        {/* Botón de Firma o Descarga */}
        {!isGuestSigned ? (
          <div className="space-y-4 pt-2">
            <label className="flex items-start gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptedConsent}
                onChange={(e) => setAcceptedConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span>
                He leído y acepto en todos sus términos las cláusulas del Contrato de
                Locación Temporaria conforme al Artículo 1199 del Código Civil y
                Comercial de la Nación y la Ley 25.506 de Firma Digital.
              </span>
            </label>

            <button
              type="button"
              onClick={handleSign}
              disabled={isSigning || !acceptedConsent}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3.5 text-base font-extrabold text-white transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-950 shadow-md"
            >
              {isSigning ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span>Construyendo PDF y sellando con SHA-256...</span>
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5" aria-hidden="true" />
                  <span>Firmar Electrónicamente Contrato Art. 1199 CCyC</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="pt-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isDownloading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white px-5 py-3.5 text-base font-extrabold transition focus-visible:outline focus-visible:outline-2"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span>Obteniendo enlace seguro de descarga...</span>
                </>
              ) : (
                <>
                  <Download className="h-5 w-5" aria-hidden="true" />
                  <span>Descargar Contrato PDF Sellado (SHA-256)</span>
                  <ExternalLink className="h-4 w-4 ml-1 opacity-70" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

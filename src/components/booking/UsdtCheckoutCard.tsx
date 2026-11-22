"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Lock,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { verifyAndSettleUsdtPaymentAction } from "@/modules/payments/actions";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface UsdtCheckoutCardProps {
  bookingId: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  isMidTerm: boolean;
  amountUsdt: string;
  escrowDepositUsdt: string;
  treasuryWallet: string;
  usdtContractAddress: string;
  network: string;
  token?: string | null;
  payable: boolean;
  status: string;
}

export function UsdtCheckoutCard({
  bookingId,
  treasuryWallet,
  usdtContractAddress,
  network,
  nightsCount,
  isMidTerm,
  amountUsdt,
  escrowDepositUsdt,
  token,
  payable,
  status,
}: UsdtCheckoutCardProps) {
  const { notify } = usePreferences();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    txHash: string;
    bookingStatus: string;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(treasuryWallet, {
      width: 240,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error("Error generando QR:", err);
      });
    return () => {
      isMounted = false;
    };
  }, [treasuryWallet]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(treasuryWallet);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = treasuryWallet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    notify("Copiamos la dirección. Pegala en tu billetera.", "success", "coin");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleVerifyOnchain = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanHash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
      setErrorMessage(
        "El comprobante debe empezar con 0x y tener 64 caracteres. Revisalo e intentá de nuevo."
      );
      return;
    }

    setIsVerifying(true);
    try {
      const res = await verifyAndSettleUsdtPaymentAction(
        bookingId,
        cleanHash,
        token
      );
      if (!res.ok) {
        setErrorMessage(res.error.message);
      } else {
        setSuccessResult({
          txHash: res.data.txHash,
          bookingStatus: res.data.bookingStatus,
        });
        notify(
          "¡Pago confirmado! Ya podés pasar al siguiente paso.",
          "celebration",
          "trophy"
        );
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No pudimos conectarnos para revisar la transferencia. Probá en unos segundos."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  if (successResult) {
    return (
      <div className="space-y-5">
        <AchievementBanner
          icon="trophy"
          tone="emerald"
          title="¡Listo! Confirmamos tu pago en USDT"
          description="Tu transferencia quedó registrada y protegida. El siguiente paso es firmar tu acuerdo digital."
          action={{
            label: "Seguir a firmar tu acuerdo",
            href: `/contratos/${bookingId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
          }}
        />

        <ProgressiveDisclosure
          icon="shield"
          title="Ver comprobante de la operación"
          subtitle="Guardamos el código de tu transferencia por seguridad."
        >
          <p className="font-mono text-xs break-all text-[var(--text-primary)]">
            <strong>Código de transferencia:</strong> {successResult.txHash}
          </p>
        </ProgressiveDisclosure>
      </div>
    );
  }

  if (!payable) {
    return (
      <div className="space-y-6">
        <section
          aria-labelledby="usdt-amount-heading"
          className="surface-card p-6 space-y-4"
        >
          <h2
            id="usdt-amount-heading"
            className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            Monto pactado en USDT
          </h2>
          <div className="flex items-baseline gap-2">
            <p
              className="text-4xl sm:text-5xl font-black text-emerald-700 dark:text-emerald-400"
              data-testid="usdt-amount"
            >
              {amountUsdt}
            </p>
            <span className="text-xl font-black">USDT</span>
          </div>
          <p className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Esta reserva ya no admite pagos en este momento (estado: {status}).
            </span>
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Barra segmentada en 3 pasos */}
      <div className="surface-card p-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-extrabold text-[var(--text-secondary)]">
          <span>Paso {step + 1} de 3</span>
          <span>
            {step === 0
              ? "Revisar monto y red"
              : step === 1
                ? "Enviar USDT por Polygon"
                : "Confirmar comprobante"}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={3}
          aria-valuenow={step + 1}
          aria-label="Progreso de pago en USDT"
          className="grid grid-cols-3 gap-1.5"
        >
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-colors ${
                idx < step
                  ? "bg-emerald-600"
                  : idx === step
                    ? "bg-[var(--brand-primary)]"
                    : "bg-[var(--border-subtle)]"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Paso 0: Revisar monto y red Polygon */}
      {step === 0 && (
        <section
          aria-labelledby="usdt-amount-heading"
          className="surface-card animate-ibita-slide-next p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Red {network} · USDT
            </span>
            {isMidTerm && (
              <span className="rounded-full px-3 py-1 text-xs font-extrabold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Estadía larga ({nightsCount} noches)
              </span>
            )}
          </div>

          <div>
            <h2
              id="usdt-amount-heading"
              className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]"
            >
              1. Monto exacto a enviar
            </h2>
            <div className="flex items-baseline gap-2 mt-1">
              <p
                className="text-4xl sm:text-5xl font-black text-emerald-700 dark:text-emerald-400"
                data-testid="usdt-amount"
              >
                {amountUsdt}
              </p>
              <span className="text-xl font-black">USDT</span>
            </div>
            {Number(escrowDepositUsdt) > 0 && (
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 font-medium">
                Incluye un depósito de garantía de{" "}
                <strong>{escrowDepositUsdt} USDT</strong> que se te devuelve al
                terminar la estadía sin daños.
              </p>
            )}
          </div>

          <div
            role="note"
            className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3.5 flex items-start gap-3 text-xs text-amber-950 dark:text-amber-200"
          >
            <AlertTriangle
              className="h-5 w-5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              <strong>Por tu seguridad:</strong> enviá USDT únicamente por la
              red <strong>Polygon (PoS)</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStep(1)}
            className="btn-primary-3d inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-base font-extrabold"
          >
            <span>Entendido, ver QR y dirección</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </section>
      )}

      {/* Paso 1: QR y dirección de cobro */}
      {step === 1 && (
        <section
          aria-labelledby="vault-heading"
          className="surface-card animate-ibita-slide-next p-6 space-y-5"
        >
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[var(--text-secondary)]">
              Monto exacto ({network}):
            </span>
            <span className="font-black text-emerald-700 dark:text-emerald-400">
              <span data-testid="usdt-amount">{amountUsdt}</span> USDT
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Icon3D name="shield" size="md" />
            <div>
              <h2 id="vault-heading" className="text-base font-extrabold">
                2. Enviá a esta dirección segura
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Podés escanear el código QR o copiar la dirección con un clic.
              </p>
            </div>
          </div>

          {qrDataUrl && (
            <div className="flex justify-center p-3 bg-white rounded-2xl border border-[var(--border-subtle)] w-fit mx-auto shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Código QR de pago en USDT Polygon"
                width={200}
                height={200}
                className="rounded-lg"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="treasury-address"
              className="text-xs font-extrabold text-[var(--text-secondary)]"
            >
              Dirección de cobro (Polygon)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="treasury-address"
                type="text"
                readOnly
                value={treasuryWallet}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2.5 font-mono text-xs sm:text-sm text-[var(--text-primary)] select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={copyAddress}
                aria-label="Copiar dirección de pago"
                className="btn-secondary-3d inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <ProgressiveDisclosure
            icon="coin"
            title="Ver datos técnicos del contrato USDT"
            subtitle="Para verificar en Polygonscan si querés revisarlo."
          >
            <p className="text-xs text-[var(--text-secondary)] font-mono break-all">
              Contrato USDT Polygon:{" "}
              <a
                href={`https://polygonscan.com/token/${usdtContractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
              >
                {usdtContractAddress}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            </p>
          </ProgressiveDisclosure>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl px-4 text-xs font-extrabold"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Revisar monto</span>
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn-primary-3d inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
            >
              <span>Ya transferí, cargar comprobante</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* Paso 2: Cargar comprobante TX Hash */}
      {step === 2 && (
        <section
          aria-labelledby="tx-hash-heading"
          className="surface-card animate-ibita-slide-next p-6 space-y-5"
        >
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[var(--text-secondary)]">
              Transferencia esperada:
            </span>
            <span className="font-black text-emerald-700 dark:text-emerald-400">
              <span data-testid="usdt-amount">{amountUsdt}</span> USDT
            </span>
          </div>

          <form onSubmit={handleVerifyOnchain} className="space-y-4">
            <div className="space-y-1.5">
              <label
                id="tx-hash-heading"
                htmlFor="tx-hash-input"
                className="block text-sm font-extrabold text-[var(--text-primary)]"
              >
                3. Pegá el código de tu transferencia (TX Hash)
              </label>
              <input
                id="tx-hash-input"
                type="text"
                placeholder="0x..."
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                disabled={isVerifying}
                required
                pattern="^0x[a-fA-F0-9]{64}$"
                title="Debe comenzar con 0x seguido de 64 caracteres hexadecimales"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-3 font-mono text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
              />
              <p className="text-xs text-[var(--text-secondary)]">
                Tu billetera te muestra este código ni bien confirmás el envío.
              </p>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="rounded-2xl border-2 border-red-800 bg-red-50 dark:bg-red-950/40 p-4 text-xs font-bold text-red-950 dark:text-red-200"
              >
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isVerifying}
                className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-2xl px-4 text-xs font-extrabold"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Ver dirección</span>
              </button>
              <button
                type="submit"
                disabled={isVerifying || !txHash.trim()}
                className="btn-primary-3d inline-flex min-h-[50px] flex-1 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm sm:text-base font-extrabold disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span>Confirmando tu pago...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    <span>Confirmar mi pago</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

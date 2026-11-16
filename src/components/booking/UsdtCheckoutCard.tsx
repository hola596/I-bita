"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  ArrowRight,
  AlertTriangle,
  Loader2,
  Lock,
} from "lucide-react";
import { verifyAndSettleUsdtPaymentAction } from "@/modules/payments/actions";

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
  propertyTitle,
  checkIn,
  checkOut,
  nightsCount,
  isMidTerm,
  amountUsdt,
  escrowDepositUsdt,
  treasuryWallet,
  usdtContractAddress,
  network,
  token,
  payable,
  status,
}: UsdtCheckoutCardProps) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    txHash: string;
    bookingStatus: string;
  } | null>(null);

  // Generar QR para la dirección de la bóveda
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback si navigator.clipboard no está disponible
      const ta = document.createElement("textarea");
      ta.value = treasuryWallet;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleVerifyOnchain = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanHash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(cleanHash)) {
      setErrorMessage(
        "El hash de la transacción debe comenzar con 0x seguido de 64 caracteres hexadecimales."
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
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Error inesperado al conectar con el verificador on-chain."
      );
    } finally {
      setIsVerifying(false);
    }
  };

  if (successResult) {
    return (
      <section
        aria-labelledby="success-heading"
        className="rounded-3xl border-2 border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-6 sm:p-8 space-y-6 text-emerald-950 dark:text-emerald-100"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-emerald-600 p-2 text-white">
            <Check className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 id="success-heading" className="text-xl sm:text-2xl font-black">
              ¡Pago en USDT Acreditado On-Chain!
            </h2>
            <p className="text-sm font-semibold opacity-90">
              Verificado exitosamente en la red Polygon PoS vía Viem.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 dark:bg-zinc-900/80 p-4 border border-emerald-300 dark:border-emerald-800 space-y-2 text-xs font-mono break-all text-zinc-900 dark:text-zinc-100">
          <p>
            <span className="font-bold">TX Hash:</span> {successResult.txHash}
          </p>
          <p>
            <span className="font-bold">Estado de Reserva:</span>{" "}
            {successResult.bookingStatus}
          </p>
        </div>

        <a
          href={`/checkin/${bookingId}${token ? `?token=${encodeURIComponent(token)}` : ""}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-6 py-4 text-base font-extrabold text-white shadow-lg focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-950"
        >
          Continuar al Pre-Check-in Digital (KYC)
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </a>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tarjeta de Resumen y Monto */}
      <section
        aria-labelledby="usdt-amount-heading"
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {network} · USDT
          </span>
          {isMidTerm && (
            <span className="rounded-full px-3 py-1 text-xs font-black bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Media Estadía ({nightsCount} noches)
            </span>
          )}
        </div>

        <div>
          <h2
            id="usdt-amount-heading"
            className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            Total a transferir
          </h2>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="text-4xl sm:text-5xl font-black text-emerald-600 dark:text-emerald-400" data-testid="usdt-amount">
              {amountUsdt}
            </p>
            <span className="text-xl font-black">USDT</span>
          </div>
          {Number(escrowDepositUsdt) > 0 && (
            <p className="text-xs text-[var(--text-secondary)] mt-1.5 font-medium">
              Incluye depósito en custodia escrow de{" "}
              <strong>{escrowDepositUsdt} USDT</strong> (reintegrable tras el
              check-out sin daños).
            </p>
          )}
        </div>

        {/* Advertencia de Red */}
        <div
          role="note"
          className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-3.5 flex items-start gap-3 text-xs text-amber-950 dark:text-amber-200"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <p>
            <strong>Importante:</strong> Transferí exclusivamente USDT a través
            de la red <strong>Polygon (PoS)</strong>. Los envíos por otras redes
            (Ethereum, BSC, Tron) no podrán ser verificados y provocarán
            pérdida de fondos.
          </p>
        </div>
      </section>

      {/* Datos de Transferencia y Bóveda */}
      <section
        aria-labelledby="vault-heading"
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 space-y-5"
      >
        <h2 id="vault-heading" className="text-base font-extrabold">
          Dirección de Custodia (Bóveda Escrow I-bita)
        </h2>

        {/* QR Code */}
        {qrDataUrl && (
          <div className="flex justify-center p-3 bg-white rounded-2xl border border-[var(--border-subtle)] w-fit mx-auto shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="Código QR para transferir a la bóveda de custodia de I-bita en Polygon"
              width={200}
              height={200}
              className="rounded-lg"
            />
          </div>
        )}

        {/* Dirección copiable */}
        <div className="space-y-1.5">
          <label
            htmlFor="treasury-address"
            className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
          >
            Billetera de Tesorería (Polygon)
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
              aria-label="Copiar dirección de la bóveda"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white px-3.5 py-2.5 text-xs font-bold transition focus-visible:outline focus-visible:outline-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
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

        {/* Info del contrato */}
        <p className="text-xs text-[var(--text-secondary)] font-mono">
          Contrato oficial USDT en Polygon:{" "}
          <a
            href={`https://polygonscan.com/token/${usdtContractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline inline-flex items-center gap-1 hover:text-[var(--text-primary)]"
          >
            {usdtContractAddress.slice(0, 8)}...{usdtContractAddress.slice(-6)}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </p>

        {/* Formulario de Verificación On-Chain */}
        {payable ? (
          <form onSubmit={handleVerifyOnchain} className="pt-2 space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="tx-hash-input"
                className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]"
              >
                Hash de Transacción (TX Hash)
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
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-3 font-mono text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-[var(--text-secondary)]">
                Pegá el identificador de transacción provisto por tu billetera o exchange tras realizar la transferencia.
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

            <button
              type="submit"
              disabled={isVerifying || !txHash.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3.5 text-base font-extrabold text-white transition focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-950"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span>Verificando en Polygon con Viem...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  <span>Verificar Transacción On-Chain</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-500">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Esta reserva no admite pago en este momento (estado: <code>{status}</code>).
          </p>
        )}
      </section>
    </div>
  );
}

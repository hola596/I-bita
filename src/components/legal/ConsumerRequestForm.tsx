"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldAlert, FileCheck2 } from "lucide-react";
import {
  submitArrepentimientoAction,
  submitBajaServicioAction,
  type ConsumerRequestReceipt,
} from "@/modules/compliance/actions";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface ConsumerRequestFormProps {
  mode: "ARREPENTIMIENTO" | "BAJA_SERVICIO";
}

export function ConsumerRequestForm({ mode }: ConsumerRequestFormProps) {
  const { notify } = usePreferences();
  const isArrepentimiento = mode === "ARREPENTIMIENTO";

  const [email, setEmail] = useState("");
  const [referenceCode, setReferenceCode] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ConsumerRequestReceipt | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      const res = isArrepentimiento
        ? await submitArrepentimientoAction({
            email,
            bookingCode: referenceCode,
            reason,
          })
        : await submitBajaServicioAction({
            email,
            accountReference: referenceCode,
            reason,
          });

      if (!res.ok) {
        setErrorMessage(res.error.message);
        return;
      }

      setReceipt(res.data);
      notify(
        `Registramos tu trámite con código ${res.data.trackingCode}.`,
        "success",
        "check"
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No pudimos registrar la solicitud en este momento."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <section
        aria-live="polite"
        className="surface-card p-6 sm:p-8 space-y-5 border-emerald-600/40"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2
            className="h-7 w-7 text-emerald-600 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <span className="inline-flex rounded-full bg-emerald-600/15 px-3 py-0.5 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
              Trámite registrado · Sin necesidad de iniciar sesión
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]">
              {isArrepentimiento
                ? "Recibimos tu solicitud de arrepentimiento"
                : "Recibimos tu solicitud de baja de servicio"}
            </h2>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-emerald-600/40 bg-[var(--bg-secondary)] p-5 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
            Código de gestión / trámite
          </p>
          <p
            data-testid="consumer-tracking-code"
            className="font-mono text-2xl sm:text-3xl font-black tracking-wide text-emerald-700 dark:text-emerald-400"
          >
            {receipt.trackingCode}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Fecha UTC: <strong>{receipt.submittedAtUtc}</strong> · Correo:{" "}
            <strong>{receipt.email}</strong>
          </p>
        </div>

        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Conservá este código de gestión. Te confirmaremos la resolución al
          correo informado dentro de las próximas{" "}
          <strong className="text-[var(--text-primary)]">24 horas</strong>{" "}
          (Disposición 954/2025).
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/"
            className="btn-primary-3d inline-flex min-h-[44px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
          >
            Volver al inicio
          </Link>
          <button
            type="button"
            onClick={() => {
              setReceipt(null);
              setReason("");
            }}
            className="btn-secondary-3d inline-flex min-h-[44px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
          >
            Ingresar otra solicitud
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card p-6 sm:p-8 space-y-5">
      <div className="flex items-center gap-2.5 text-sm font-extrabold text-[var(--text-primary)]">
        <FileCheck2
          className="h-5 w-5 text-[var(--brand-primary)]"
          aria-hidden="true"
        />
        <span>
          {isArrepentimiento
            ? "Solicitá la revocación de contratación (acceso directo, sin login)"
            : "Solicitá la baja de tu cuenta o servicio (acceso directo, sin login)"}
        </span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-700 bg-red-50 dark:bg-red-950/40 p-4 text-xs sm:text-sm font-bold text-red-950 dark:text-red-200 flex items-start gap-2.5"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="consumer-email"
          className="block text-xs sm:text-sm font-extrabold text-[var(--text-primary)]"
        >
          Correo electrónico de contacto *
        </label>
        <input
          id="consumer-email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu-correo@ejemplo.com"
          className="min-h-[48px] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 text-sm font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="consumer-reference"
          className="block text-xs sm:text-sm font-extrabold text-[var(--text-primary)]"
        >
          {isArrepentimiento
            ? "Código o ID de reserva (si lo tenés a mano)"
            : "Código de cuenta, CUIT/CUIL o referencia (opcional)"}
        </label>
        <input
          id="consumer-reference"
          name="referenceCode"
          type="text"
          maxLength={80}
          value={referenceCode}
          onChange={(e) => setReferenceCode(e.target.value)}
          placeholder={
            isArrepentimiento
              ? "Ej: UUID de reserva o comprobante"
              : "Ej: anfitrión / huésped"
          }
          className="min-h-[48px] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 text-sm font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="consumer-reason"
          className="block text-xs sm:text-sm font-extrabold text-[var(--text-primary)]"
        >
          Motivo o detalle (opcional)
        </label>
        <textarea
          id="consumer-reason"
          name="reason"
          rows={3}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Podés dejarnos cualquier aclaración útil para identificar tu pedido."
          className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 text-sm font-medium focus:border-[var(--brand-primary)] focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="btn-primary-3d inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-6 text-sm sm:text-base font-extrabold disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Registrando código de gestión...</span>
          </>
        ) : (
          <span>
            {isArrepentimiento
              ? "Enviar solicitud de arrepentimiento"
              : "Confirmar solicitud de baja"}
          </span>
        )}
      </button>
    </form>
  );
}

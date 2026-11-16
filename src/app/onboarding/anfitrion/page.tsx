"use client";

import { useState } from "react";
import { completeHostOnboardingAction } from "@/modules/auth/actions";

export default function HostOnboardingPage() {
  const [status, setStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ type: "loading" });
    const formData = new FormData(e.currentTarget);

    const res = await completeHostOnboardingAction({
      fullName: String(formData.get("fullName") ?? ""),
      phoneWhatsapp: String(formData.get("phoneWhatsapp") ?? ""),
      cuitCuil: String(formData.get("cuitCuil") ?? ""),
      payoutCbuCvu: String(formData.get("payoutCbuCvu") ?? ""),
      payoutUsdtWallet: String(formData.get("payoutUsdtWallet") ?? ""),
      payoutSplitArsPct: Number(formData.get("payoutSplitArsPct") ?? 100),
    });

    if (res.ok) {
      setStatus({
        type: "success",
        message: `Perfil de Anfitrión (HOST) activado con éxito. Wallet EIP-55 verificada: ${res.data.checksumWallet}`,
      });
    } else {
      setStatus({
        type: "error",
        message: res.error.message,
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 space-y-8">
      <header className="space-y-2">
        <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
          KYB / KYC Fiscal & Split Bi-Monetario (ARS + USDT Polygon)
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight pt-2">
          Onboarding de Anfitrión y Cuentas de Liquidación
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Configurá cómo querés recibir tus cobros: CBU/CVU en Pesos Argentinos al instante y/o tu billetera USDT en la red Polygon verificada con checksum EIP-55.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 space-y-5 shadow-xs"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-bold mb-1">
              Nombre o Razón Social *
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              placeholder="Martín Gómez Propiedades"
            />
          </div>
          <div>
            <label htmlFor="phoneWhatsapp" className="block text-sm font-bold mb-1">
              WhatsApp Operativo *
            </label>
            <input
              id="phoneWhatsapp"
              name="phoneWhatsapp"
              type="tel"
              required
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              placeholder="+5491123456789"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="cuitCuil" className="block text-sm font-bold mb-1">
              CUIT / CUIL (Validación Módulo 11) *
            </label>
            <input
              id="cuitCuil"
              name="cuitCuil"
              type="text"
              required
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm font-mono"
              placeholder="20-12345678-6"
            />
          </div>
          <div>
            <label htmlFor="payoutSplitArsPct" className="block text-sm font-bold mb-1">
              % Split en ARS (Resto en USDT) *
            </label>
            <input
              id="payoutSplitArsPct"
              name="payoutSplitArsPct"
              type="number"
              min={0}
              max={100}
              defaultValue={70}
              required
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="payoutCbuCvu" className="block text-sm font-bold mb-1">
            CBU / CVU Bancario o Billetera Virtual en ARS (22 dígitos) *
          </label>
          <input
            id="payoutCbuCvu"
            name="payoutCbuCvu"
            type="text"
            required
            maxLength={22}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm font-mono"
            placeholder="0000003100012345678901"
          />
        </div>

        <div>
          <label htmlFor="payoutUsdtWallet" className="block text-sm font-bold mb-1">
            Dirección de Wallet USDT (Red Polygon · EIP-55 Checksum con `viem`) *
          </label>
          <input
            id="payoutUsdtWallet"
            name="payoutUsdtWallet"
            type="text"
            required
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm font-mono"
            placeholder="0x223c27263ef7d49491031e6cda3feaf2690dd1f7"
          />
        </div>

        {status.type === "error" && (
          <p role="alert" className="rounded-xl bg-red-100 text-red-900 px-4 py-2.5 text-xs font-bold">
            {status.message}
          </p>
        )}

        {status.type === "success" && (
          <p role="status" className="badge-consorcio-friendly rounded-xl px-4 py-2.5 text-xs font-bold">
            {status.message}
          </p>
        )}

        <button
          type="submit"
          disabled={status.type === "loading"}
          className="w-full rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
        >
          {status.type === "loading" ? "Validando CUIT, CBU y Wallet..." : "Activar Perfil de Anfitrión"}
        </button>
      </form>
    </div>
  );
}

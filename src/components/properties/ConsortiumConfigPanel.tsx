"use client";

import { useState, useMemo } from "react";
import Decimal from "decimal.js";
import {
  Building2,
  ShieldCheck,
  Phone,
  Mail,
  Landmark,
  Percent,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Coins,
} from "lucide-react";
import { calculateStayPricing } from "@/lib/math/money";
import {
  upsertConsortiumConfigAction,
  type HostConsortiumConfigRecord,
} from "@/modules/consortium/actions";
import {
  ALLOWED_MICRO_CANON_PCTS,
  type MicroCanonPct,
} from "@/modules/consortium/validators";
import type { PublicConsortiumConfig } from "@/modules/properties/queries";

export interface ConsortiumConfigPanelProps {
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  addressLine: string;
  baseCurrency: "ARS" | "USD" | "USDT";
  nightlyRate: number;
  monthlyDiscountPct: number;
  absorbInstallmentsCost: boolean;
  initialHostConfig?: HostConsortiumConfigRecord | null;
  publicConsortiumConfig?: PublicConsortiumConfig | null;
  onSaved?: (config: HostConsortiumConfigRecord) => void;
}

const MICRO_CANON_LABELS: Record<
  MicroCanonPct,
  { badge: string; subtitle: string }
> = {
  0: {
    badge: "0.00% (Solo Pase QR)",
    subtitle: "Envío de Pase QR a portería sin retención económica",
  },
  1: {
    badge: "1.00% Estándar",
    subtitle: "Aporte base al Fondo de Reserva del consorcio",
  },
  1.5: {
    badge: "1.50% Recomendado",
    subtitle: "Equilibrio óptimo de incentivos para el edificio",
  },
  2: {
    badge: "2.00% Premium",
    subtitle: "Máxima participación consorcial en expensas",
  },
};

function formatCurrencyValue(amount: string, currency: "ARS" | "USDT"): string {
  const num = Number(amount);
  if (currency === "USDT") {
    return `${num.toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USDT`;
  }
  return `$ ${num.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ARS`;
}

export function ConsortiumConfigPanel({
  propertyId,
  propertySlug,
  propertyTitle,
  addressLine,
  baseCurrency,
  nightlyRate,
  monthlyDiscountPct,
  absorbInstallmentsCost,
  initialHostConfig,
  publicConsortiumConfig,
  onSaved,
}: ConsortiumConfigPanelProps) {
  const defaultConsortiumName =
    initialHostConfig?.consortium_name ??
    publicConsortiumConfig?.consortium_name ??
    `Consorcio Propietarios ${addressLine}`;

  const rawInitialPct = Number(
    initialHostConfig?.micro_canon_pct ??
      publicConsortiumConfig?.micro_canon_pct ??
      1.5
  );
  const defaultMicroCanonPct: MicroCanonPct =
    rawInitialPct === 0 ||
    rawInitialPct === 1 ||
    rawInitialPct === 1.5 ||
    rawInitialPct === 2
      ? rawInitialPct
      : 1.5;

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [consortiumName, setConsortiumName] = useState<string>(
    defaultConsortiumName
  );
  const [consortiumCuit, setConsortiumCuit] = useState<string>(
    initialHostConfig?.consortium_cuit &&
      initialHostConfig.consortium_cuit !== "30-71234567-9"
      ? initialHostConfig.consortium_cuit
      : "30-71234567-1"
  );
  const [porteriaWhatsapp, setPorteriaWhatsapp] = useState<string>(
    initialHostConfig?.porteria_whatsapp ?? "+5491144556677"
  );
  const [adminEmail, setAdminEmail] = useState<string>(
    initialHostConfig?.admin_email ?? "administracion@consorcio.com.ar"
  );
  const [consortiumCbuAlias, setConsortiumCbuAlias] = useState<string>(
    initialHostConfig?.consortium_cbu_alias ?? "consorcio.fondo.reserva"
  );
  const [microCanonPct, setMicroCanonPct] =
    useState<MicroCanonPct>(defaultMicroCanonPct);
  const [active, setActive] = useState<boolean>(
    initialHostConfig?.active ?? publicConsortiumConfig?.active ?? true
  );

  // Parámetros del simulador en vivo con decimal.js
  const [simNights, setSimNights] = useState<5 | 30>(5);
  const [simCurrency, setSimCurrency] = useState<"ARS" | "USDT">("ARS");

  const [saveState, setSaveState] = useState<{
    type: "idle" | "saving" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  const hasSavedActiveBadge = Boolean(
    (initialHostConfig && initialHostConfig.active) ||
      (publicConsortiumConfig && publicConsortiumConfig.active) ||
      (saveState.type === "success" && active)
  );

  const simulation = useMemo(() => {
    const pricing = calculateStayPricing({
      nightlyRate,
      nights: simNights,
      monthlyDiscountPct,
      microCanonPct: active ? microCanonPct : 0,
      absorbInstallmentsCost,
      baseCurrency,
      paymentCurrency: simCurrency,
    });

    // Proyección anual (10 estadías equivalentes al año) calculada con Decimal.js (cero float nativo)
    const annualConsortiumContribution = new Decimal(
      pricing.consortiumCanonAmount
    )
      .mul(10)
      .toDecimalPlaces(2)
      .toFixed(2);

    return {
      pricing,
      annualConsortiumContribution,
    };
  }, [
    nightlyRate,
    simNights,
    monthlyDiscountPct,
    active,
    microCanonPct,
    absorbInstallmentsCost,
    baseCurrency,
    simCurrency,
  ]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveState({ type: "saving" });

    const res = await upsertConsortiumConfigAction({
      propertyId,
      consortiumName,
      consortiumCuit: consortiumCuit.trim() || null,
      porteriaWhatsapp,
      adminEmail,
      microCanonPct,
      consortiumCbuAlias: consortiumCbuAlias.trim() || null,
      active,
    });

    if (!res.ok) {
      setSaveState({
        type: "error",
        message: res.error.message,
      });
      return;
    }

    setConsortiumName(res.data.consortium_name);
    setConsortiumCuit(res.data.consortium_cuit ?? "");
    setPorteriaWhatsapp(res.data.porteria_whatsapp);
    setAdminEmail(res.data.admin_email);
    setConsortiumCbuAlias(res.data.consortium_cbu_alias ?? "");
    setMicroCanonPct(res.data.micro_canon_pct);
    setActive(res.data.active);

    setSaveState({
      type: "success",
      message: res.data.active
        ? `Perfil "Consorcio Friendly" activado para "${res.data.consortium_name}" con Micro-Canon del ${res.data.micro_canon_pct.toFixed(2)}%. Sello y calculadora actualizados en /p/${propertySlug}.`
        : `Perfil consorcial guardado como inactivo para "${propertyTitle}".`,
    });

    onSaved?.(res.data);
  }

  return (
    <div className="mt-3 rounded-xl border border-emerald-600/35 bg-[var(--bg-secondary)] p-3.5 space-y-3">
      {/* Cabecera compacta con estado del sello Consorcio Friendly y botón desplegable */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
            <Building2
              className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            Perfil Consorcio Friendly & Micro-Canon
          </span>

          {hasSavedActiveBadge ? (
            <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              Sello Activo · {microCanonPct.toFixed(2)}% Canon
            </span>
          ) : (
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
              Pendiente de activar
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-bold hover:bg-[var(--bg-elevated)] cursor-pointer"
        >
          <span>{isOpen ? "Ocultar configuración" : "Configurar Consorcio"}</span>
          {isOpen ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Resumen rápido siempre visible */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
        <span>
          Edificio:{" "}
          <strong className="text-[var(--text-primary)]">
            {consortiumName}
          </strong>
        </span>
        <span>
          Aporte por reserva ({simNights}n):{" "}
          <strong className="text-emerald-700 dark:text-emerald-400">
            {formatCurrencyValue(
              simulation.pricing.consortiumCanonAmount,
              simCurrency
            )}
          </strong>
        </span>
      </div>

      {isOpen && (
        <form
          onSubmit={handleSubmit}
          aria-label={`Formulario de configuración Consorcio Friendly para ${propertyTitle}`}
          className="space-y-4 border-t border-[var(--border-subtle)] pt-3"
        >
          {/* Switch de Activación del Sello Consorcio Friendly */}
          <label className="flex items-center justify-between gap-3 rounded-xl border border-emerald-600/30 bg-[var(--badge-consorcio-bg)]/40 p-3 cursor-pointer">
            <div className="space-y-0.5">
              <span className="block text-xs font-extrabold text-[var(--badge-consorcio-text)]">
                Activar Sello Verificado &ldquo;Propiedad Consorcio Friendly · Pase QR&rdquo;
              </span>
              <span className="block text-[11px] text-[var(--text-secondary)]">
                Habilita la insignia en <code>/p/{propertySlug}</code>, el envío automático de Pases QR a portería y el cálculo de Micro-Canon con <code>decimal.js</code>.
              </span>
            </div>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-emerald-700 shrink-0"
            />
          </label>

          {/* Datos de Razón Social y CUIT del Consorcio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`consortium-name-${propertyId}`}
                className="block text-[11px] font-bold mb-1"
              >
                Razón Social / Nombre del Consorcio *
              </label>
              <input
                id={`consortium-name-${propertyId}`}
                name="consortiumName"
                type="text"
                required
                minLength={3}
                maxLength={160}
                value={consortiumName}
                onChange={(e) => setConsortiumName(e.target.value)}
                placeholder="Consorcio Propietarios Thames 1845"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs"
              />
            </div>

            <div>
              <label
                htmlFor={`consortium-cuit-${propertyId}`}
                className="block text-[11px] font-bold mb-1"
              >
                CUIT del Consorcio (Módulo 11 opcional)
              </label>
              <input
                id={`consortium-cuit-${propertyId}`}
                name="consortiumCuit"
                type="text"
                maxLength={13}
                value={consortiumCuit}
                onChange={(e) => setConsortiumCuit(e.target.value)}
                placeholder="30-71234567-1"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          {/* WhatsApp de Portería (E.164), Email de Administración y CBU/Alias */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor={`porteria-whatsapp-${propertyId}`}
                className="flex items-center gap-1 text-[11px] font-bold mb-1"
              >
                <Phone className="h-3 w-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                WhatsApp Portería (E.164) *
              </label>
              <input
                id={`porteria-whatsapp-${propertyId}`}
                name="porteriaWhatsapp"
                type="tel"
                required
                value={porteriaWhatsapp}
                onChange={(e) => setPorteriaWhatsapp(e.target.value)}
                placeholder="+5491144556677"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-mono"
              />
            </div>

            <div>
              <label
                htmlFor={`admin-email-${propertyId}`}
                className="flex items-center gap-1 text-[11px] font-bold mb-1"
              >
                <Mail className="h-3 w-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                Email Administración *
              </label>
              <input
                id={`admin-email-${propertyId}`}
                name="adminEmail"
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@consorcio.com.ar"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs"
              />
            </div>

            <div>
              <label
                htmlFor={`consortium-cbu-${propertyId}`}
                className="flex items-center gap-1 text-[11px] font-bold mb-1"
              >
                <Landmark className="h-3 w-3 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                CBU / CVU o Alias Consorcial
              </label>
              <input
                id={`consortium-cbu-${propertyId}`}
                name="consortiumCbuAlias"
                type="text"
                maxLength={60}
                value={consortiumCbuAlias}
                onChange={(e) => setConsortiumCbuAlias(e.target.value)}
                placeholder="consorcio.thames.1845"
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>

          {/* Selector de Regla de Micro-Canon Consorcial (0%, 1.00%, 1.50%, 2.00%) */}
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-xs font-extrabold">
              <Percent
                className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
                aria-hidden="true"
              />
              Regla de Micro-Canon Consorcial (Retención Automática T+24h)
            </span>

            <div
              role="group"
              aria-label="Seleccionar porcentaje de Micro-Canon Consorcial"
              className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            >
              {ALLOWED_MICRO_CANON_PCTS.map((pct) => {
                const isSelected = microCanonPct === pct;
                const info = MICRO_CANON_LABELS[pct];
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMicroCanonPct(pct)}
                    aria-pressed={isSelected}
                    className={`rounded-xl border p-2.5 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "border-emerald-600 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)] font-extrabold shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    <span className="block text-xs font-extrabold">
                      {info.badge}
                    </span>
                    <span className="block text-[10px] opacity-85 mt-0.5 leading-snug">
                      {info.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Simulador en Tiempo Real con decimal.js: Impacto en el Fondo de Reserva del Edificio */}
          <div
            aria-label="Simulador en tiempo real de Micro-Canon Consorcial con decimal.js"
            className="rounded-xl border border-emerald-600/30 bg-[var(--bg-primary)] p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-800 dark:text-emerald-300">
                <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                Simulación Exacta (<code>decimal.js</code>) · Fondo de Reserva del Edificio
              </span>

              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSimNights(5)}
                  className={`rounded-md px-2 py-0.5 font-bold cursor-pointer ${
                    simNights === 5
                      ? "bg-emerald-700 text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                  }`}
                >
                  5 noches
                </button>
                <button
                  type="button"
                  onClick={() => setSimNights(30)}
                  className={`rounded-md px-2 py-0.5 font-bold cursor-pointer ${
                    simNights === 30
                      ? "bg-emerald-700 text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                  }`}
                >
                  30n (Media Estadía)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSimCurrency((prev) => (prev === "ARS" ? "USDT" : "ARS"))
                  }
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-0.5 font-mono font-bold cursor-pointer"
                >
                  {simCurrency}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-[var(--bg-secondary)] p-2.5">
                <span className="block text-[10px] text-[var(--text-secondary)]">
                  Alojamiento Neto ({simNights}n)
                </span>
                <span className="font-extrabold">
                  {formatCurrencyValue(
                    simulation.pricing.netAccommodationAmount,
                    simCurrency
                  )}
                </span>
              </div>

              <div className="rounded-lg bg-[var(--badge-consorcio-bg)] p-2.5 text-[var(--badge-consorcio-text)]">
                <span className="block text-[10px] font-bold">
                  Aporte al Consorcio ({simulation.pricing.consortiumCanonPct}%)
                </span>
                <span className="font-extrabold">
                  {formatCurrencyValue(
                    simulation.pricing.consortiumCanonAmount,
                    simCurrency
                  )}
                </span>
              </div>

              <div className="rounded-lg bg-[var(--bg-secondary)] p-2.5">
                <span className="block text-[10px] text-[var(--text-secondary)]">
                  Liquidación Neta Anfitrión
                </span>
                <span className="font-extrabold">
                  {formatCurrencyValue(
                    simulation.pricing.hostNetPayout,
                    simCurrency
                  )}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              El huésped abona{" "}
              <strong className="text-[var(--text-primary)]">
                {formatCurrencyValue(
                  simulation.pricing.totalGuestPayable,
                  simCurrency
                )}
              </strong>{" "}
              (sin recargo extra). En 10 estadías similares al año, tu unidad aporta{" "}
              <strong className="text-emerald-700 dark:text-emerald-400">
                {formatCurrencyValue(
                  simulation.annualConsortiumContribution,
                  simCurrency
                )}
              </strong>{" "}
              al Fondo de Reserva de <strong>{consortiumName}</strong>.
            </p>
          </div>

          {saveState.type === "error" && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-lg bg-red-100 text-red-900 p-2.5 text-xs font-bold"
            >
              <AlertCircle
                className="h-4 w-4 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>{saveState.message}</span>
            </div>
          )}

          {saveState.type === "success" && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 badge-consorcio-friendly rounded-lg p-2.5 text-xs font-bold"
            >
              <div className="flex items-start gap-1.5">
                <CheckCircle2
                  className="h-4 w-4 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>{saveState.message}</span>
              </div>
              <a
                href={`/p/${propertySlug}`}
                className="inline-flex items-center gap-1 underline font-extrabold shrink-0"
              >
                <span>Ver en /p/{propertySlug}</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={saveState.type === "saving"}
            className="w-full rounded-xl bg-emerald-700 text-white px-4 py-2 text-xs font-extrabold hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
          >
            {saveState.type === "saving"
              ? "Guardando perfil Consorcio Friendly y actualizando /p/[slug]..."
              : "Guardar Configuración Consorcio Friendly y Regla de Micro-Canon"}
          </button>
        </form>
      )}
    </div>
  );
}

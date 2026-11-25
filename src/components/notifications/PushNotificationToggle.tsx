"use client";

import { Bell, BellOff, CheckCircle2, Info, Loader2, Share } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface PushNotificationToggleProps {
  variant?: "card" | "compact";
}

export function PushNotificationToggle({
  variant = "card",
}: PushNotificationToggleProps) {
  const { notify } = usePreferences();
  const {
    isSupported,
    isConfigured,
    isIosNonStandalone,
    permission,
    isSubscribed,
    isLoading,
    errorMessage,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  async function handleEnable() {
    const ok = await subscribe();
    if (ok) {
      notify(
        "¡Alertas push activadas en este dispositivo!",
        "celebration",
        "check"
      );
    }
  }

  async function handleDisable() {
    const ok = await unsubscribe();
    if (ok) {
      notify("Desactivaste las alertas push en este dispositivo.", "info", "shield");
    }
  }

  if (variant === "compact") {
    if (!isConfigured || (!isSupported && !isIosNonStandalone)) {
      return null;
    }

    if (isIosNonStandalone) {
      return (
        <div
          role="note"
          className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5"
        >
          <Share className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Para recibir alertas en iPhone, tocá{" "}
            <strong>Compartir → Agregar a pantalla de inicio</strong> y abrí
            I-bita desde el ícono instalado.
          </span>
        </div>
      );
    }

    if (isSubscribed) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-600/35 bg-[var(--badge-consorcio-bg)]/55 px-4 py-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-extrabold text-[var(--badge-consorcio-text)]">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Alertas push activas en este dispositivo
          </span>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleDisable}
            className="font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer disabled:opacity-50"
          >
            {isLoading ? "Desactivando..." : "Desactivar"}
          </button>
        </div>
      );
    }

    return (
      <div className="surface-card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Bell
            className="h-4 w-4 text-[var(--brand-primary)] shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              Recibí avisos en tu celular cuando te escriban o entren solicitudes
            </p>
            {errorMessage && (
              <p className="text-[11px] font-bold text-red-700 dark:text-red-300 mt-0.5">
                {errorMessage}
              </p>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={isLoading || permission === "denied"}
          onClick={handleEnable}
          className="btn-primary-3d inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Activando...</span>
            </>
          ) : (
            <>
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {permission === "denied"
                  ? "Permiso bloqueado"
                  : "Activar alertas"}
              </span>
            </>
          )}
        </button>
      </div>
    );
  }

  // variant === "card" (para /perfil)
  return (
    <section
      aria-labelledby="push-settings-heading"
      className="surface-card p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
              isSubscribed
                ? "badge-consorcio-friendly border-emerald-600/35"
                : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--brand-primary)]"
            }`}
          >
            {isSubscribed ? (
              <Bell className="h-5 w-5" aria-hidden="true" />
            ) : (
              <BellOff className="h-5 w-5" aria-hidden="true" />
            )}
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="push-settings-heading"
                className="text-base font-extrabold text-[var(--text-primary)]"
              >
                Notificaciones en tu celular (Web Push)
              </h2>
              {isSubscribed && (
                <span className="badge-consorcio-friendly rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                  Activas ✓
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Enterate al instante cuando recibas nuevos mensajes, solicitudes de estadía o confirmaciones de reserva, sin instalar apps externas.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          {isIosNonStandalone ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-extrabold text-amber-900 dark:text-amber-200">
              <Share className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Instalable en iPhone</span>
            </span>
          ) : !isSupported ? (
            <span className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">
              No compatible en este navegador
            </span>
          ) : !isConfigured ? (
            <span className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)]">
              Pendiente de clave VAPID
            </span>
          ) : isSubscribed ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={handleDisable}
              className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Desactivando...</span>
                </>
              ) : (
                <>
                  <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Desactivar en este dispositivo</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={isLoading || permission === "denied"}
              onClick={handleEnable}
              className="btn-primary-3d inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-5 text-xs font-extrabold disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Activando...</span>
                </>
              ) : (
                <>
                  <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {permission === "denied"
                      ? "Permiso bloqueado"
                      : "Activar notificaciones"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {isIosNonStandalone && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-950 dark:text-amber-200 leading-snug"
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            En iPhone/iPad necesitás agregar I-bita a tu pantalla de inicio primero: tocá el botón{" "}
            <strong>Compartir</strong> en Safari →{" "}
            <strong>Agregar a pantalla de inicio</strong> y luego abrí I-bita desde ese ícono para activar notificaciones.
          </span>
        </div>
      )}

      {permission === "denied" && !isIosNonStandalone && (
        <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
          El navegador bloqueó el permiso. Tocá el ícono de ajustes junto a la URL para permitir notificaciones en I-bita.
        </p>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="rounded-xl bg-red-100 text-red-900 px-3.5 py-2.5 text-xs font-bold"
        >
          {errorMessage}
        </p>
      )}
    </section>
  );
}

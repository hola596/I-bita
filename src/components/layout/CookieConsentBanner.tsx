"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

const COOKIE_STORAGE_KEY = "ibita_cookie_consent_v1";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const { notify } = usePreferences();

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COOKIE_STORAGE_KEY);
      if (!saved) {
        setVisible(true);
      }
    } catch {
      // Sin almacenamiento local disponible
    }
  }, []);

  const handleConsent = (level: "ALL" | "ESSENTIAL_ONLY") => {
    try {
      window.localStorage.setItem(
        COOKIE_STORAGE_KEY,
        JSON.stringify({ level, acceptedAt: new Date().toISOString() })
      );
    } catch {
      // Ignorar si está restringido
    }
    setVisible(false);
    notify(
      level === "ALL"
        ? "Listo, guardamos tu preferencia de privacidad."
        : "Perfecto, activamos solo las cookies necesarias.",
      "success",
      "shield"
    );
  };

  if (!visible) return null;

  return (
    <aside
      role="region"
      aria-label="Preferencias de privacidad y cookies"
      className="fixed bottom-24 lg:bottom-4 left-4 right-4 z-50 mx-auto max-w-4xl animate-ibita-fade-up rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 text-sm">
          <Icon3D name="shield" size="md" />
          <div className="space-y-1">
            <p className="font-extrabold text-[var(--text-primary)]">
              Cuidamos tu privacidad (Ley 25.326)
            </p>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              Usamos solo cookies técnicas para mantener tu sesión protegida y
              cuidar tus pagos. Podés leer más en{" "}
              <Link
                href="/legal/privacidad"
                className="underline font-bold text-[var(--brand-primary)]"
              >
                Privacidad
              </Link>{" "}
              y{" "}
              <Link
                href="/legal/terminos"
                className="underline font-bold text-[var(--brand-primary)]"
              >
                Términos claros
              </Link>
              .
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleConsent("ESSENTIAL_ONLY")}
            className="btn-secondary-3d min-h-[44px] rounded-xl px-4 py-2 text-xs font-extrabold"
          >
            Solo las necesarias
          </button>
          <button
            type="button"
            onClick={() => handleConsent("ALL")}
            className="btn-primary-3d min-h-[44px] rounded-xl px-4 py-2 text-xs font-extrabold"
          >
            Sí, aceptar todas
          </button>
        </div>
      </div>
    </aside>
  );
}

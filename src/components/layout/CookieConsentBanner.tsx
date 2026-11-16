"use client";

import { useEffect, useState } from "react";

const COOKIE_STORAGE_KEY = "ibita_cookie_consent_v1";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(COOKIE_STORAGE_KEY);
    if (!saved) {
      setVisible(true);
    }
  }, []);

  const handleConsent = (level: "ALL" | "ESSENTIAL_ONLY") => {
    window.localStorage.setItem(
      COOKIE_STORAGE_KEY,
      JSON.stringify({ level, acceptedAt: new Date().toISOString() })
    );
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside
      role="region"
      aria-label="Consentimiento de Cookies y Privacidad"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-4xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-5 shadow-xl"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 text-sm">
          <p className="font-bold text-[var(--text-primary)]">
            Privacidad y Protección de Datos (Ley 25.326 Argentina)
          </p>
          <p className="text-[var(--text-secondary)]">
            Utilizamos cookies esenciales para mantener tu sesión segura (`HttpOnly`) y gestionar pagos bi-monetarios. Podés consultar nuestra{" "}
            <a
              href="/legal/privacidad"
              className="underline font-semibold text-[var(--brand-primary)]"
            >
              Política de Privacidad Biométrica
            </a>{" "}
            y{" "}
            <a
              href="/legal/terminos"
              className="underline font-semibold text-[var(--brand-primary)]"
            >
              Términos CCyC
            </a>
            .
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleConsent("ESSENTIAL_ONLY")}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)] hover:opacity-90 cursor-pointer"
          >
            Solo Esenciales
          </button>
          <button
            type="button"
            onClick={() => handleConsent("ALL")}
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-xs font-bold text-white hover:bg-[var(--brand-primary-hover)] cursor-pointer"
          >
            Aceptar Todas
          </button>
        </div>
      </div>
    </aside>
  );
}

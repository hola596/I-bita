"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/ui/Icon3D";

export type ThemePreference = "light" | "dark";
export type ReadingSizePreference = "normal" | "comfortable";
export type CurrencyPreference = "ARS" | "USDT";
export type UserIntentPreference = "guest" | "host";
export type FeedbackTone = "info" | "success" | "celebration";

interface FeedbackToast {
  id: number;
  message: string;
  tone: FeedbackTone;
  icon: Icon3DName;
}

interface PreferencesContextValue {
  theme: ThemePreference;
  toggleTheme: () => void;
  readingSize: ReadingSizePreference;
  toggleReadingSize: () => void;
  currency: CurrencyPreference;
  setCurrency: (next: CurrencyPreference, announce?: boolean) => void;
  userIntent: UserIntentPreference;
  setUserIntent: (next: UserIntentPreference) => void;
  notify: (message: string, tone?: FeedbackTone, icon?: Icon3DName) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const THEME_STORAGE_KEY = "ibita_theme_v1";
const READING_STORAGE_KEY = "ibita_reading_size_v1";
const CURRENCY_STORAGE_KEY = "ibita_currency_v1";
const INTENT_STORAGE_KEY = "ibita_intent_v1";

/**
 * Proveedor global de personalización (modo claro/oscuro, texto confortable, moneda y mensajes de feedback).
 * Lee localStorage únicamente en useEffect para evitar discrepancias de hidratación SSR/CSR.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemePreference>("light");
  const [readingSize, setReadingSize] = useState<ReadingSizePreference>("normal");
  const [currency, setCurrencyState] = useState<CurrencyPreference>("ARS");
  const [userIntent, setUserIntentState] = useState<UserIntentPreference>("guest");
  const [toasts, setToasts] = useState<FeedbackToast[]>([]);

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolvedTheme: ThemePreference =
        savedTheme === "dark" || savedTheme === "light"
          ? savedTheme
          : systemDark
            ? "dark"
            : "light";
      setTheme(resolvedTheme);
      document.documentElement.dataset.theme = resolvedTheme;

      const savedReading = window.localStorage.getItem(READING_STORAGE_KEY);
      const resolvedReading: ReadingSizePreference =
        savedReading === "comfortable" ? "comfortable" : "normal";
      setReadingSize(resolvedReading);
      document.documentElement.dataset.readingSize = resolvedReading;

      const savedCurrency = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (savedCurrency === "ARS" || savedCurrency === "USDT") {
        setCurrencyState(savedCurrency);
      }

      const savedIntent = window.localStorage.getItem(INTENT_STORAGE_KEY);
      if (savedIntent === "guest" || savedIntent === "host") {
        setUserIntentState(savedIntent);
      }
    } catch {
      // Ignorar si el almacenamiento local está restringido
    }
  }, []);

  const notify = useCallback(
    (message: string, tone: FeedbackTone = "info", icon?: Icon3DName) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const resolvedIcon: Icon3DName =
        icon ??
        (tone === "celebration"
          ? "trophy"
          : tone === "success"
            ? "check"
            : "sparkle");

      setToasts((prev) => [
        ...prev.filter((item) => item.message !== message).slice(-1),
        { id, message, tone, icon: resolvedIcon },
      ]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 3600);
    },
    []
  );

  const toggleTheme = useCallback(() => {
    const next: ThemePreference = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Sin acción
    }
    notify(
      next === "dark"
        ? "Activamos el modo oscuro para cuidar tu vista."
        : "Volvimos al modo claro con máximo contraste.",
      "info",
      next === "dark" ? "moon" : "sun"
    );
  }, [theme, notify]);

  const toggleReadingSize = useCallback(() => {
    const next: ReadingSizePreference =
      readingSize === "normal" ? "comfortable" : "normal";
    setReadingSize(next);
    document.documentElement.dataset.readingSize = next;
    try {
      window.localStorage.setItem(READING_STORAGE_KEY, next);
    } catch {
      // Sin acción
    }
    notify(
      next === "comfortable"
        ? "Texto grande activado para una lectura más cómoda."
        : "Volvimos al tamaño de texto estándar.",
      "info",
      "textSize"
    );
  }, [readingSize, notify]);

  const setCurrency = useCallback(
    (next: CurrencyPreference, announce = true) => {
      if (currency === next) return;
      setCurrencyState(next);
      try {
        window.localStorage.setItem(CURRENCY_STORAGE_KEY, next);
      } catch {
        // Sin acción
      }
      if (announce) {
        notify(
          next === "ARS"
            ? "Precios actualizados a Pesos Argentinos (ARS)."
            : "Precios actualizados a dólares digitales (USDT).",
          "success",
          next === "ARS" ? "card" : "coin"
        );
      }
    },
    [currency, notify]
  );

  const setUserIntent = useCallback((next: UserIntentPreference) => {
    setUserIntentState(next);
    try {
      window.localStorage.setItem(INTENT_STORAGE_KEY, next);
    } catch {
      // Sin acción
    }
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      theme,
      toggleTheme,
      readingSize,
      toggleReadingSize,
      currency,
      setCurrency,
      userIntent,
      setUserIntent,
      notify,
    }),
    [theme, toggleTheme, readingSize, toggleReadingSize, currency, setCurrency, userIntent, setUserIntent, notify]
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}

      {/* Mensajes de retroalimentación constante (aria-live) */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="true"
          className="pointer-events-none fixed bottom-24 right-4 sm:bottom-6 z-50 flex max-w-sm flex-col gap-2"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto animate-ibita-fade-up flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md ${
                toast.tone === "celebration"
                  ? "border-emerald-600/50 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]"
                  : toast.tone === "success"
                    ? "border-emerald-600/40 bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]"
              }`}
            >
              <Icon3D name={toast.icon} size="sm" />
              <p className="text-xs sm:text-sm font-semibold leading-snug">
                {toast.message}
              </p>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((item) => item.id !== toast.id))
                }
                aria-label="Cerrar aviso"
                className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences debe usarse dentro de PreferencesProvider.");
  }
  return ctx;
}

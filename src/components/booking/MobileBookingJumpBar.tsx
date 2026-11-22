"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { convertCurrencyAmount } from "@/lib/math/money";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface MobileBookingJumpBarProps {
  nightlyRate: number;
  baseCurrency: "ARS" | "USD" | "USDT";
  monthlyDiscountPct: number;
  targetId?: string;
}

function formatNightlyCompact(
  amount: string | number,
  currency: "ARS" | "USDT"
): string {
  const num = Number(amount);
  if (currency === "USDT") {
    return `${num.toLocaleString("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} USDT`;
  }
  return `$ ${Math.round(num).toLocaleString("es-AR")} ARS`;
}

/**
 * Barra flotante móvil sobre la navegación inferior que aparece tras superar la portada
 * de la propiedad y se oculta automáticamente cuando la sección de reserva entra en vista.
 */
export function MobileBookingJumpBar({
  nightlyRate,
  baseCurrency,
  monthlyDiscountPct,
  targetId = "reservar-alojamiento",
}: MobileBookingJumpBarProps) {
  const { currency } = usePreferences();
  const [pastHero, setPastHero] = useState(false);
  const [targetVisible, setTargetVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateScroll = () => {
      setPastHero(window.scrollY > 240);
    };

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });

    const targetEl = document.getElementById(targetId);
    let observer: IntersectionObserver | null = null;

    if (targetEl && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          setTargetVisible(Boolean(entry?.isIntersecting));
        },
        { threshold: 0.12 }
      );
      observer.observe(targetEl);
    }

    return () => {
      window.removeEventListener("scroll", updateScroll);
      observer?.disconnect();
    };
  }, [targetId]);

  const isVisible = pastHero && !targetVisible;
  const convertedNight = convertCurrencyAmount(
    nightlyRate,
    baseCurrency,
    currency
  );

  const handleJump = () => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div
      aria-hidden={!isVisible}
      className={`lg:hidden fixed bottom-[5.25rem] left-1/2 -translate-x-1/2 z-20 w-[calc(100%-1.5rem)] max-w-md transition-all duration-200 ${
        isVisible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-black text-[var(--text-primary)] whitespace-nowrap">
              {formatNightlyCompact(convertedNight, currency)}
            </span>
            <span className="text-[11px] font-bold text-[var(--text-secondary)]">
              / noche
            </span>
          </div>
          <span className="inline-block text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">
            -{monthlyDiscountPct}% mes · ARS o USDT
          </span>
        </div>

        <button
          type="button"
          onClick={handleJump}
          tabIndex={isVisible ? 0 : -1}
          className="btn-primary-3d inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-extrabold whitespace-nowrap"
        >
          <span>Elegir fechas</span>
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

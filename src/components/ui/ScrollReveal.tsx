"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  distance?: "sm" | "md";
  stepLabel?: string;
}

type RevealPhase = "idle" | "pending" | "visible";

/**
 * Contenedor de revelación progresiva durante el scroll:
 * - Mantiene visibilidad inmediata en SSR y sobre el pliegue (LCP / SEO = intactos).
 * - Respeta `prefers-reduced-motion: reduce`.
 * - En móvil puede mostrar un divisor sutil por capítulo (`stepLabel`) para guiar la lectura con aire.
 */
export function ScrollReveal({
  children,
  className = "",
  delayMs = 0,
  distance = "md",
  stepLabel,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<RevealPhase>("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const prefersReduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || typeof IntersectionObserver === "undefined") {
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.92) {
      return;
    }

    setPhase("pending");

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setPhase("visible");
          observer.disconnect();
        }
      },
      {
        threshold: 0.06,
        rootMargin: "0px 0px -48px 0px",
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, []);

  const revealClasses =
    phase === "idle"
      ? ""
      : phase === "pending"
        ? distance === "sm"
          ? "scroll-reveal-base scroll-reveal-pending-sm"
          : "scroll-reveal-base scroll-reveal-pending"
        : "scroll-reveal-base scroll-reveal-visible";

  return (
    <div
      ref={ref}
      style={
        delayMs && phase !== "idle"
          ? { transitionDelay: `${delayMs}ms` }
          : undefined
      }
      className={`${revealClasses} ${className}`.trim()}
    >
      {stepLabel && (
        <div
          aria-hidden="true"
          className="mb-3.5 flex items-center gap-2.5 lg:hidden"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] whitespace-nowrap">
            {stepLabel}
          </span>
          <span className="h-px flex-1 bg-[var(--border-subtle)]/70" />
        </div>
      )}
      {children}
    </div>
  );
}

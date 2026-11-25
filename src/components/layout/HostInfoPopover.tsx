"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { HelpCircle, X } from "lucide-react";

interface HostInfoPopoverProps {
  mode: "desktop" | "mobile";
  active?: boolean;
  onNavigate?: () => void;
}

/**
 * Opción secundaria discreta "Ser anfitrión" para la vista de huésped,
 * acompañada por una micro-indicación emergente de 1–2 líneas directas.
 */
export function HostInfoPopover({
  mode,
  active = false,
  onNavigate,
}: HostInfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  if (mode === "mobile") {
    return (
      <div
        ref={containerRef}
        className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 px-3.5 py-2.5 space-y-2"
      >
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/onboarding/anfitrion"
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`text-xs font-bold transition-colors ${
              active
                ? "text-[var(--brand-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            ¿Tenés una unidad?{" "}
            <span className="underline">Ser anfitrión</span>
          </Link>

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls={popoverId}
            aria-label="¿Qué significa ser anfitrión?"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {open && (
          <div
            id={popoverId}
            role="note"
            className="animate-ibita-fade-up rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-[11px] text-[var(--text-secondary)] leading-snug"
          >
            <strong className="text-[var(--text-primary)]">
              ¿Qué es ser anfitrión?
            </strong>{" "}
            Publicá tu espacio en I-bita y gestioná reservas, cobros y calendarios en un solo lugar.
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="relative hidden lg:inline-flex items-center gap-1"
    >
      <Link
        href="/onboarding/anfitrion"
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`inline-flex min-h-[34px] items-center rounded-full px-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
          active
            ? "bg-[var(--surface-tint)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/30"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
        }`}
      >
        Ser anfitrión
      </Link>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label="¿Qué significa ser anfitrión?"
        title="¿Qué es ser anfitrión?"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors cursor-pointer"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Información sobre ser anfitrión"
          className="animate-ibita-fade-up absolute right-0 top-full z-50 mt-2 w-[260px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 text-left shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              ¿Qué es ser anfitrión?
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar aviso"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">
            Publicá tu espacio en I-bita y gestioná reservas, cobros y calendarios en un solo lugar.
          </p>
        </div>
      )}
    </div>
  );
}

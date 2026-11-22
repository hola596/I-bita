"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/ui/Icon3D";

interface ProgressiveDisclosureProps {
  title: string;
  subtitle?: string;
  icon?: Icon3DName;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Componente de revelación progresiva accesible: mantiene limpia la pantalla inicial
 * y revela detalles adicionales solo cuando la persona decide explorarlos.
 */
export function ProgressiveDisclosure({
  title,
  subtitle,
  icon = "compass",
  badge,
  defaultOpen = false,
  children,
  className = "",
}: ProgressiveDisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section
      className={`surface-card overflow-hidden transition-colors ${className}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-5 sm:px-6 text-left hover:bg-[var(--bg-secondary)]/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <Icon3D name={icon} size="md" />
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                {title}
              </span>
              {badge && (
                <span className="rounded-full bg-[var(--surface-tint)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--brand-primary)]">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-snug">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-primary)]">
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          className="animate-ibita-fade-up border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]/45 p-5 sm:p-6"
        >
          {children}
        </div>
      )}
    </section>
  );
}

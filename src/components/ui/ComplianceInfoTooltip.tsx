"use client";

import { useState } from "react";
import { Info } from "lucide-react";

interface ComplianceInfoTooltipProps {
  label: string;
  explanation: string;
  className?: string;
}

/**
 * Aclaración objetiva accesible (Ley 24.240 Art. 8) para evitar afirmaciones
 * publicitarias absolutas sin alcance visible. Funciona con click/focus en mobile y desktop.
 */
export function ComplianceInfoTooltip({
  label,
  explanation,
  className = "",
}: ComplianceInfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onBlur={() => setOpen(false)}
        aria-label={label}
        aria-expanded={open}
        title={explanation}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] cursor-pointer"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-40 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 text-[11px] font-medium leading-snug text-[var(--text-primary)] shadow-xl text-left whitespace-normal"
        >
          {explanation}
        </span>
      )}
    </span>
  );
}

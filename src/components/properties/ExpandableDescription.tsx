"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface ExpandableDescriptionProps {
  text: string;
}

/**
 * Muestra la descripción completa en escritorio y una vista colapsada con botón
 * táctil de expansión en pantallas móviles cuando el texto es extenso.
 */
export function ExpandableDescription({ text }: ExpandableDescriptionProps) {
  const [expanded, setExpanded] = useState(false);

  if (text.length <= 240) {
    return (
      <p className="text-sm sm:text-base leading-relaxed text-[var(--text-primary)] whitespace-pre-line">
        {text}
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <p
        className={`text-sm sm:text-base leading-relaxed text-[var(--text-primary)] whitespace-pre-line ${
          expanded ? "" : "line-clamp-4 sm:line-clamp-none"
        }`}
      >
        {text}
      </p>

      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="sm:hidden inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 text-xs font-extrabold text-[var(--text-primary)] hover:border-[var(--brand-primary)] transition-colors cursor-pointer"
      >
        <span>
          {expanded ? "Mostrar menos" : "Leer descripción completa"}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

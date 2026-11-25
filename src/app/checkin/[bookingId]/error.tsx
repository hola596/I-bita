"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface CheckinErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CheckinErrorBoundary({
  reset,
}: CheckinErrorProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <section
        role="alert"
        className="surface-card p-6 sm:p-8 text-center space-y-5"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Tuvimos un inconveniente al actualizar la pantalla
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
            Tu avance guardado no se perdió. Tocá reintentar o recargá la página para ver el estado actual de tu verificación.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Reintentar ahora</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
            className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
          >
            Recargar página
          </button>

          <Link
            href="/perfil"
            className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
          >
            Ir a mi perfil
          </Link>
        </div>
      </section>
    </div>
  );
}

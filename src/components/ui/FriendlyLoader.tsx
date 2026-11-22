import { Icon3D, type Icon3DName } from "@/components/ui/Icon3D";

interface FriendlyLoaderProps {
  message?: string;
  subtitle?: string;
  icon?: Icon3DName;
}

/**
 * Estado de espera amigable y calmo para reducir fricción percibida (Estado de Flujo).
 */
export function FriendlyLoader({
  message = "Preparando todo para vos...",
  subtitle = "En unos segundos vas a ver tu información lista.",
  icon = "compass",
}: FriendlyLoaderProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-3xl px-4 py-12 space-y-6"
    >
      <div className="surface-card p-6 sm:p-8 flex flex-col items-center text-center space-y-3">
        <div className="animate-ibita-float">
          <Icon3D name={icon} size="lg" />
        </div>
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
          {message}
        </h2>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md">
          {subtitle}
        </p>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
          <div className="animate-ibita-progress h-full w-1/2 rounded-full bg-[var(--brand-primary)]" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-hidden="true">
        <div className="surface-card p-5 space-y-3">
          <div className="h-4 w-2/3 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
          <div className="h-3 w-full rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
          <div className="h-3 w-4/5 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
        </div>
        <div className="surface-card p-5 space-y-3">
          <div className="h-4 w-1/2 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
          <div className="h-3 w-full rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
          <div className="h-3 w-3/4 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
        </div>
      </div>
    </div>
  );
}

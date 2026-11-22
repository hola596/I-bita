import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon3D, type Icon3DName } from "@/components/ui/Icon3D";

interface AchievementAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface AchievementBannerProps {
  title: string;
  description: string;
  icon?: Icon3DName;
  tone?: "emerald" | "coral" | "sky";
  action?: AchievementAction;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<AchievementBannerProps["tone"]>, string> = {
  emerald:
    "border-emerald-600/50 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]",
  coral:
    "border-[var(--brand-primary)]/40 bg-[var(--surface-tint)] text-[var(--text-primary)]",
  sky:
    "border-sky-600/40 bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)]",
};

/**
 * Refuerzo positivo y sentido de logro al completar hitos clave de la experiencia.
 */
export function AchievementBanner({
  title,
  description,
  icon = "trophy",
  tone = "emerald",
  action,
  className = "",
}: AchievementBannerProps) {
  return (
    <div
      role="status"
      className={`animate-ibita-fade-up rounded-2xl border-2 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${TONE_CLASSES[tone]} ${className}`}
    >
      <div className="flex items-start sm:items-center gap-3.5">
        <Icon3D name={icon} size="md" />
        <div className="space-y-0.5">
          <p className="text-sm sm:text-base font-extrabold leading-snug">
            {title}
          </p>
          <p className="text-xs sm:text-sm opacity-90 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {action &&
        (action.href ? (
          <Link
            href={action.href}
            className="btn-primary-3d inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap"
          >
            <span>{action.label}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="btn-primary-3d inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-extrabold whitespace-nowrap"
          >
            <span>{action.label}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
    </div>
  );
}

"use client";

interface NotificationCountBadgeProps {
  count: number;
  label?: string;
  className?: string;
}

export function NotificationCountBadge({
  count,
  label,
  className = "",
}: NotificationCountBadgeProps) {
  if (!count || count <= 0) return null;
  const display = count > 9 ? "9+" : String(count);

  return (
    <span
      aria-label={label ?? `${count} notificaciones nuevas`}
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-black leading-none text-white shadow-xs ${className}`}
    >
      {display}
    </span>
  );
}

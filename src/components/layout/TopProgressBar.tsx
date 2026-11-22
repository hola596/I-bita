"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Barra superior discreta de retroalimentación visual durante cambios de página.
 */
export function TopProgressBar() {
  const pathname = usePathname();
  const [navigating, setNavigating] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setNavigating(false);
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      if (href === pathname || href.startsWith("#")) return;

      setNavigating(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setNavigating(false), 5000);
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [pathname]);

  if (!navigating) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-[var(--surface-tint)]"
    >
      <div className="animate-ibita-progress h-full w-1/2 rounded-r-full bg-[var(--brand-primary)]" />
    </div>
  );
}

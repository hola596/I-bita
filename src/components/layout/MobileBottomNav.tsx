"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Compass,
  MessageSquare,
  Search,
  User,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface MobileSessionSummary {
  id: string;
  role: string | null;
  hostApprovalStatus: string | null;
}

const HIDDEN_PREFIXES = [
  "/checkout",
  "/checkin",
  "/contratos",
  "/verify",
  "/login",
  "/onboarding",
] as const;

/**
 * Barra inferior flotante estilo app nativa para navegación rápida en pantallas móviles (< lg).
 */
export function MobileBottomNav() {
  const pathname = usePathname() || "/";
  const [sessionUser, setSessionUser] = useState<MobileSessionSummary | null>(
    null
  );

  const shouldHide = HIDDEN_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  useEffect(() => {
    if (shouldHide) return;

    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function syncSessionUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!active) return;

        if (!user) {
          setSessionUser(null);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, host_approval_status")
          .eq("id", user.id)
          .maybeSingle();

        if (!active) return;

        setSessionUser({
          id: user.id,
          role: profile?.role ?? null,
          hostApprovalStatus: profile?.host_approval_status ?? null,
        });
      } catch {
        if (active) setSessionUser(null);
      }
    }

    void syncSessionUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncSessionUser();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, shouldHide]);

  if (shouldHide) {
    return null;
  }

  const isApprovedHost =
    sessionUser?.role === "SUPERADMIN" ||
    (sessionUser?.role === "HOST" &&
      sessionUser?.hostApprovalStatus === "APPROVED");

  const items = [
    {
      href: "/",
      label: "Inicio",
      icon: Compass,
      active: pathname === "/",
      showOnlineDot: false,
    },
    {
      href: "/#alojamientos-disponibles",
      label: "Buscar",
      icon: Search,
      active: pathname.startsWith("/p/"),
      showOnlineDot: false,
    },
    ...(sessionUser
      ? [
          {
            href: "/mensajes",
            label: "Mensajes",
            icon: MessageSquare,
            active: pathname.startsWith("/mensajes"),
            showOnlineDot: false,
          },
        ]
      : []),
    {
      href: isApprovedHost ? "/dashboard/propiedades" : "/onboarding/anfitrion",
      label: isApprovedHost ? "Panel" : "Anfitrión",
      icon: Building2,
      active:
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/onboarding/anfitrion"),
      showOnlineDot: false,
    },
    {
      href: sessionUser ? "/perfil" : "/login",
      label: sessionUser ? "Perfil" : "Ingresar",
      icon: User,
      active: pathname === "/perfil" || pathname.startsWith("/login"),
      showOnlineDot: Boolean(sessionUser),
    },
  ] as const;

  return (
    <nav
      aria-label="Navegación rápida móvil"
      className="lg:hidden fixed bottom-3.5 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md rounded-full border border-white/15 bg-slate-950/92 px-1.5 py-1.5 text-white shadow-[0_14px_34px_-8px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-white/20 dark:bg-slate-900/95"
    >
      <div
        className={
          items.length === 5
            ? "grid grid-cols-5 gap-0.5"
            : "grid grid-cols-4 gap-0.5"
        }
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={`relative flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1 text-[10px] font-extrabold transition-colors whitespace-nowrap ${
                item.active
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-white/80 hover:text-white"
              }`}
            >
              <span className="relative inline-flex items-center justify-center">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.showOnlineDot && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full border border-slate-950 bg-emerald-400"
                  />
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

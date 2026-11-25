"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Compass,
  HelpCircle,
  MessageSquare,
  Search,
  User,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  EMPTY_NOTIFICATIONS_SUMMARY,
  NOTIFICATIONS_REFRESH_EVENT,
  fetchNotificationsSummary,
  type NotificationsSummaryPayload,
} from "@/lib/notifications/client-events";

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
  const [notificationsSummary, setNotificationsSummary] =
    useState<NotificationsSummaryPayload>(EMPTY_NOTIFICATIONS_SUMMARY);

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
          setNotificationsSummary(EMPTY_NOTIFICATIONS_SUMMARY);
          return;
        }

        const [{ data: profile }, summary] = await Promise.all([
          supabase
            .from("profiles")
            .select("role, host_approval_status")
            .eq("id", user.id)
            .maybeSingle(),
          fetchNotificationsSummary(),
        ]);

        if (!active) return;

        setSessionUser({
          id: user.id,
          role: profile?.role ?? null,
          hostApprovalStatus: profile?.host_approval_status ?? null,
        });
        setNotificationsSummary(summary);
      } catch {
        if (active) {
          setSessionUser(null);
          setNotificationsSummary(EMPTY_NOTIFICATIONS_SUMMARY);
        }
      }
    }

    async function refreshNotificationsOnly() {
      if (!active) return;
      const summary = await fetchNotificationsSummary();
      if (active) {
        setNotificationsSummary(summary);
      }
    }

    void syncSessionUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void syncSessionUser();
    });

    const onCustomRefresh = () => {
      void refreshNotificationsOnly();
    };
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onCustomRefresh);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onCustomRefresh);
    };
  }, [pathname, shouldHide]);

  if (shouldHide) {
    return null;
  }

  const isApprovedHost =
    sessionUser?.role === "SUPERADMIN" ||
    (sessionUser?.role === "HOST" &&
      sessionUser?.hostApprovalStatus === "APPROVED");

  const items: Array<{
    href: string;
    label: string;
    icon: typeof Compass;
    active: boolean;
    showOnlineDot?: boolean;
    badgeCount?: number;
  }> = [
    {
      href: "/",
      label: "Inicio",
      icon: Compass,
      active: pathname === "/",
    },
    {
      href: "/#alojamientos-disponibles",
      label: "Buscar",
      icon: Search,
      active: pathname.startsWith("/p/"),
    },
    ...(sessionUser
      ? [
          {
            href: "/mensajes",
            label: "Mensajes",
            icon: MessageSquare,
            active: pathname.startsWith("/mensajes"),
            badgeCount: notificationsSummary.unreadMessagesCount,
          },
        ]
      : [
          {
            href: "/contacto",
            label: "Ayuda",
            icon: HelpCircle,
            active: pathname.startsWith("/contacto"),
          },
        ]),
    ...(isApprovedHost
      ? [
          {
            href: "/dashboard/propiedades",
            label: "Panel",
            icon: Building2,
            active: pathname.startsWith("/dashboard"),
            badgeCount: notificationsSummary.pendingHostRequestsCount,
          },
        ]
      : []),
    {
      href: sessionUser ? "/perfil" : "/login",
      label: sessionUser ? "Perfil" : "Ingresar",
      icon: User,
      active: pathname === "/perfil" || pathname.startsWith("/login"),
      showOnlineDot: Boolean(sessionUser),
    },
  ];

  const gridColsClass =
    items.length >= 5 ? "grid grid-cols-5 gap-0.5" : "grid grid-cols-4 gap-0.5";

  return (
    <nav
      aria-label="Navegación rápida móvil"
      className="lg:hidden fixed bottom-3.5 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1.5rem)] max-w-md rounded-full border border-white/15 bg-slate-950/92 px-1.5 py-1.5 text-white shadow-[0_14px_34px_-8px_rgba(15,23,42,0.65)] backdrop-blur-xl dark:border-white/20 dark:bg-slate-900/95"
    >
      <div className={gridColsClass}>
        {items.map((item) => {
          const Icon = item.icon;
          const badge = item.badgeCount ?? 0;
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
                {badge > 0 ? (
                  <span
                    aria-label={`${badge} notificaciones nuevas`}
                    className="absolute -right-2.5 -top-1.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#d90b38] px-1 text-[9px] font-black leading-none text-white ring-2 ring-slate-950"
                  >
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : item.showOnlineDot ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full border border-slate-950 bg-emerald-400"
                  />
                ) : null}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

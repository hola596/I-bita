"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Moon, Sun, Type, UserCheck, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { isCryptoPaymentsEnabled } from "@/lib/compliance/feature-flags";
import { HostInfoPopover } from "@/components/layout/HostInfoPopover";
import { NotificationCountBadge } from "@/components/layout/NotificationCountBadge";
import {
  EMPTY_NOTIFICATIONS_SUMMARY,
  NOTIFICATIONS_REFRESH_EVENT,
  fetchNotificationsSummary,
  type NotificationsSummaryPayload,
} from "@/lib/notifications/client-events";

interface NavItem {
  href: string;
  label: string;
  matchPrefix: string;
  badgeCount?: number;
  badgeLabel?: string;
}

interface SessionUserSummary {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string | null;
  hostApprovalStatus: string | null;
}

function getInitials(fullName: string | null, email: string | null): string {
  const cleanName = fullName?.trim() ?? "";
  if (cleanName) {
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  }
  const cleanEmail = email?.trim() ?? "";
  return cleanEmail ? cleanEmail.slice(0, 2).toUpperCase() : "IB";
}

function getShortName(fullName: string | null, email: string | null): string {
  const cleanName = fullName?.trim() ?? "";
  if (cleanName) {
    return cleanName.split(/\s+/)[0] ?? cleanName;
  }
  const localPart = email?.split("@")[0]?.trim() ?? "";
  return localPart || "Mi cuenta";
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    theme,
    toggleTheme,
    readingSize,
    toggleReadingSize,
    currency,
    setCurrency,
    notify,
  } = usePreferences();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUserSummary | null>(
    null
  );
  const [notificationsSummary, setNotificationsSummary] =
    useState<NotificationsSummaryPayload>(EMPTY_NOTIFICATIONS_SUMMARY);

  useEffect(() => {
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
            .select("full_name, role, host_approval_status")
            .eq("id", user.id)
            .maybeSingle(),
          fetchNotificationsSummary(),
        ]);

        if (!active) return;

        setSessionUser({
          id: user.id,
          email: user.email ?? null,
          fullName: profile?.full_name ?? null,
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
    const onWindowFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshNotificationsOnly();
      }
    };

    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onCustomRefresh);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onWindowFocus);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshNotificationsOnly();
      }
    }, 45000);

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onCustomRefresh);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onWindowFocus);
      window.clearInterval(intervalId);
    };
  }, [pathname]);

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setSessionUser(null);
    setMobileMenuOpen(false);
    notify("Cerraste sesión correctamente. ¡Hasta pronto!", "info", "user");
    router.push("/");
    router.refresh();
  };

  const isApprovedHost =
    sessionUser?.role === "SUPERADMIN" ||
    (sessionUser?.role === "HOST" &&
      sessionUser?.hostApprovalStatus === "APPROVED");

  const primaryNav: ReadonlyArray<NavItem> = [
    { href: "/", label: "Inicio", matchPrefix: "/" },
    {
      href: "/#alojamientos-disponibles",
      label: "Hospedajes",
      matchPrefix: "/p/",
    },
    ...(sessionUser
      ? [
          {
            href: "/mensajes",
            label: "Mensajes",
            matchPrefix: "/mensajes",
            badgeCount: notificationsSummary.unreadMessagesCount,
            badgeLabel: `${notificationsSummary.unreadMessagesCount} mensajes sin leer`,
          },
        ]
      : []),
    ...(isApprovedHost
      ? [
          {
            href: "/dashboard/propiedades",
            label: "Mis propiedades",
            matchPrefix: "/dashboard",
            badgeCount: notificationsSummary.pendingHostRequestsCount,
            badgeLabel: `${notificationsSummary.pendingHostRequestsCount} solicitudes pendientes`,
          },
        ]
      : []),
    { href: "/contacto", label: "Ayuda", matchPrefix: "/contacto" },
  ];

  const isNavActive = (item: NavItem) => {
    if (item.matchPrefix === "/") return pathname === "/";
    if (
      item.matchPrefix === "/onboarding/anfitrion" &&
      pathname.startsWith("/dashboard")
    ) {
      return true;
    }
    return pathname.startsWith(item.matchPrefix);
  };

  const initials = sessionUser
    ? getInitials(sessionUser.fullName, sessionUser.email)
    : "";
  const shortName = sessionUser
    ? getShortName(sessionUser.fullName, sessionUser.email)
    : "";
  const onProfilePage = pathname === "/perfil";

  const statusTagLabel = isApprovedHost
    ? "Anfitrión"
    : sessionUser?.hostApprovalStatus === "PENDING_APPROVAL"
      ? "En revisión"
      : "Mi perfil";

  return (
    <header
      role="banner"
      className="sticky top-0 z-40 border-b border-[var(--border-subtle)]/75 bg-[var(--bg-primary)]/85 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-3 px-3.5 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 sm:gap-2.5 whitespace-nowrap rounded-xl px-1 py-0.5 text-lg sm:text-xl font-extrabold tracking-tight text-[var(--brand-primary)]"
          aria-label="I-bita Inicio"
        >
          <Icon3D name="home" size="sm" />
          <span className="whitespace-nowrap">i-bita</span>
          <span className="hidden sm:inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
            Argentina
          </span>
        </Link>

        {/* Navegación principal diferenciada por rol */}
        <div className="hidden lg:flex items-center gap-2">
          <nav
            aria-label="Navegación principal"
            className="flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/85 p-1"
          >
            {primaryNav.map((item) => {
              const active = isNavActive(item);
              const badgeCount = item.badgeCount ?? 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    badgeCount > 0 ? `${item.label} (${item.badgeLabel})` : undefined
                  }
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs font-extrabold transition-colors whitespace-nowrap ${
                    active
                      ? "bg-[var(--bg-primary)] text-[var(--brand-primary)] shadow-xs border border-[var(--border-subtle)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)]/60"
                  }`}
                >
                  <span>{item.label}</span>
                  <NotificationCountBadge
                    count={badgeCount}
                    label={item.badgeLabel}
                  />
                </Link>
              );
            })}
          </nav>

          {!isApprovedHost && (
            <HostInfoPopover
              mode="desktop"
              active={pathname.startsWith("/onboarding/anfitrion")}
            />
          )}
        </div>

        {/* Controles de personalización, moneda y estado de sesión */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div
            role="group"
            aria-label="Elegir moneda de los precios"
            className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-extrabold"
          >
            <button
              type="button"
              onClick={() => setCurrency("ARS")}
              aria-pressed={currency === "ARS"}
              className={`min-h-[34px] rounded-full px-2 sm:px-3 transition-colors whitespace-nowrap cursor-pointer ${
                currency === "ARS"
                  ? "bg-[var(--brand-primary)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              ARS $
            </button>
            {isCryptoPaymentsEnabled() && (
              <button
                type="button"
                onClick={() => setCurrency("USDT")}
                aria-pressed={currency === "USDT"}
                className={`min-h-[34px] rounded-full px-2 sm:px-3 transition-colors whitespace-nowrap cursor-pointer ${
                  currency === "USDT"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                USDT ₮
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={toggleReadingSize}
            aria-pressed={readingSize === "comfortable"}
            aria-label={
              readingSize === "comfortable"
                ? "Volver a texto normal"
                : "Agrandar texto para leer más cómodo"
            }
            title="Agrandar texto"
            className={`hidden sm:inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
              readingSize === "comfortable"
                ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
            }`}
          >
            <Type className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{readingSize === "comfortable" ? "Texto A+" : "A+"}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
            aria-label={
              theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
            }
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            className="hidden sm:inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer whitespace-nowrap"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                <span className="hidden md:inline">Claro</span>
              </>
            ) : (
              <>
                <Moon className="h-3.5 w-3.5 text-indigo-600" aria-hidden="true" />
                <span className="hidden md:inline">Oscuro</span>
              </>
            )}
          </button>

          {sessionUser ? (
            <>
              <Link
                href="/perfil"
                aria-current={onProfilePage ? "page" : undefined}
                aria-label={`Tu perfil (${shortName})`}
                className={`hidden sm:inline-flex min-h-[40px] items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-xs font-extrabold transition-colors whitespace-nowrap ${
                  onProfilePage
                    ? "border-emerald-600 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)] shadow-xs"
                    : "border-emerald-600/45 bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-emerald-600 hover:bg-[var(--badge-consorcio-bg)]/50"
                }`}
              >
                <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-black text-white">
                  {initials}
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-primary)] bg-emerald-400"
                  />
                </span>
                <span className="max-w-[100px] truncate">{shortName}</span>
                <span className="hidden md:inline-block rounded-full bg-emerald-700/15 px-2 py-0.5 text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300">
                  {statusTagLabel}
                </span>
              </Link>

              <Link
                href="/perfil"
                aria-current={onProfilePage ? "page" : undefined}
                aria-label={`Sesión activa (${shortName}). Ir a mi perfil`}
                className="sm:hidden relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-600/50 bg-emerald-700 text-[11px] font-black text-white"
              >
                {initials}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-primary)] bg-emerald-400"
                />
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="btn-primary-3d hidden sm:inline-flex min-h-[40px] items-center rounded-full px-4 text-xs font-extrabold whitespace-nowrap"
            >
              Ingresar
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-drawer"
            aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú de navegación"}
            className="lg:hidden relative inline-flex min-h-[42px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-xs font-extrabold text-[var(--text-primary)] cursor-pointer"
          >
            {mobileMenuOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{mobileMenuOpen ? "Cerrar" : "Menú"}</span>
            {!mobileMenuOpen && (
              <NotificationCountBadge
                count={notificationsSummary.totalAttentionCount}
                label={`${notificationsSummary.totalAttentionCount} novedades pendientes`}
              />
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          id="mobile-nav-drawer"
          className="lg:hidden animate-ibita-fade-up border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-4 space-y-4 shadow-xl"
        >
          {sessionUser && (
            <div className="rounded-2xl border border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-black text-white">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-[var(--badge-consorcio-text)] flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Sesión activa</span>
                    </p>
                    <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                      {sessionUser.fullName || sessionUser.email}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--bg-primary)] px-2.5 py-0.5 text-[10px] font-extrabold text-[var(--text-primary)]">
                  {isApprovedHost
                    ? "Anfitrión"
                    : sessionUser.hostApprovalStatus === "PENDING_APPROVAL"
                      ? "En revisión"
                      : "Huésped"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/perfil"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn-primary-3d flex min-h-[44px] items-center justify-center rounded-xl px-3 text-xs font-extrabold"
                >
                  Ir a mi perfil
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="btn-secondary-3d flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-extrabold"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cerrar sesión</span>
                </button>
              </div>
            </div>
          )}

          <nav aria-label="Menú móvil" className="grid grid-cols-1 gap-2">
            {primaryNav.map((item) => {
              const active = isNavActive(item);
              const badgeCount = item.badgeCount ?? 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[48px] items-center justify-between rounded-2xl border px-4 text-sm font-extrabold ${
                    active
                      ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <span>{item.label}</span>
                    <NotificationCountBadge
                      count={badgeCount}
                      label={item.badgeLabel}
                    />
                  </span>
                  {active && (
                    <span className="text-xs font-bold">Estás acá</span>
                  )}
                </Link>
              );
            })}
            {!isApprovedHost && (
              <HostInfoPopover
                mode="mobile"
                active={pathname.startsWith("/onboarding/anfitrion")}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            )}
            {!sessionUser && (
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-primary-3d flex min-h-[48px] items-center justify-center rounded-2xl px-4 text-sm font-extrabold"
              >
                Ingresar a mi cuenta
              </Link>
            )}
          </nav>

          <div className="border-t border-[var(--border-subtle)] pt-3 space-y-2">
            <p className="text-xs font-bold text-[var(--text-secondary)]">
              Comodidad visual
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="btn-secondary-3d flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold"
              >
                {theme === "dark" ? (
                  <>
                    <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
                    <span>Modo claro</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                    <span>Modo oscuro</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={toggleReadingSize}
                className="btn-secondary-3d flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-extrabold"
              >
                <Type className="h-4 w-4" aria-hidden="true" />
                <span>
                  {readingSize === "comfortable"
                    ? "Texto estándar"
                    : "Texto grande"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

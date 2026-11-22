"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface RouteWayfinderMeta {
  currentLabel: string;
  parentHref: string;
  parentLabel: string;
  breadcrumbs: BreadcrumbItem[];
  journeyStep?: 1 | 2 | 3 | 4;
  bookingId?: string;
}

const DEMO_BOOKING_ID = "00000000-0000-4000-8000-000000000100";
const DEMO_TOKEN = "00000000-0000-4000-8000-000000000777";

function resolveWayfinderMeta(pathname: string): RouteWayfinderMeta {
  if (pathname.startsWith("/p/")) {
    return {
      currentLabel: "Detalle del alojamiento",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Alojamiento" },
      ],
      journeyStep: 1,
    };
  }

  if (pathname.startsWith("/checkout")) {
    const segs = pathname.split("/").filter(Boolean);
    const bookingId = segs[1];
    return {
      currentLabel: "Pago seguro",
      parentHref: "/p/loft-luminoso-palermo-soho",
      parentLabel: "Volver al alojamiento",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Alojamiento", href: "/p/loft-luminoso-palermo-soho" },
        { label: "Pago seguro" },
      ],
      journeyStep: 2,
      bookingId,
    };
  }

  if (pathname.startsWith("/contratos")) {
    const segs = pathname.split("/").filter(Boolean);
    const bookingId = segs[1];
    const checkoutHref = bookingId
      ? `/checkout/${bookingId}`
      : `/checkout/${DEMO_BOOKING_ID}`;
    return {
      currentLabel: "Acuerdo legal",
      parentHref: checkoutHref,
      parentLabel: "Volver al pago",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Alojamiento", href: "/p/loft-luminoso-palermo-soho" },
        { label: "Pago", href: checkoutHref },
        { label: "Acuerdo legal" },
      ],
      journeyStep: 3,
      bookingId,
    };
  }

  if (pathname.startsWith("/checkin")) {
    const segs = pathname.split("/").filter(Boolean);
    const bookingId = segs[1];
    const contractHref =
      bookingId && bookingId !== DEMO_BOOKING_ID
        ? `/contratos/${bookingId}`
        : `/contratos/${DEMO_BOOKING_ID}?token=${DEMO_TOKEN}`;
    return {
      currentLabel: "Confirmar identidad",
      parentHref: contractHref,
      parentLabel: "Volver al acuerdo",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Alojamiento", href: "/p/loft-luminoso-palermo-soho" },
        { label: "Acuerdo", href: contractHref },
        { label: "Confirmar identidad" },
      ],
      journeyStep: 4,
      bookingId,
    };
  }

  if (pathname.startsWith("/onboarding/anfitrion")) {
    return {
      currentLabel: "Alta de anfitrión",
      parentHref: "/dashboard/propiedades",
      parentLabel: "Volver a mis propiedades",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Panel de anfitriones", href: "/dashboard/propiedades" },
        { label: "Alta de anfitrión" },
      ],
    };
  }

  if (pathname.startsWith("/dashboard/propiedades")) {
    return {
      currentLabel: "Panel de anfitriones",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Panel de anfitriones" },
      ],
    };
  }

  if (pathname.startsWith("/admin/aprobaciones")) {
    return {
      currentLabel: "Aprobación de anfitriones",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Aprobación de anfitriones" },
      ],
    };
  }

  if (pathname.startsWith("/perfil")) {
    return {
      currentLabel: "Mi perfil",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Mi perfil" },
      ],
    };
  }

  if (pathname.startsWith("/login")) {
    return {
      currentLabel: "Ingresar a mi cuenta",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Ingresar" },
      ],
    };
  }

  if (pathname.startsWith("/contacto")) {
    return {
      currentLabel: "Ayuda y contacto",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Ayuda y contacto" },
      ],
    };
  }

  if (pathname.startsWith("/mensajes")) {
    return {
      currentLabel: "Mensajes",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Mensajes" },
      ],
    };
  }

  if (pathname.startsWith("/legal/privacidad")) {
    return {
      currentLabel: "Privacidad y cuidado de datos",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Privacidad" },
      ],
    };
  }

  if (pathname.startsWith("/legal/terminos")) {
    return {
      currentLabel: "Términos y condiciones",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Términos" },
      ],
    };
  }

  if (pathname.startsWith("/verify")) {
    return {
      currentLabel: "Pase de portería",
      parentHref: "/",
      parentLabel: "Volver al inicio",
      breadcrumbs: [
        { label: "Inicio", href: "/" },
        { label: "Pase de portería" },
      ],
    };
  }

  return {
    currentLabel: "Sección actual",
    parentHref: "/",
    parentLabel: "Volver al inicio",
    breadcrumbs: [{ label: "Inicio", href: "/" }, { label: "Explorar" }],
  };
}

/**
 * Barra de orientación permanente (breadcrumbs, botón Volver explícito y guía de pasos):
 * asegura que el usuario siempre sepa dónde está, cómo llegó, qué sigue y cómo volver.
 */
export function NavigationWayfinder() {
  const pathname = usePathname();
  const router = useRouter();

  if (!pathname || pathname === "/") {
    return null;
  }

  const meta = resolveWayfinderMeta(pathname);
  const activeBookingId = meta.bookingId ?? DEMO_BOOKING_ID;
  const demoTokenQuery =
    activeBookingId === DEMO_BOOKING_ID ? `?token=${DEMO_TOKEN}` : "";

  const journeySteps = [
    {
      step: 1 as const,
      label: "Elegir estadía",
      href: "/p/loft-luminoso-palermo-soho",
    },
    {
      step: 2 as const,
      label: "Pagar seguro",
      href: `/checkout/${activeBookingId}`,
    },
    {
      step: 3 as const,
      label: "Firmar acuerdo",
      href: `/contratos/${activeBookingId}${demoTokenQuery}`,
    },
    {
      step: 4 as const,
      label: "Confirmar identidad",
      href: `/checkin/${activeBookingId}${demoTokenQuery}`,
    },
  ];

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(meta.parentHref);
  };

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={handleBack}
              className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold whitespace-nowrap"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Volver</span>
            </button>

            <nav aria-label="Ruta de ubicación actual" className="min-w-0">
              <ol className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                {meta.breadcrumbs.map((crumb, idx) => {
                  const isLast = idx === meta.breadcrumbs.length - 1;
                  return (
                    <li key={`${crumb.label}-${idx}`} className="inline-flex items-center gap-1.5">
                      {idx > 0 && (
                        <ChevronRight
                          className="h-3.5 w-3.5 opacity-60 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {crumb.href && !isLast ? (
                        <Link
                          href={crumb.href}
                          className="hover:text-[var(--brand-primary)] hover:underline whitespace-nowrap"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span
                          aria-current={isLast ? "location" : undefined}
                          className="font-extrabold text-[var(--text-primary)] whitespace-nowrap"
                        >
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          <Link
            href={meta.parentHref}
            className="text-xs font-bold text-[var(--brand-primary)] hover:underline whitespace-nowrap"
          >
            {meta.parentLabel}
          </Link>
        </div>

        {/* Guía visual de 4 etapas en el recorrido de reserva */}
        {meta.journeyStep && (
          <nav aria-label="Pasos de tu reserva">
            <ol className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {journeySteps.map((item) => {
                const isDone = item.step < meta.journeyStep!;
                const isCurrent = item.step === meta.journeyStep;
                return (
                  <li key={item.step}>
                    <Link
                      href={item.href}
                      aria-current={isCurrent ? "step" : undefined}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                        isCurrent
                          ? "border-[var(--brand-primary)] bg-[var(--bg-primary)] text-[var(--brand-primary)] font-extrabold shadow-xs"
                          : isDone
                            ? "border-emerald-600/35 bg-[var(--badge-consorcio-bg)]/60 text-[var(--badge-consorcio-text)] font-bold"
                            : "border-[var(--border-subtle)] bg-[var(--bg-primary)]/70 text-[var(--text-secondary)] font-semibold hover:border-[var(--brand-primary)]/50"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                            isCurrent
                              ? "bg-[var(--brand-primary)] text-white"
                              : isDone
                                ? "bg-emerald-700 text-white"
                                : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {isDone ? (
                            <Check className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            item.step
                          )}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      {isCurrent && (
                        <span className="hidden sm:inline-block rounded-full bg-[var(--surface-tint)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--brand-primary)] shrink-0">
                          Estás acá
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
      </div>
    </div>
  );
}

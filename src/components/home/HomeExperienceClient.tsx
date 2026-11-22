"use client";

import { useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Coins,
  Heart,
  Home,
  MapPin,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Type,
  Users,
  Wifi,
  X,
} from "lucide-react";
import {
  convertCurrencyAmount,
  type StayPricingBreakdown,
} from "@/lib/math/money";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import type { PublicHomePropertySummary } from "@/app/page";
import { CORRIDOR_LABELS } from "@/modules/properties/validators";

interface HomeExperienceClientProps {
  shortStayArs: StayPricingBreakdown;
  shortStayUsdt: StayPricingBreakdown;
  midTermArs: StayPricingBreakdown;
  midTermUsdt: StayPricingBreakdown;
  availableProperties?: PublicHomePropertySummary[];
  userFirstName?: string | null;
  showDemoWalkthrough?: boolean;
}

type CategoryFilterId =
  | "ALL"
  | "CABA"
  | "COSTA_ATLANTICA"
  | "CORDOBA"
  | "VACA_MUERTA"
  | "MIDTERM"
  | "CONSORCIO";

const DEMO_BOOKING_ID = "00000000-0000-4000-8000-000000000100";
const DEMO_TOKEN = "00000000-0000-4000-8000-000000000777";

const HERO_IMAGE_URL =
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=85&fm=webp";
const COLLAGE_LEFT_URL =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80&fm=webp";
const COLLAGE_CENTER_URL =
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp";
const COLLAGE_RIGHT_URL =
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80&fm=webp";
const HOST_BANNER_URL =
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1000&q=80&fm=webp";

const FALLBACK_FEATURED_PROPERTY: PublicHomePropertySummary = {
  id: "demo-loft-palermo-soho",
  slug: "loft-luminoso-palermo-soho",
  title: "Loft de Diseño en Palermo Soho · Balcón y Coworking",
  corridor: "CABA",
  addressLine: "Gorriti 4800, Palermo Soho",
  unitIdentifier: "Piso 4 Depto B",
  maxAdults: 4,
  nightlyRate: 65000,
  baseCurrency: "ARS",
  monthlyDiscountPct: 20,
  wifiSpeedMbps: 300,
  acceptsUsdt: true,
  coverUrl: COLLAGE_CENTER_URL,
  coverAlt: "Loft luminoso en Palermo Soho con balcón y espacio de trabajo",
  imageCount: 5,
  isConsortiumFriendly: true,
  requiresInterview: false,
};

const CATEGORY_FILTERS: ReadonlyArray<{ id: CategoryFilterId; label: string }> =
  [
    { id: "ALL", label: "Todos" },
    { id: "CABA", label: "CABA" },
    { id: "COSTA_ATLANTICA", label: "Costa Atlántica" },
    { id: "CORDOBA", label: "Córdoba" },
    { id: "VACA_MUERTA", label: "Neuquén · Vaca Muerta" },
    { id: "MIDTERM", label: "Estadía larga (1–6m)" },
    { id: "CONSORCIO", label: "Edificio amigable" },
  ];

const SHORT_CORRIDOR_NAMES: Record<string, string> = {
  CABA: "CABA · Buenos Aires",
  COSTA_ATLANTICA: "Costa Atlántica",
  CORDOBA: "Córdoba",
  VACA_MUERTA: "Neuquén · Vaca Muerta",
};

const DESTINATION_CARDS: ReadonlyArray<{
  corridor: "CABA" | "COSTA_ATLANTICA" | "CORDOBA" | "VACA_MUERTA";
  title: string;
  subtitle: string;
  imageUrl: string;
}> = [
  {
    corridor: "CABA",
    title: "Buenos Aires",
    subtitle: "Palermo · Recoleta · Belgrano",
    imageUrl:
      "https://images.unsplash.com/photo-1612294037637-ec328d0e075e?auto=format&fit=crop&w=900&q=80&fm=webp",
  },
  {
    corridor: "COSTA_ATLANTICA",
    title: "Costa Atlántica",
    subtitle: "Mar del Plata · Pinamar · Cariló",
    imageUrl:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80&fm=webp",
  },
  {
    corridor: "CORDOBA",
    title: "Córdoba",
    subtitle: "Nueva Córdoba · Sierras",
    imageUrl:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=80&fm=webp",
  },
  {
    corridor: "VACA_MUERTA",
    title: "Vaca Muerta",
    subtitle: "Neuquén · Añelo corporativo",
    imageUrl:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=80&fm=webp",
  },
];

const TRUST_PILLARS = [
  {
    icon: Home,
    title: "Espacios equipados",
    description: "Listos para vivir y trabajar",
  },
  {
    icon: ShieldCheck,
    title: "Edificios tranquilos",
    description: "Ingreso ordenado en portería",
  },
  {
    icon: Wifi,
    title: "Wi-Fi fibra real",
    description: "Velocidad verificada por unidad",
  },
  {
    icon: Coins,
    title: "Pagá en ARS o USDT",
    description: "Cuotas sin recargos ocultos",
  },
] as const;

function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isNextImageConfiguredHost(url: string): boolean {
  return (
    url.startsWith("/") ||
    url.includes("images.unsplash.com") ||
    url.includes(".supabase.co")
  );
}

function formatMoney(amount: string | number, currency: "ARS" | "USDT"): string {
  const num = Number(amount);
  if (currency === "USDT") {
    return `${num.toLocaleString("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} USDT`;
  }
  return `$ ${Math.round(num).toLocaleString("es-AR")} ARS`;
}

function formatConvertedNightly(
  nightlyRate: number,
  baseCurrency: "ARS" | "USD" | "USDT",
  targetCurrency: "ARS" | "USDT"
): string {
  const converted = convertCurrencyAmount(
    nightlyRate,
    baseCurrency,
    targetCurrency
  );
  return formatMoney(converted, targetCurrency);
}

export function HomeExperienceClient({
  shortStayArs,
  shortStayUsdt,
  midTermArs,
  midTermUsdt,
  availableProperties = [],
  userFirstName = null,
  showDemoWalkthrough = false,
}: HomeExperienceClientProps) {
  const {
    theme,
    toggleTheme,
    readingSize,
    toggleReadingSize,
    currency,
    setCurrency,
    notify,
  } = usePreferences();

  const [stayMode, setStayMode] = useState<"short" | "midterm">("midterm");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<CategoryFilterId>("ALL");
  const [guestsCount, setGuestsCount] = useState<number>(1);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const catalog = useMemo(
    () =>
      availableProperties.length > 0
        ? availableProperties
        : [FALLBACK_FEATURED_PROPERTY],
    [availableProperties]
  );

  const featuredProperty = catalog[0] ?? FALLBACK_FEATURED_PROPERTY;

  const filteredProperties = useMemo(() => {
    const cleanQuery = normalizeText(searchQuery);

    return catalog.filter((prop) => {
      if (prop.maxAdults < guestsCount) {
        return false;
      }

      if (activeFilter === "MIDTERM" && prop.monthlyDiscountPct < 15) {
        return false;
      }
      if (activeFilter === "CONSORCIO" && !prop.isConsortiumFriendly) {
        return false;
      }
      if (
        (activeFilter === "CABA" ||
          activeFilter === "COSTA_ATLANTICA" ||
          activeFilter === "CORDOBA" ||
          activeFilter === "VACA_MUERTA") &&
        prop.corridor !== activeFilter
      ) {
        return false;
      }

      if (cleanQuery) {
        const corridorLabel =
          (CORRIDOR_LABELS as Record<string, string>)[prop.corridor] ??
          prop.corridor;
        const haystack = normalizeText(
          `${prop.title} ${prop.addressLine} ${prop.corridor} ${corridorLabel}`
        );
        if (!haystack.includes(cleanQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [catalog, guestsCount, activeFilter, searchQuery]);

  const activePricing =
    stayMode === "short"
      ? currency === "ARS"
        ? shortStayArs
        : shortStayUsdt
      : currency === "ARS"
        ? midTermArs
        : midTermUsdt;

  const nightlyBaseDisplay =
    currency === "ARS" ? "$ 65.000 ARS" : "54,17 USDT";

  const scrollToCatalog = () => {
    const el = document.getElementById("alojamientos-disponibles");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleHeroSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    scrollToCatalog();
  };

  const handleSelectStayMode = (mode: "short" | "midterm") => {
    setStayMode(mode);
    if (mode === "midterm") {
      notify(
        "¡Gran elección! Activaste 20% de descuento y contrato digital incluido.",
        "celebration",
        "trophy"
      );
    } else {
      notify("Calculamos una escapada corta de 5 noches.", "info", "calendar");
    }
  };

  const handleSelectDestination = (
    corridor: "CABA" | "COSTA_ATLANTICA" | "CORDOBA" | "VACA_MUERTA",
    title: string
  ) => {
    setActiveFilter(corridor);
    setSearchQuery("");
    notify(`Mostrando alojamientos en ${title}.`, "info", "compass");
    scrollToCatalog();
  };

  const handleToggleFavorite = (propId: string, propTitle: string) => {
    setSavedIds((prev) => {
      const exists = prev.includes(propId);
      const next = exists
        ? prev.filter((id) => id !== propId)
        : [...prev, propId];
      notify(
        exists
          ? `Quitaste "${propTitle}" de tus guardados.`
          : `Guardaste "${propTitle}" en favoritos.`,
        exists ? "info" : "success",
        "sparkle"
      );
      return next;
    });
  };

  const resetFilters = () => {
    setSearchQuery("");
    setActiveFilter("ALL");
    setGuestsCount(1);
  };

  const hasActiveFilter =
    Boolean(searchQuery.trim()) || activeFilter !== "ALL" || guestsCount > 1;
  const useMobileCarousel =
    filteredProperties.length > 1 && !searchQuery.trim();

  return (
    <div>
      {/* 1. PORTADA INTEGRADA ARQUITECTÓNICA (Full-bleed mobile + editorial split desktop) */}
      <section aria-labelledby="welcome-heading">
        <div className="mx-auto max-w-7xl px-0 sm:px-6 lg:px-8 pt-0 sm:pt-5">
          <div className="relative overflow-hidden rounded-b-[2rem] sm:rounded-[2.25rem] min-h-[540px] lg:min-h-[580px] shadow-2xl border-b sm:border border-white/15 bg-slate-950">
            <Image
              src={HERO_IMAGE_URL}
              alt="Interior arquitectónico luminoso disponible en I-bita Argentina"
              fill
              priority
              sizes="100vw"
              className="object-cover object-center"
            />

            {/* Gradiente oscuro multi-etapa para contraste AAA en textos blancos */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/60 to-slate-950/92 lg:bg-gradient-to-r lg:from-slate-950/92 lg:via-slate-950/72 lg:to-slate-950/40"
            />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center px-5 pt-10 pb-11 sm:px-10 sm:py-12 lg:px-12 lg:py-14">
              {/* Columna izquierda: Titular, Buscador integrado y CTAs gemelos */}
              <div className="lg:col-span-7 space-y-6 text-white">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/60 px-3.5 py-1.5 text-xs font-extrabold backdrop-blur-md">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full bg-emerald-400"
                  />
                  <span>
                    Argentina · Precios claros · Edificios tranquilos
                  </span>
                </div>

                <h1
                  id="welcome-heading"
                  className="text-3xl sm:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight leading-[1.08] text-white"
                >
                  {userFirstName ? (
                    <>
                      Hola,{" "}
                      <span className="text-[#ff6b86]">{userFirstName}</span>.{" "}
                      ¿Dónde te querés alojar?
                    </>
                  ) : (
                    <>
                      Tu próximo espacio en{" "}
                      <span className="text-[#ff6b86]">Argentina</span>, sin
                      sorpresas.
                    </>
                  )}
                </h1>

                <p className="max-w-xl text-sm sm:text-base text-white/90 leading-relaxed">
                  Alquilá por unos días o de 1 a 6 meses con precio real en
                  pesos en cuotas o USDT, ingreso ordenado en portería y
                  contrato digital.
                </p>

                {/* Buscador integrado frosted glass (inspirado en referencia móvil + desktop) */}
                <form
                  onSubmit={handleHeroSearchSubmit}
                  className="rounded-2xl lg:rounded-full border border-white/20 bg-slate-950/72 backdrop-blur-xl p-2 shadow-2xl"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-2">
                    <div className="relative flex flex-1 items-center gap-2 rounded-xl lg:rounded-full px-3 py-1.5 bg-white/5 lg:bg-transparent">
                      <Search
                        className="h-4 w-4 text-white/75 shrink-0"
                        aria-hidden="true"
                      />
                      <input
                        id="hero-zone-search"
                        name="q"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Barrio o ciudad..."
                        aria-label="Buscar alojamiento por zona o palabra clave"
                        className="w-full min-h-[38px] bg-transparent text-sm font-semibold text-white placeholder:text-white/65 focus:outline-none"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          aria-label="Limpiar búsqueda"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      {/* Selector compacto Días vs 1-6m */}
                      <div
                        role="group"
                        aria-label="Modalidad de estadía"
                        className="inline-flex flex-1 sm:flex-initial items-center rounded-xl lg:rounded-full border border-white/15 bg-white/10 p-1 text-xs font-extrabold"
                      >
                        <button
                          type="button"
                          onClick={() => setStayMode("short")}
                          aria-pressed={stayMode === "short"}
                          className={`min-h-[36px] flex-1 sm:flex-initial rounded-lg lg:rounded-full px-3 transition-colors cursor-pointer whitespace-nowrap ${
                            stayMode === "short"
                              ? "bg-white text-slate-950 shadow-xs"
                              : "text-white/80 hover:text-white"
                          }`}
                        >
                          Días
                        </button>
                        <button
                          type="button"
                          onClick={() => setStayMode("midterm")}
                          aria-pressed={stayMode === "midterm"}
                          className={`min-h-[36px] flex-1 sm:flex-initial rounded-lg lg:rounded-full px-3 transition-colors cursor-pointer whitespace-nowrap ${
                            stayMode === "midterm"
                              ? "bg-emerald-500 text-slate-950 shadow-xs"
                              : "text-white/80 hover:text-white"
                          }`}
                        >
                          1–6m -20%
                        </button>
                      </div>

                      {/* Cantidad de huéspedes */}
                      <label className="inline-flex items-center gap-1.5 rounded-xl lg:rounded-full border border-white/15 bg-white/10 px-3 min-h-[44px] text-xs font-extrabold text-white">
                        <Users
                          className="h-3.5 w-3.5 text-white/80 shrink-0"
                          aria-hidden="true"
                        />
                        <select
                          id="hero-guests-select"
                          name="guests"
                          aria-label="Cantidad de huéspedes"
                          value={guestsCount}
                          onChange={(e) =>
                            setGuestsCount(Number(e.target.value))
                          }
                          className="bg-transparent text-xs font-extrabold text-white focus:outline-none cursor-pointer pr-1"
                        >
                          <option value={1} className="text-slate-900">
                            1+ huésp.
                          </option>
                          <option value={2} className="text-slate-900">
                            2+ huésp.
                          </option>
                          <option value={3} className="text-slate-900">
                            3+ huésp.
                          </option>
                          <option value={4} className="text-slate-900">
                            4+ huésp.
                          </option>
                          <option value={6} className="text-slate-900">
                            6+ huésp.
                          </option>
                        </select>
                      </label>

                      <button
                        type="submit"
                        className="btn-primary-3d min-h-[46px] w-full sm:w-auto rounded-xl lg:rounded-full px-5 text-sm font-extrabold whitespace-nowrap inline-flex items-center justify-center gap-1.5"
                      >
                        <span>Buscar</span>
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </form>

                {/* Botones principales para huéspedes con exactamente el mismo ancho */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg pt-1">
                  <a
                    href="#alojamientos-disponibles"
                    className="btn-primary-3d w-full min-h-[48px] px-5 text-sm font-extrabold inline-flex items-center justify-center gap-2 rounded-2xl whitespace-nowrap"
                  >
                    <span>Ver hospedajes disponibles</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </a>

                  {userFirstName ? (
                    <Link
                      href="/perfil"
                      className="w-full min-h-[48px] px-5 text-sm font-extrabold inline-flex items-center justify-center rounded-2xl border border-white/30 bg-white/15 text-white hover:bg-white/25 backdrop-blur-md transition-colors whitespace-nowrap"
                    >
                      Ir a mi perfil
                    </Link>
                  ) : (
                    <Link
                      href="/login?rol=huesped"
                      className="w-full min-h-[48px] px-5 text-sm font-extrabold inline-flex items-center justify-center rounded-2xl border border-white/30 bg-white/15 text-white hover:bg-white/25 backdrop-blur-md transition-colors whitespace-nowrap"
                    >
                      Crear cuenta para reservar
                    </Link>
                  )}
                </div>

                <p className="sm:hidden pt-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white/75">
                  <span>Deslizá para ver alojamientos y precios</span>
                  <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </p>
              </div>

              {/* Columna derecha Desktop: Collage tríptico arquitectónico en abanico */}
              <div className="hidden lg:flex lg:col-span-5 items-center justify-center">
                <div className="relative flex items-center justify-center py-2">
                  {/* Tarjeta izquierda inclinada */}
                  <div className="relative -rotate-6 -mr-10 mt-8 w-36 h-52 rounded-[1.5rem] overflow-hidden border-2 border-white/80 shadow-2xl shrink-0 bg-slate-900">
                    <Image
                      src={COLLAGE_LEFT_URL}
                      alt="Dormitorio principal equipado para estadía ejecutiva"
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  </div>

                  {/* Tarjeta central focal con ficha flotante blanca */}
                  <div className="relative z-10 w-64 h-80 rounded-[1.75rem] overflow-hidden border-2 border-white shadow-[0_24px_48px_-12px_rgba(0,0,0,0.65)] shrink-0 bg-slate-900">
                    <Image
                      src={featuredProperty.coverUrl || COLLAGE_CENTER_URL}
                      alt={featuredProperty.coverAlt}
                      fill
                      sizes="256px"
                      unoptimized={
                        !isNextImageConfiguredHost(
                          featuredProperty.coverUrl || COLLAGE_CENTER_URL
                        )
                      }
                      className="object-cover"
                    />

                    <span className="badge-consorcio-friendly absolute top-3 left-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-xs">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      {featuredProperty.isConsortiumFriendly
                        ? "Edificio amigable"
                        : "Verificado I-bita"}
                    </span>

                    <div className="absolute inset-x-2.5 bottom-2.5 rounded-2xl bg-white/95 backdrop-blur-md p-3 text-slate-900 shadow-lg space-y-1.5">
                      <p className="text-xs font-extrabold truncate">
                        {featuredProperty.title}
                      </p>
                      <p className="text-[11px] font-semibold text-slate-600 truncate">
                        {SHORT_CORRIDOR_NAMES[featuredProperty.corridor] ??
                          featuredProperty.corridor}{" "}
                        · Wi-Fi {featuredProperty.wifiSpeedMbps ?? 300} Mbps
                      </p>
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="text-xs font-black text-[#d90b38]">
                          {formatConvertedNightly(
                            featuredProperty.nightlyRate,
                            featuredProperty.baseCurrency,
                            currency
                          )}{" "}
                          <span className="font-bold text-slate-500">
                            / noche
                          </span>
                        </span>
                        <Link
                          href={`/p/${featuredProperty.slug}`}
                          className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-extrabold text-white hover:bg-[#d90b38] transition-colors whitespace-nowrap"
                        >
                          Ver →
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta derecha inclinada */}
                  <div className="relative rotate-6 -ml-10 mt-8 w-36 h-52 rounded-[1.5rem] overflow-hidden border-2 border-white/80 shadow-2xl shrink-0 bg-slate-900">
                    <Image
                      src={COLLAGE_RIGHT_URL}
                      alt="Espacio de coworking luminoso con fibra óptica"
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Franja de 4 pilares con medallas circulares de marca */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8 sm:mt-8">
          <ScrollReveal distance="sm">
            <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-3.5 sm:overflow-visible sm:pb-0">
              {TRUST_PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className="min-w-[74vw] max-w-[270px] sm:min-w-0 sm:max-w-none snap-start flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 shadow-xs"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white shadow-sm">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] leading-tight">
                        {pillar.title}
                      </p>
                      <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-snug">
                        {pillar.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* CONTENIDO EDITORIAL PRINCIPAL */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16 sm:space-y-20 py-12 sm:py-16 pb-20 sm:pb-16">
        {/* 2. LOS MÁS ELEGIDOS + FILTROS INTERACTIVOS */}
        <ScrollReveal stepLabel="01 · Alojamientos">
          <section
            id="alojamientos-disponibles"
            aria-labelledby="featured-listings-heading"
            className="space-y-6 scroll-mt-24"
          >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-primary)]">
                Alojamientos verificados
              </span>
              <h2
                id="featured-listings-heading"
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]"
              >
                Los más elegidos ({filteredProperties.length})
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Tarifas directas en pesos o USDT sin recargos cambiarios ni
                comisiones sorpresa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 text-xs font-extrabold whitespace-nowrap"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Limpiar filtros</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setCurrency(currency === "ARS" ? "USDT" : "ARS")}
                className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-xs font-extrabold whitespace-nowrap"
              >
                <Coins
                  className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                  aria-hidden="true"
                />
                <span>
                  Mostrando en {currency === "ARS" ? "ARS $" : "USDT ₮"}
                </span>
              </button>
            </div>
          </div>

          {/* Pills de categorías deslizables estilo app */}
          <div
            role="group"
            aria-label="Filtrar alojamientos por zona o modalidad"
            className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1"
          >
            {CATEGORY_FILTERS.map((filter) => {
              const isSelected = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  aria-pressed={isSelected}
                  className={`min-h-[40px] shrink-0 rounded-full px-4 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? "bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-xs"
                      : "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--text-primary)]/40"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {/* Tarjetas arquitectónicas: carrusel horizontal nativo en móvil / grid en desktop */}
          {filteredProperties.length === 0 ? (
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-8 text-center space-y-4">
              <p className="text-base font-extrabold text-[var(--text-primary)]">
                No encontramos alojamientos con esa combinación de filtros.
              </p>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Probá ampliando la búsqueda o volviendo a ver todas las zonas
                disponibles.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center rounded-full px-6 text-sm font-extrabold"
              >
                Mostrar todos los alojamientos
              </button>
            </div>
          ) : (
            <div
              className={
                useMobileCarousel
                  ? "flex gap-4 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-5 sm:overflow-visible"
                  : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
              }
            >
              {filteredProperties.map((prop) => {
                const isSaved = savedIds.includes(prop.id);
                const convertedNight = formatConvertedNightly(
                  prop.nightlyRate,
                  prop.baseCurrency,
                  currency
                );

                return (
                  <article
                    key={prop.id}
                    className={`${
                      useMobileCarousel
                        ? "min-w-[82vw] max-w-[340px] sm:min-w-0 sm:max-w-none snap-center"
                        : ""
                    } rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-[var(--shadow-card)] overflow-hidden flex flex-col justify-between group hover:border-[var(--brand-primary)] transition-colors`}
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-secondary)]">
                      <Link
                        href={`/p/${prop.slug}`}
                        className="relative block h-full w-full"
                      >
                        <Image
                          src={prop.coverUrl}
                          alt={prop.coverAlt}
                          fill
                          sizes="(max-width: 640px) 84vw, (max-width: 1024px) 50vw, 33vw"
                          unoptimized={
                            !isNextImageConfiguredHost(prop.coverUrl)
                          }
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </Link>

                      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-1.5 pr-12">
                        {prop.isConsortiumFriendly && (
                          <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow-xs backdrop-blur-md">
                            <CheckCircle2
                              className="h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                            Edificio amigable
                          </span>
                        )}
                        {prop.requiresInterview && (
                          <span className="inline-flex items-center rounded-full border border-white/25 bg-slate-950/75 px-2.5 py-1 text-[11px] font-extrabold text-white backdrop-blur-md">
                            Entrevista 1–6m
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          handleToggleFavorite(prop.id, prop.title)
                        }
                        aria-pressed={isSaved}
                        aria-label={
                          isSaved
                            ? `Quitar ${prop.title} de favoritos`
                            : `Guardar ${prop.title} en favoritos`
                        }
                        className="absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-slate-950/55 text-white backdrop-blur-md hover:bg-slate-950/80 transition-colors cursor-pointer"
                      >
                        <Heart
                          className={`h-4 w-4 ${
                            isSaved
                              ? "fill-[#ff385c] text-[#ff385c]"
                              : "text-white"
                          }`}
                          aria-hidden="true"
                        />
                      </button>

                      {prop.imageCount > 1 && (
                        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-950/75 px-2.5 py-0.5 text-[11px] font-extrabold text-white backdrop-blur-md">
                          1/{prop.imageCount}
                        </span>
                      )}
                    </div>

                    <div className="p-5 flex flex-1 flex-col justify-between gap-4">
                      <div className="space-y-2">
                        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] truncate max-w-full">
                          <MapPin
                            className="h-3.5 w-3.5 text-[var(--brand-primary)] shrink-0"
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {SHORT_CORRIDOR_NAMES[prop.corridor] ??
                              prop.corridor}{" "}
                            · {prop.addressLine}
                          </span>
                        </p>

                        <h3 className="text-base font-extrabold text-[var(--text-primary)] line-clamp-2 leading-snug">
                          <Link
                            href={`/p/${prop.slug}`}
                            className="hover:text-[var(--brand-primary)] transition-colors"
                          >
                            {prop.title}
                          </Link>
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-[11px] font-bold text-[var(--text-secondary)]">
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            Hasta {prop.maxAdults}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                            {prop.wifiSpeedMbps ?? 300} Mbps
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                            <CalendarDays
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            -{prop.monthlyDiscountPct}% mes
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                            {prop.acceptsUsdt ? "ARS · USDT" : "ARS $"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                        <div>
                          <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
                            Desde
                          </span>
                          <span className="text-sm sm:text-base font-black text-[var(--text-primary)] whitespace-nowrap">
                            {convertedNight}{" "}
                            <span className="text-xs font-bold text-[var(--text-secondary)]">
                              / noche
                            </span>
                          </span>
                        </div>

                        <Link
                          href={`/p/${prop.slug}`}
                          className="inline-flex min-h-[40px] items-center justify-center rounded-full bg-[var(--text-primary)] px-4 text-xs font-extrabold text-[var(--bg-primary)] group-hover:bg-[var(--brand-primary)] group-hover:text-white transition-colors whitespace-nowrap"
                        >
                          Ver fechas →
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          </section>
        </ScrollReveal>

        {/* 3. DESCUBRÍ DESTINOS EN ARGENTINA (Discover new places) */}
        <ScrollReveal stepLabel="02 · Destinos">
          <section
            aria-labelledby="discover-destinations-heading"
            className="space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-primary)]">
                  Corredores principales
                </span>
                <h2
                  id="discover-destinations-heading"
                  className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]"
                >
                  Descubrí destinos en Argentina
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Tocá un corredor para filtrar los alojamientos disponibles.
              </p>
            </div>

            <div className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 sm:overflow-visible">
              {DESTINATION_CARDS.map((dest) => {
                const isSelected = activeFilter === dest.corridor;
                return (
                  <button
                    key={dest.corridor}
                    type="button"
                    onClick={() =>
                      handleSelectDestination(dest.corridor, dest.title)
                    }
                    aria-pressed={isSelected}
                    className={`group relative min-w-[66vw] max-w-[240px] sm:min-w-0 sm:max-w-none snap-start aspect-[4/5] rounded-3xl overflow-hidden text-left border transition-all cursor-pointer ${
                      isSelected
                        ? "border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]"
                        : "border-[var(--border-subtle)] hover:border-[var(--brand-primary)]"
                    }`}
                  >
                    <Image
                      src={dest.imageUrl}
                      alt={`${dest.title} — ${dest.subtitle}`}
                      fill
                      sizes="(max-width: 640px) 66vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/25 to-transparent"
                    />
                    <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-2 text-white">
                      <div className="min-w-0">
                        <p className="text-base sm:text-lg font-extrabold leading-tight">
                          {dest.title}
                        </p>
                        <p className="text-[11px] sm:text-xs font-semibold text-white/85 truncate">
                          {dest.subtitle}
                        </p>
                      </div>
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md group-hover:bg-[var(--brand-primary)] transition-colors">
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </ScrollReveal>

        {/* 4. SIMULADOR EDITORIAL TRANQUILO + COMODIDAD VISUAL + REVELACIÓN PROGRESIVA */}
        <section
          id="experiencia-central"
          aria-labelledby="core-experience-heading"
          className="space-y-8 scroll-mt-24"
        >
          <ScrollReveal stepLabel="03 · Simulador de precio">
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8 shadow-[var(--shadow-card)] space-y-7">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[var(--border-subtle)] pb-5">
              <div className="flex items-center gap-3.5">
                <Icon3D name="compass" size="lg" />
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--brand-primary)]">
                    Calculador en vivo
                  </span>
                  <h2
                    id="core-experience-heading"
                    className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]"
                  >
                    Simulá tu estadía en Palermo Soho
                  </h2>
                </div>
              </div>

              <div
                role="group"
                aria-label="Elegir duración de estadía"
                className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1.5"
              >
                <button
                  type="button"
                  onClick={() => handleSelectStayMode("short")}
                  aria-pressed={stayMode === "short"}
                  className={`min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                    stayMode === "short"
                      ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-xs border border-[var(--border-subtle)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Escapada · 5 noches
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectStayMode("midterm")}
                  aria-pressed={stayMode === "midterm"}
                  className={`min-h-[42px] rounded-xl px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                    stayMode === "midterm"
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  Media estadía · 60 noches (-20%)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
                  Valor base por noche
                </span>
                <span className="mt-0.5 block text-base font-extrabold whitespace-nowrap">
                  {nightlyBaseDisplay}
                </span>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
                  Total cerrado ({activePricing.nights} noches)
                </span>
                <span className="mt-0.5 block text-base font-extrabold text-[var(--brand-primary)] whitespace-nowrap">
                  {formatMoney(activePricing.totalGuestPayable, currency)}
                </span>
              </div>

              <div className="rounded-2xl border border-emerald-600/30 bg-[var(--badge-consorcio-bg)]/60 p-4">
                <span className="block text-[11px] font-bold text-[var(--badge-consorcio-text)]">
                  Ahorrás frente a OTAs
                </span>
                <span className="mt-0.5 block text-base font-extrabold text-[var(--badge-consorcio-text)] whitespace-nowrap">
                  {formatMoney(activePricing.directSavingsAmount, currency)}
                </span>
              </div>
            </div>

            {stayMode === "midterm" && (
              <AchievementBanner
                icon="trophy"
                tone="emerald"
                title={`¡Ahorrás ${formatMoney(activePricing.directSavingsAmount, currency)} en esta estadía!`}
                description="Al elegir 60 noches bajamos la comisión al 6% y sumamos tu contrato digital listo para firmar."
              />
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-4">
              <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)]">
                Pagás directo en{" "}
                {currency === "ARS" ? "pesos (hasta 6 cuotas)" : "USDT"} sin
                impuestos del dólar tarjeta.
              </p>

              <Link
                href="/p/loft-luminoso-palermo-soho"
                className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold whitespace-nowrap"
              >
                <span>Ver este departamento y elegir fechas</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            {/* Barra compacta de comodidad visual (Claro/Oscuro, A+, Moneda) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <span className="text-xs font-bold text-[var(--text-secondary)]">
                Comodidad visual y moneda:
              </span>
              <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-pressed={theme === "dark"}
                  className="btn-secondary-3d inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-extrabold whitespace-nowrap"
                >
                  {theme === "dark" ? (
                    <>
                      <Sun
                        className="h-3.5 w-3.5 text-amber-400"
                        aria-hidden="true"
                      />
                      <span>Modo claro</span>
                    </>
                  ) : (
                    <>
                      <Moon
                        className="h-3.5 w-3.5 text-indigo-600"
                        aria-hidden="true"
                      />
                      <span>Modo oscuro</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleReadingSize}
                  aria-pressed={readingSize === "comfortable"}
                  className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-extrabold whitespace-nowrap ${
                    readingSize === "comfortable"
                      ? "btn-primary-3d"
                      : "btn-secondary-3d"
                  }`}
                >
                  <Type className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {readingSize === "comfortable"
                      ? "Texto grande ✓"
                      : "Texto grande"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setCurrency(currency === "ARS" ? "USDT" : "ARS")
                  }
                  className="btn-secondary-3d inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-extrabold whitespace-nowrap"
                >
                  <span>Ver en {currency === "ARS" ? "USDT" : "Pesos"}</span>
                </button>
              </div>
            </div>
            </div>
          </ScrollReveal>

          {/* Guía progresiva de etapas y transparencia */}
          <ScrollReveal stepLabel="04 · Garantías y detalles" delayMs={50}>
            <div className="space-y-5">
            {showDemoWalkthrough && (
              <ProgressiveDisclosure
                icon="compass"
                badge="Paso a paso"
                title="¿Querés recorrer o probar cada etapa de una reserva?"
                subtitle="Abrí esta guía si querés ir directo a simular el pago, la firma o la validación de identidad."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Link
                    href="/p/loft-luminoso-palermo-soho"
                    className="surface-card p-4 flex flex-col justify-between gap-3 hover:border-[var(--brand-primary)] transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[var(--brand-primary)]">
                          PASO 1
                        </span>
                        <Icon3D name="home" size="sm" />
                      </div>
                      <h3 className="text-sm font-extrabold">Elegir estadía</h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Mirá fotos, elegí tus fechas y calculá el valor final al
                        instante.
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-[var(--brand-primary)]">
                      Ir al departamento →
                    </span>
                  </Link>

                  <Link
                    href={`/checkout/${DEMO_BOOKING_ID}`}
                    className="surface-card p-4 flex flex-col justify-between gap-3 hover:border-[var(--brand-primary)] transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-blue-700 dark:text-blue-400">
                          PASO 2
                        </span>
                        <Icon3D name="card" size="sm" />
                      </div>
                      <h3 className="text-sm font-extrabold">Pagar seguro</h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Elegí pesos con Mercado Pago o transferencia en USDT.
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-blue-700 dark:text-blue-400">
                      Ver pantalla de pago →
                    </span>
                  </Link>

                  <Link
                    href={`/contratos/${DEMO_BOOKING_ID}?token=${DEMO_TOKEN}`}
                    className="surface-card p-4 flex flex-col justify-between gap-3 hover:border-[var(--brand-primary)] transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-700 dark:text-amber-400">
                          PASO 3
                        </span>
                        <Icon3D name="contract" size="sm" />
                      </div>
                      <h3 className="text-sm font-extrabold">Firmar acuerdo</h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        En estadías largas firmás tu contrato digital claro en un
                        clic.
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-amber-700 dark:text-amber-400">
                      Ver acuerdo legal →
                    </span>
                  </Link>

                  <Link
                    href={`/checkin/${DEMO_BOOKING_ID}?token=${DEMO_TOKEN}`}
                    className="surface-card p-4 flex flex-col justify-between gap-3 hover:border-[var(--brand-primary)] transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">
                          PASO 4
                        </span>
                        <Icon3D name="face" size="sm" />
                      </div>
                      <h3 className="text-sm font-extrabold">
                        Confirmar identidad
                      </h3>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Validás tu DNI, recibís tu pase para portería y tu clave
                        de entrada.
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                      Probar validación →
                    </span>
                  </Link>
                </div>
              </ProgressiveDisclosure>
            )}

            <ProgressiveDisclosure
              icon="shield"
              badge="Transparencia"
              title="¿Cómo cuidamos tu dinero y la tranquilidad del edificio?"
              subtitle="Conocé en lenguaje simple nuestras tres garantías y el detalle completo de valores."
            >
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="surface-card p-5 space-y-2">
                    <Icon3D name="card" size="md" />
                    <h3 className="text-base font-extrabold">
                      Pagos sin recargos ocultos
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                      Abonás en pesos argentinos (hasta 6 cuotas) o en USDT. El
                      precio que ves antes de confirmar es exactamente lo que
                      pagás.
                    </p>
                  </div>

                  <div className="surface-card p-5 space-y-2">
                    <Icon3D name="shield" size="md" />
                    <h3 className="text-base font-extrabold">
                      Ingreso ordenado en portería
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                      Los huéspedes validan su DNI antes de llegar y el
                      encargado recibe un pase digital seguro sin exponer datos
                      bancarios.
                    </p>
                  </div>

                  <div className="surface-card p-5 space-y-2">
                    <Icon3D name="contract" size="md" />
                    <h3 className="text-base font-extrabold">
                      Acuerdo claro en estadías largas
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                      Para alquileres de 1 a 6 meses generamos un contrato
                      temporario bajo ley argentina, listo para descargar en
                      PDF.
                    </p>
                  </div>
                </div>

                <div className="surface-card p-5 space-y-3">
                  <h4 className="text-sm font-extrabold">
                    Detalle de cálculo para tu simulación actual (
                    {activePricing.nights} noches)
                  </h4>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div className="flex justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <dt className="text-[var(--text-secondary)]">
                        Alojamiento neto:
                      </dt>
                      <dd className="font-bold whitespace-nowrap">
                        {formatMoney(
                          activePricing.netAccommodationAmount,
                          currency
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <dt className="text-[var(--text-secondary)]">
                        Servicio I-bita ({activePricing.platformFeePct}%):
                      </dt>
                      <dd className="font-bold whitespace-nowrap">
                        {formatMoney(
                          activePricing.platformFeeAmount,
                          currency
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <dt className="text-[var(--text-secondary)]">
                        Aporte al edificio ({activePricing.consortiumCanonPct}%
                        incluido):
                      </dt>
                      <dd className="font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {formatMoney(
                          activePricing.consortiumCanonAmount,
                          currency
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                      <dt className="font-bold text-[var(--brand-primary)]">
                        Ahorro frente a plataformas extranjeras:
                      </dt>
                      <dd className="font-extrabold text-[var(--brand-primary)] whitespace-nowrap">
                        {formatMoney(
                          activePricing.directSavingsAmount,
                          currency
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </ProgressiveDisclosure>
            </div>
          </ScrollReveal>
        </section>

        {/* 5. EXPERIENCIA PARA DUEÑOS — Ubicada al final del inicio */}
        <ScrollReveal stepLabel="05 · Para propietarios">
          <section
            aria-labelledby="hosts-section-heading"
            className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8 shadow-[var(--shadow-card)]"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-start gap-3.5">
                  <Icon3D name="building" size="lg" />
                  <div className="space-y-1.5">
                    <span className="inline-flex items-center rounded-full bg-[var(--badge-consorcio-bg)] border border-[var(--badge-consorcio-border)] px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--badge-consorcio-text)]">
                      Para dueños
                    </span>
                    <h2
                      id="hosts-section-heading"
                      className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)]"
                    >
                      Quiero ser anfitrión en I-bita
                    </h2>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed max-w-2xl">
                      Completá tu registro guiado en 4 pasos. Revisamos y
                      aprobamos tu perfil para que publiques con tranquilidad.
                    </p>
                  </div>
                </div>

                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-bold text-[var(--text-primary)]">
                  <li className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2">
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-600 shrink-0"
                      aria-hidden="true"
                    />
                    <span>Cobros en ARS o USDT</span>
                  </li>
                  <li className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2">
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-600 shrink-0"
                      aria-hidden="true"
                    />
                    <span>Entrevista previa 1–6m</span>
                  </li>
                  <li className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2">
                    <CheckCircle2
                      className="h-4 w-4 text-emerald-600 shrink-0"
                      aria-hidden="true"
                    />
                    <span>Perfiles aprobados</span>
                  </li>
                </ul>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link
                    href="/onboarding/anfitrion"
                    className="btn-secondary-3d inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl px-6 text-sm font-extrabold whitespace-nowrap"
                  >
                    <span>Quiero ser anfitrión</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <span className="text-xs font-bold text-[var(--text-secondary)]">
                    Menos de 2 min · Con verificación
                  </span>
                </div>
              </div>

              <div className="lg:col-span-5 relative aspect-[16/10] rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                <Image
                  src={HOST_BANNER_URL}
                  alt="Departamento de diseño preparado para publicar en I-bita"
                  fill
                  sizes="(max-width: 1024px) 100vw, 42vw"
                  className="object-cover"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent"
                />
                <span className="absolute bottom-3 left-3 rounded-full border border-white/25 bg-slate-950/75 px-3 py-1 text-xs font-extrabold text-white backdrop-blur-md">
                  Registro guiado en 4 pasos
                </span>
              </div>
            </div>
          </section>
        </ScrollReveal>
      </div>
    </div>
  );
}

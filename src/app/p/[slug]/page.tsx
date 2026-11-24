import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ShieldCheck,
  CreditCard,
  Coins,
  Wifi,
  Users,
  MapPin,
  CalendarCheck,
  ExternalLink,
} from "lucide-react";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getPublicPropertyBySlug,
  getPropertyOccupiedDateRanges,
  buildBentoGalleryImages,
} from "@/modules/properties/queries";
import { CORRIDOR_LABELS } from "@/modules/properties/validators";
import {
  INTERVIEW_CHANNEL_LABELS,
  REQUIREMENT_CATEGORY_LABELS,
} from "@/modules/properties/mid-term-policy";
import { StickyBookingWidget } from "@/components/booking/StickyBookingWidget";
import { MobileBookingJumpBar } from "@/components/booking/MobileBookingJumpBar";
import { Icon3D } from "@/components/ui/Icon3D";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { buildPropertyLocationMapData } from "@/lib/maps/property-location";
import { PropertyLocationMapTile } from "@/components/properties/PropertyLocationMapTile";
import { ExpandableDescription } from "@/components/properties/ExpandableDescription";
import { getArgentinaTodayYmd } from "@/lib/calendar/availability";
import { PropertyDateSelectionProvider } from "@/components/booking/PropertyDateSelectionContext";
import { PropertyAvailabilityCalendar } from "@/components/booking/PropertyAvailabilityCalendar";
import { getHostResponseMetricsSummary } from "@/modules/hosts/response-sla";
import { HostResponseWindowCard } from "@/components/host/HostResponseWindowCard";
import {
  isCryptoPaymentsEnabled,
  isDemoOrUnsplashProperty,
  JURISDICTION_LABELS,
} from "@/lib/compliance/feature-flags";
import { ComplianceInfoTooltip } from "@/components/ui/ComplianceInfoTooltip";

export const dynamic = "force-dynamic";

interface PropertyMicrositePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PropertyMicrositePageProps): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPublicPropertyBySlug(slug);

  if (!property) {
    return {
      title: "Propiedad no encontrada | I-bita Argentina",
    };
  }

  const corridorLabel = CORRIDOR_LABELS[property.corridor] ?? property.corridor;
  const canonicalUrl = `${env.NEXT_PUBLIC_APP_URL}/p/${property.slug}`;

  return {
    title: `${property.title} — Reserva Directa en ARS o USDT`,
    description: `${property.title} en ${property.address_line} (${corridorLabel}). Reservá por día o de 1 a 6 meses con ${property.monthly_discount_pct}% de descuento, ingreso ordenado para el edificio y contrato digital.`,
    alternates: {
      canonical: `/p/${property.slug}`,
    },
    openGraph: {
      type: "website",
      locale: "es_AR",
      url: canonicalUrl,
      title: `${property.title} | Reserva Directa I-bita Argentina`,
      description: property.description.slice(0, 200),
      images: property.images[0]
        ? [
          {
            url: property.images[0].url,
            width: property.images[0].width,
            height: property.images[0].height,
            alt: property.images[0].alt,
          },
        ]
        : [],
    },
  };
}

export default async function PropertyDirectMicrositePage({
  params,
}: PropertyMicrositePageProps) {
  const { slug } = await params;
  const property = await getPublicPropertyBySlug(slug);

  if (!property) {
    notFound();
  }

  let authenticatedEmail: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticatedEmail = user?.email ?? null;
  } catch {
    authenticatedEmail = null;
  }

  const [occupiedRanges, hostResponseMetrics] = await Promise.all([
    getPropertyOccupiedDateRanges(property.id),
    getHostResponseMetricsSummary(property.host_id),
  ]);
  const todayYmd = getArgentinaTodayYmd();
  const bentoPhotos = buildBentoGalleryImages(property.images, property.title);
  const corridorLabel = CORRIDOR_LABELS[property.corridor] ?? property.corridor;
  const locationMapData = buildPropertyLocationMapData({
    addressLine: property.address_line,
    corridor: property.corridor,
    title: property.title,
  });
  const consortiumConfig = property.consortium_config ?? null;
  const microCanonPct = consortiumConfig?.active
    ? Number(consortiumConfig.micro_canon_pct)
    : 0;
  const midTermPolicy = property.mid_term_policy;
  const enabledMidTermRequirements = midTermPolicy.requirements.filter(
    (req) => req.enabled
  );
  const cryptoEnabled = isCryptoPaymentsEnabled();
  const isDemoProperty = isDemoOrUnsplashProperty({
    id: property.id,
    slug: property.slug,
    images: property.images,
  });
  const jurisdictionLabel =
    JURISDICTION_LABELS[property.jurisdiccion] ?? property.jurisdiccion;

  const accommodationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Accommodation",
    "@id": `${env.NEXT_PUBLIC_APP_URL}/p/${property.slug}#accommodation`,
    name: property.title,
    description: property.description,
    url: `${env.NEXT_PUBLIC_APP_URL}/p/${property.slug}`,
    address: {
      "@type": "PostalAddress",
      streetAddress: property.address_line,
      addressRegion: corridorLabel,
      addressCountry: "AR",
    },
    occupancy: {
      "@type": "QuantitativeValue",
      maxValue: property.max_adults,
    },
    amenityFeature: [
      {
        "@type": "LocationFeatureSpecification",
        name: "Ingreso ordenado con pase QR a portería",
        value: true,
      },
      {
        "@type": "LocationFeatureSpecification",
        name: cryptoEnabled
          ? "Financiación en ARS (sujeta al procesador) y USDT Polygon"
          : "Cobros en Pesos Argentinos (ARS) sujetos al procesador de pagos",
        value: true,
      },
      ...(property.wifi_speed_mbps
        ? [
          {
            "@type": "LocationFeatureSpecification",
            name: `Wi-Fi declarado por el anfitrión (${property.wifi_speed_mbps} Mbps)`,
            value: property.wifi_speed_mbps,
          },
        ]
        : []),
    ],
  };

  return (
    <article className="mx-auto max-w-7xl px-4 pt-6 pb-24 sm:px-6 sm:py-10 lg:px-8 space-y-10 sm:space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(accommodationJsonLd),
        }}
      />

      {/* Cabecera clara y amigable del alojamiento */}
      <header className="space-y-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible sm:pb-0">
          <span className="badge-consorcio-friendly shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {consortiumConfig?.active
              ? `Edificio amigable · ${consortiumConfig.consortium_name}`
              : "Edificio amigable · Ingreso con pase seguro"}
          </span>

          <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-3.5 py-1 text-xs font-extrabold">
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Pesos en cuotas</span>
            <ComplianceInfoTooltip
              label="Condiciones de financiación en cuotas"
              explanation="Cuotas sujetas a condiciones, tarjetas adheridas y promociones del procesador de pagos (Mercado Pago)."
            />
          </span>

          {cryptoEnabled && property.accepts_usdt && (
            <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-[var(--badge-usdt-bg)] text-[var(--badge-usdt-text)] px-3.5 py-1 text-xs font-extrabold">
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              Acepta USDT
            </span>
          )}

          {property.wifi_speed_mbps && (
            <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-bold">
              <Wifi
                className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                aria-hidden="true"
              />
              <span>Wi-Fi {property.wifi_speed_mbps} Mbps</span>
              <ComplianceInfoTooltip
                label="Alcance sobre velocidad de Wi-Fi"
                explanation="Velocidad declarada y acreditada por el anfitrión al momento del alta de la unidad."
              />
            </span>
          )}

          {property.numero_registro_turistico && (
            <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-extrabold text-[var(--text-primary)]">
              {property.jurisdiccion === "CABA"
                ? `RPATT Ley 6255: ${property.numero_registro_turistico}`
                : `Reg. Turístico: ${property.numero_registro_turistico}`}
            </span>
          )}

          {isDemoProperty && (
            <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-amber-400/95 px-3 py-1 text-xs font-black text-slate-950">
              Propiedad de demostración · Imágenes ilustrativas
            </span>
          )}

          {midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW" && (
            <span className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-1 text-xs font-extrabold text-amber-900 dark:text-amber-300">
              Estadías 1–6 meses: entrevista previa
            </span>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              {property.title}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)] font-medium">
              <span className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)]">
                <MapPin
                  className="h-4 w-4 text-[var(--brand-primary)]"
                  aria-hidden="true"
                />
                {property.address_line} · {property.unit_identifier}
              </span>
              <span aria-hidden="true">·</span>
              <span>{corridorLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" aria-hidden="true" />
                Hasta {property.max_adults}{" "}
                {property.max_adults === 1 ? "adulto" : "adultos"}
              </span>
            </p>
          </div>

          <a
            href={`/api/ical/${property.id}.ics`}
            className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-1.5 self-start md:self-auto rounded-xl px-3.5 py-2 text-xs font-bold"
          >
            <CalendarCheck
              className="h-4 w-4 text-[var(--brand-primary)]"
              aria-hidden="true"
            />
            Sincronizar calendario (.ics)
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      {/* Galería Bento de 4 Fotos + Mapa de Ubicación (carrusel deslizante en móvil / grid 4x2 en desktop, CLS = 0) */}
      <section
        aria-label="Galería fotográfica y mapa de ubicación del alojamiento"
        className="space-y-3 md:space-y-0 md:grid md:grid-cols-4 md:grid-rows-2 md:gap-3 md:rounded-3xl md:overflow-hidden"
      >
        <div className="md:col-span-2 md:row-span-2 relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-3xl md:rounded-none">
          <Image
            src={bentoPhotos[0].url}
            alt={bentoPhotos[0].alt}
            width={bentoPhotos[0].width}
            height={bentoPhotos[0].height}
            priority
            unoptimized={bentoPhotos[0].url.startsWith("data:")}
            className="h-full w-full object-cover hover:scale-105 transition-transform duration-300"
          />
          <div className="md:hidden absolute bottom-3 left-3 rounded-full bg-black/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
            Foto 1 de 4 · Deslizá abajo para más fotos y mapa
          </div>
          <div className="hidden md:block absolute bottom-3 left-3 rounded-full bg-black/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
            Vista principal · {property.unit_identifier}
          </div>
          {isDemoProperty && (
            <div className="absolute top-3 left-3 rounded-full bg-amber-400/95 px-3 py-1 text-[11px] font-black text-slate-950 shadow-sm">
              Propiedad de demostración · Imágenes ilustrativas
            </div>
          )}
        </div>

        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 px-4 pb-1 md:contents md:m-0 md:p-0">
          {bentoPhotos.slice(1, 4).map((photo, index) => (
            <div
              key={`${photo.url}-${index}`}
              className="shrink-0 w-[72vw] sm:w-[46vw] md:w-full snap-start relative aspect-[4/3] overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl md:rounded-none"
            >
              <Image
                src={photo.url}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                loading="lazy"
                unoptimized={photo.url.startsWith("data:")}
                className="h-full w-full object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>
          ))}

          <PropertyLocationMapTile
            propertyTitle={property.title}
            addressLine={property.address_line}
            corridorLabel={corridorLabel}
            mapData={locationMapData}
            className="shrink-0 w-[82vw] sm:w-[54vw] md:w-full snap-start"
          />
        </div>
      </section>

      {/* Cuerpo simétrico: Información progresiva a la izquierda + Simulador y reserva a la derecha */}
      <PropertyDateSelectionProvider
        occupiedRanges={occupiedRanges}
        todayYmd={todayYmd}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-start">
          <div className="lg:col-span-7 space-y-10 sm:space-y-8">
            {/* Resumen claro de la unidad */}
            <ScrollReveal stepLabel="01 · El espacio">
              <section
                aria-labelledby="unit-overview-heading"
                className="surface-card p-6 sm:p-8 space-y-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                  <div className="flex items-center gap-3">
                    <Icon3D name="home" size="md" />
                    <div>
                      <h2
                        id="unit-overview-heading"
                        className="text-xl font-extrabold"
                      >
                        Tu espacio en {corridorLabel}
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Contrato de locación celebrado directa y exclusivamente
                        entre Anfitrión y Huésped. I-bita provee la plataforma
                        tecnológica de publicación y calendario (no actúa como
                        inmobiliaria).
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-[var(--surface-tint)] border border-[var(--brand-primary)]/30 px-3 py-1 text-xs font-extrabold text-[var(--brand-primary)]">
                    {property.monthly_discount_pct}% menos por mes
                  </span>
                </div>

                <ExpandableDescription text={property.description} />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                    <span className="text-xs font-bold text-[var(--text-secondary)] block">
                      Capacidad
                    </span>
                    <span className="text-sm font-extrabold">
                      Hasta {property.max_adults} adultos
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                    <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                      <span>Internet declarado</span>
                      <ComplianceInfoTooltip
                        label="Detalle sobre velocidad declarada"
                        explanation="Velocidad declarada y acreditada por el anfitrión al momento del alta."
                      />
                    </span>
                    <span className="text-sm font-extrabold">
                      {property.wifi_speed_mbps
                        ? `${property.wifi_speed_mbps} Mbps declarados`
                        : "Declarado por anfitrión"}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                    <span className="text-xs font-bold text-[var(--text-secondary)] block">
                      Registro y jurisdicción
                    </span>
                    <span className="text-sm font-extrabold break-all">
                      {property.numero_registro_turistico
                        ? property.numero_registro_turistico
                        : property.jurisdiccion === "CABA"
                          ? "RPATT pendiente / +90 noches"
                          : jurisdictionLabel}
                    </span>
                  </div>
                </div>
              </section>
            </ScrollReveal>

            {/* Horario confirmado de respuesta y tasa sincronizada del anfitrión */}
            <ScrollReveal stepLabel="02 · Respuesta del anfitrión" delayMs={40}>
              <HostResponseWindowCard
                mode="listing"
                hostName={hostResponseMetrics.hostName}
                metrics={hostResponseMetrics}
              />
            </ScrollReveal>

            {/* Calendario visual de disponibilidad siempre visible */}
            <ScrollReveal stepLabel="03 · Disponibilidad" delayMs={40}>
              <section
                aria-labelledby="availability-calendar-heading"
                className="surface-card p-5 sm:p-8 space-y-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                  <div className="flex items-start gap-3">
                    <Icon3D name="calendar" size="md" />
                    <div>
                      <h2
                        id="availability-calendar-heading"
                        className="text-xl font-extrabold"
                      >
                        Calendario de disponibilidad
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-0.5">
                        Consultá fechas disponibles, reservas parciales (apartadas 1 h)
                        y fechas no disponibles confirmadas. Cada reserva se confirma
                        de forma definitiva al acreditarse el pago y la confirmación del
                        anfitrión.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold">
                    <span className="rounded-full border border-emerald-600/35 bg-emerald-500/12 px-3 py-1 text-emerald-900 dark:text-emerald-300">
                      Disponibles en verde
                    </span>
                    {occupiedRanges.some((r) => r.occupancyKind === "PARTIAL_HOLD") && (
                      <span className="rounded-full border border-amber-500/45 bg-amber-500/15 px-3 py-1 text-amber-950 dark:text-amber-200">
                        {occupiedRanges.filter((r) => r.occupancyKind === "PARTIAL_HOLD").length}{" "}
                        parcial (1 h)
                      </span>
                    )}
                  </div>
                </div>

                <PropertyAvailabilityCalendar
                  occupiedRanges={occupiedRanges}
                  todayYmd={todayYmd}
                  variant="full"
                />
              </section>
            </ScrollReveal>

            <ScrollReveal
              stepLabel="04 · Ingreso y estadías largas"
              delayMs={40}
              className="space-y-5"
            >

              {/* Revelación progresiva 1: Seguridad y convivencia */}
              <ProgressiveDisclosure
                icon="shield"
                badge="Edificio tranquilo"
                title="¿Cómo funciona el ingreso seguro y el cuidado del edificio?"
                subtitle="Mirá cómo validamos a cada huésped y cuándo recibís la clave de la puerta."
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="surface-card p-4 space-y-2">
                    <div className="flex items-center gap-2 font-extrabold text-sm">
                      <Icon3D name="face" size="sm" />
                      <span>Validación rápida antes de llegar</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Cada adulto que se aloja confirma su DNI argentino y una
                      selfie en pocos minutos desde el celular para que el ingreso sea
                      ágil y seguro.
                    </p>
                  </div>

                  <div className="surface-card p-4 space-y-2">
                    <div className="flex items-center gap-2 font-extrabold text-sm">
                      <Icon3D name="key" size="sm" />
                      <span>Clave de entrada protegida</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      La clave de la cerradura permanece guardada de forma privada y
                      se habilita automáticamente cuando todos los adultos completaron
                      su verificación.
                    </p>
                  </div>

                  <div className="surface-card p-4 space-y-2 sm:col-span-2">
                    <div className="flex items-center gap-2 font-extrabold text-sm">
                      <Icon3D name="contract" size="sm" />
                      <span>
                        Estadías de 1 a 6 meses: descuento mensual y contrato incluido
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Si reservás entre 30 y 180 noches se aplica automáticamente un{" "}
                      <strong>{property.monthly_discount_pct}% de descuento</strong>,
                      la comisión baja al <strong>6%</strong> y firmás un acuerdo
                      temporario en PDF conforme a la ley argentina.
                    </p>
                  </div>
                </div>
              </ProgressiveDisclosure>

              {/* Revelación progresiva 2: Modalidad y requisitos para estadías largas (1 a 6 meses) */}
              <ProgressiveDisclosure
                icon="contract"
                badge={
                  midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW"
                    ? "Entrevista previa"
                    : "Confirmación automática"
                }
                defaultOpen={midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW"}
                title="Condiciones y requisitos para estadías largas (1 a 6 meses)"
                subtitle={
                  midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW"
                    ? `Antes de habilitar el pago, el anfitrión conversa con vos (${midTermPolicy.interviewChannels.map((c) => INTERVIEW_CHANNEL_LABELS[c]).join(" / ")}).`
                    : "Confirmación directa en pocos pasos cumpliendo los requisitos indicados."
                }
              >
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 space-y-2 text-xs">
                    <p className="font-extrabold text-sm text-[var(--text-primary)]">
                      {midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW"
                        ? `Paso previo de aprobación · Respuesta estimada dentro de ${midTermPolicy.responseTimeHours} hs`
                        : "Confirmación automática para estadías de 30 a 180 noches"}
                    </p>
                    {midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW" ? (
                      <>
                        <p className="text-[var(--text-secondary)] leading-relaxed">
                          Para estadías de 1 a 6 meses, enviás tu solicitud sin abonar todavía. El anfitrión indaga y coordina una charla previa por{" "}
                          <strong>
                            {midTermPolicy.interviewChannels
                              .map((c) => INTERVIEW_CHANNEL_LABELS[c])
                              .join(", ")}
                          </strong>{" "}
                          antes de aprobar tu ingreso.
                        </p>
                        {midTermPolicy.interviewInstructions && (
                          <p className="rounded-xl bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)] font-semibold">
                            Nota del anfitrión: {midTermPolicy.interviewInstructions}
                          </p>
                        )}
                        {midTermPolicy.screeningQuestions.length > 0 && (
                          <p className="text-[var(--text-secondary)]">
                            Al solicitar vas a responder {midTermPolicy.screeningQuestions.length}{" "}
                            {midTermPolicy.screeningQuestions.length === 1
                              ? "pregunta breve"
                              : "preguntas breves"}{" "}
                            para agilizar la charla.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-[var(--text-secondary)] leading-relaxed">
                        Podés apartar las fechas al instante y pasar directo al pago seguro y firma del contrato temporario digital.
                      </p>
                    )}
                  </div>

                  {enabledMidTermRequirements.length > 0 && (
                    <div className="space-y-2.5">
                      <p className="text-xs font-extrabold text-[var(--text-primary)]">
                        Requisitos configurados por el anfitrión ({enabledMidTermRequirements.length}):
                      </p>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {enabledMidTermRequirements.map((req) => (
                          <li
                            key={req.id}
                            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                                {REQUIREMENT_CATEGORY_LABELS[req.category]}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${req.required
                                  ? "bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                                  : "border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                                  }`}
                              >
                                {req.required ? "Obligatorio" : "Opcional"}
                              </span>
                            </div>
                            <p className="text-xs font-extrabold text-[var(--text-primary)]">
                              {req.label}
                            </p>
                            {req.detail && (
                              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                {req.detail}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </ProgressiveDisclosure>
            </ScrollReveal>
          </div>

          {/* Columna Derecha: Calculadora amigable y paso a paso */}
          <div id="reservar-alojamiento" className="lg:col-span-5 scroll-mt-24">
            <ScrollReveal stepLabel="05 · Reservá tus fechas">
              <StickyBookingWidget
                propertyId={property.id}
                propertySlug={property.slug}
                propertyTitle={property.title}
                baseCurrency={property.base_currency}
                nightlyRate={property.nightly_rate}
                monthlyDiscountPct={property.monthly_discount_pct}
                maxAdults={property.max_adults}
                absorbInstallmentsCost={property.absorb_installments_cost}
                acceptsUsdt={cryptoEnabled && property.accepts_usdt}
                microCanonPct={microCanonPct}
                consortiumName={consortiumConfig?.consortium_name ?? null}
                midTermPolicy={midTermPolicy}
                occupiedRanges={occupiedRanges}
                todayYmd={todayYmd}
                hostResponseSummary={{
                  hostName: hostResponseMetrics.hostName,
                  scheduleSummary: hostResponseMetrics.scheduleSummary,
                  responseRatePct: hostResponseMetrics.responseRatePct,
                }}
                authenticatedEmail={authenticatedEmail}
              />
            </ScrollReveal>
          </div>
        </div>
      </PropertyDateSelectionProvider>

      <MobileBookingJumpBar
        nightlyRate={property.nightly_rate}
        baseCurrency={property.base_currency}
        monthlyDiscountPct={property.monthly_discount_pct}
        targetId="reservar-alojamiento"
      />
    </article>
  );
}

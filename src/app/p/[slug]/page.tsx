import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ShieldCheck,
  CreditCard,
  Coins,
  Wifi,
  Users,
  Building2,
  MapPin,
  Lock,
  CalendarCheck,
  FileCheck2,
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
import { StickyBookingWidget } from "@/components/booking/StickyBookingWidget";

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
    title: `${property.title} — Reserva Directa en ARS (Cuotas) o USDT`,
    description: `${property.title} en ${property.address_line} (${corridorLabel}). Reservá por día o Media Estadía (30 a 180 noches con ${property.monthly_discount_pct}% OFF y comisión reducida al 6%). Propiedad Consorcio Friendly con Pre-Check-in Biométrico.`,
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

  const occupiedRanges = await getPropertyOccupiedDateRanges(property.id);
  const bentoPhotos = buildBentoGalleryImages(property.images, property.title);
  const corridorLabel = CORRIDOR_LABELS[property.corridor] ?? property.corridor;
  const consortiumConfig = property.consortium_config ?? null;
  const microCanonPct = consortiumConfig?.active
    ? Number(consortiumConfig.micro_canon_pct)
    : 0;

  // Marcado estructurado Schema.org (JSON-LD) para SEO/GEO/AEO (cero datos de access_code_*)
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
        name: "Consorcio Friendly · Pase Digital QR a Portería",
        value: true,
      },
      {
        "@type": "LocationFeatureSpecification",
        name: "Financiación en ARS (1, 3 y 6 cuotas) y USDT Polygon",
        value: true,
      },
      ...(property.wifi_speed_mbps
        ? [
            {
              "@type": "LocationFeatureSpecification",
              name: `Wi-Fi Fibra Verificado (${property.wifi_speed_mbps} Mbps)`,
              value: property.wifi_speed_mbps,
            },
          ]
        : []),
    ],
  };

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(accommodationJsonLd),
        }}
      />

      {/* Cabecera del Micrositio B2B2C con Insignias de Confianza Local */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {consortiumConfig?.active
              ? `Propiedad Consorcio Friendly · Pase QR (${consortiumConfig.consortium_name})`
              : "Consorcio Friendly · Pase QR Zero-Trust"}
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-3.5 py-1 text-xs font-extrabold">
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            Acepta Cuotas ARS (1, 3 y 6 pagos)
          </span>

          {property.accepts_usdt && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--badge-usdt-bg)] text-[var(--badge-usdt-text)] px-3.5 py-1 text-xs font-extrabold">
              <Coins className="h-3.5 w-3.5" aria-hidden="true" />
              Acepta USDT (Red Polygon · Escrow)
            </span>
          )}

          {property.wifi_speed_mbps && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-bold">
              <Wifi
                className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                aria-hidden="true"
              />
              Wi-Fi {property.wifi_speed_mbps} Mbps Verificado
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
                {property.max_adults === 1
                  ? "adulto verificado"
                  : "adultos verificados"}
              </span>
            </p>
          </div>

          <a
            href={`/api/ical/${property.id}.ics`}
            className="inline-flex items-center gap-1.5 self-start md:self-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2 text-xs font-bold hover:bg-[var(--bg-elevated)]"
          >
            <CalendarCheck
              className="h-4 w-4 text-[var(--brand-primary)]"
              aria-hidden="true"
            />
            Calendario RFC 5545 (.ics)
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      {/* Galería Bento de 5 Fotos estilo Airbnb Argentina con Relación de Aspecto Fija (CLS = 0) */}
      <section
        aria-label="Galería fotográfica optimizada de la Unidad Funcional"
        className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-3 rounded-3xl overflow-hidden"
      >
        {/* Foto Principal Hero (Izquierda: 2 columnas x 2 filas en Desktop) */}
        <div className="md:col-span-2 md:row-span-2 relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl md:rounded-none">
          <Image
            src={bentoPhotos[0].url}
            alt={bentoPhotos[0].alt}
            width={bentoPhotos[0].width}
            height={bentoPhotos[0].height}
            priority
            unoptimized={bentoPhotos[0].url.startsWith("data:")}
            className="h-full w-full object-cover hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute bottom-3 left-3 rounded-full bg-black/75 px-3 py-1 text-xs font-bold text-white backdrop-blur-xs">
            Vista Principal · {property.unit_identifier}
          </div>
        </div>

        {/* 4 Fotos Secundarias del Bento Grid */}
        {bentoPhotos.slice(1, 5).map((photo, index) => (
          <div
            key={`${photo.url}-${index}`}
            className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl md:rounded-none"
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
      </section>

      {/* Cuerpo Principal: Información Consorcial a la Izquierda + StickyBookingWidget a la Derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-8">
          {/* Resumen Ejecutivo de la Unidad */}
          <section
            aria-labelledby="unit-overview-heading"
            className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-4">
              <div>
                <h2
                  id="unit-overview-heading"
                  className="text-xl font-extrabold"
                >
                  Unidad Funcional Verificada en {corridorLabel}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Canal de Reserva Directa B2B2C del Anfitrión · Sin comisiones
                  de plataformas extranjeras
                </p>
              </div>
              <span className="rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-3 py-1 text-xs font-extrabold">
                Dto. Media Estadía: -{property.monthly_discount_pct}%
              </span>
            </div>

            <p className="text-sm sm:text-base leading-relaxed text-[var(--text-primary)] whitespace-pre-line">
              {property.description}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5">
                <span className="text-xs font-bold text-[var(--text-secondary)] block">
                  Capacidad Máxima
                </span>
                <span className="text-sm font-extrabold">
                  {property.max_adults} Adultos c/ Biometría
                </span>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5">
                <span className="text-xs font-bold text-[var(--text-secondary)] block">
                  Conectividad Remota
                </span>
                <span className="text-sm font-extrabold">
                  {property.wifi_speed_mbps
                    ? `${property.wifi_speed_mbps} Mbps Simétricos`
                    : "Fibra Alta Velocidad"}
                </span>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5">
                <span className="text-xs font-bold text-[var(--text-secondary)] block">
                  Estadía Admitida
                </span>
                <span className="text-sm font-extrabold">
                  1 a 180 noches (CCyC)
                </span>
              </div>
            </div>
          </section>

          {/* Reglas del Consorcio y Protocolo Zero-Trust */}
          <section
            aria-labelledby="consortium-rules-heading"
            className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8 space-y-5"
          >
            <div className="flex items-center gap-2.5">
              <Building2
                className="h-6 w-6 text-[var(--brand-primary)]"
                aria-hidden="true"
              />
              <h2
                id="consortium-rules-heading"
                className="text-xl font-extrabold"
              >
                Convivencia Consorcio Friendly y Seguridad Zero-Trust
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <ShieldCheck
                    className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <span>Pre-Check-in Biométrico Obligatorio</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Al iniciar tu reserva se generan{" "}
                  <strong>slots individuales</strong> en{" "}
                  <code>public.guest_verifications</code> para el titular y cada
                  acompañante adulto declarado (lectura PDF417 del DNI + Selfie
                  auditada con Gemini 2.5 Flash).
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <Lock
                    className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  <span>PIN Cifrado en Reposo (AES-256-GCM)</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Por seguridad física del edificio, las columnas{" "}
                  <code>access_code_*</code> están excluidas de esta consulta
                  pública. El código de cerradura solo se desencripta cuando el
                  100% de los adultos están verificados.
                </p>
              </div>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-2 sm:col-span-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  <FileCheck2
                    className="h-4 w-4 text-[var(--brand-primary)]"
                    aria-hidden="true"
                  />
                  <span>
                    Media Estadía (30 a 180 noches): Contrato Art. 1199 CCyC +
                    Custodia Escrow
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  En estadías de 1 a 6 meses se aplica automáticamente el{" "}
                  <strong>{property.monthly_discount_pct}% de descuento</strong>{" "}
                  sobre la tarifa diaria, la comisión de plataforma baja al{" "}
                  <strong>6.00%</strong> y se emite el Contrato de Locación
                  Temporaria en PDF sellado con <code>SHA-256</code>.
                </p>
              </div>
            </div>
          </section>

          {/* Calendario de Fechas Ocupadas / Bloqueos iCal */}
          <section
            aria-labelledby="availability-heading"
            className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="availability-heading" className="text-lg font-extrabold">
                Estado del Calendario (`btree_gist` + iCal Anti-SSRF)
              </h2>
              <span className="text-xs font-semibold text-[var(--text-secondary)]">
                Zona horaria: America/Argentina/Buenos_Aires
              </span>
            </div>

            {occupiedRanges.length === 0 ? (
              <p className="rounded-2xl border border-emerald-600/30 bg-[var(--badge-consorcio-bg)]/50 p-4 text-xs font-bold text-[var(--badge-consorcio-text)]">
                ✓ Disponibilidad inmediata: No se registran bloqueos activos en
                las próximas fechas.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[var(--text-secondary)]">
                  Los siguientes rangos ya se encuentran reservados o bloqueados
                  vía sincronización iCal (protegidos contra sobreventa por{" "}
                  <code>no_overlapping_active_bookings</code>):
                </p>
                <div className="flex flex-wrap gap-2">
                  {occupiedRanges.slice(0, 12).map((range) => (
                    <span
                      key={range.id}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-mono font-bold"
                    >
                      <span>
                        {range.checkIn} → {range.checkOut}
                      </span>
                      <span className="rounded-md bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                        {range.status === "ICAL_BLOCK" ? "iCal" : "Reservado"}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Columna Derecha: Calculadora Tarifaria Exacta (decimal.js) y Reserva Directa */}
        <div className="lg:col-span-5">
          <StickyBookingWidget
            propertyId={property.id}
            propertySlug={property.slug}
            propertyTitle={property.title}
            baseCurrency={property.base_currency}
            nightlyRate={property.nightly_rate}
            monthlyDiscountPct={property.monthly_discount_pct}
            maxAdults={property.max_adults}
            absorbInstallmentsCost={property.absorb_installments_cost}
            acceptsUsdt={property.accepts_usdt}
            microCanonPct={microCanonPct}
            consortiumName={consortiumConfig?.consortium_name ?? null}
            occupiedRanges={occupiedRanges}
            authenticatedEmail={authenticatedEmail}
          />
        </div>
      </div>
    </article>
  );
}

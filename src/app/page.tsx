import Link from "next/link";
import Image from "next/image";
import { calculateStayPricing } from "@/lib/math/money";
import {
  ShieldCheck,
  CreditCard,
  FileCheck2,
  Building2,
  ArrowRight,
  Sparkles,
  MapPin,
  CheckCircle2,
  Coins,
  ScanFace,
  Layers,
} from "lucide-react";

export default function HomePage() {
  const sampleShortStay = calculateStayPricing({
    nightlyRate: 65000,
    nights: 5,
    microCanonPct: 1.5,
  });

  const sampleMidTerm = calculateStayPricing({
    nightlyRate: 65000,
    nights: 60,
    monthlyDiscountPct: 20,
    microCanonPct: 1.5,
  });

  const demoBookingId = "00000000-0000-4000-8000-000000000100";
  const demoToken = "00000000-0000-4000-8000-000000000777";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-12">
      {/* 🚀 HUB DE PRUEBAS INTERACTIVO DEL MVP */}
      <section
        aria-label="Panel de navegación rápida MVP"
        className="rounded-3xl border-2 border-[var(--brand-primary)] bg-gradient-to-br from-[var(--bg-secondary)] via-[var(--bg-elevated)] to-[var(--bg-secondary)] p-6 sm:p-8 shadow-lg space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] text-white px-3 py-1 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />
              Guía de Prueba Rápida del MVP (Interactivo)
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Probá las funciones del MVP en 5 pasos directos
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              No necesitás adivinar URLs ni IDs. Hacé clic en cada etapa para probar el flujo real:
            </p>
          </div>
          <Link
            href="/p/loft-luminoso-palermo-soho"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-[var(--brand-primary-hover)] transition-transform active:scale-95 whitespace-nowrap"
          >
            Iniciar Recorrido Completo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* 5 Botones de Navegación Rápida */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* Paso 1 */}
          <Link
            href="/p/loft-luminoso-palermo-soho"
            className="group flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 hover:border-[var(--brand-primary)] hover:shadow-md transition-all"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-[var(--brand-primary)]">PASO 1</span>
                <Building2 className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-[var(--brand-primary)]" />
              </div>
              <h3 className="text-sm font-bold">Propiedad Demo</h3>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                Loft en Palermo Soho con widget de cotización en vivo.
              </p>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-primary)]">
              Explorar →
            </span>
          </Link>

          {/* Paso 2 */}
          <Link
            href={`/checkout/${demoBookingId}`}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 hover:border-[var(--brand-primary)] hover:shadow-md transition-all"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-600 dark:text-blue-400">PASO 2</span>
                <CreditCard className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-blue-500" />
              </div>
              <h3 className="text-sm font-bold">Checkout Dual</h3>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                Mercado Pago en ARS (cuotas) o USDT en Polygon.
              </p>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400">
              Pagar →
            </span>
          </Link>

          {/* Paso 3 */}
          <Link
            href={`/contratos/${demoBookingId}?token=${demoToken}`}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 hover:border-[var(--brand-primary)] hover:shadow-md transition-all"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-600 dark:text-amber-400">PASO 3</span>
                <FileCheck2 className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-amber-500" />
              </div>
              <h3 className="text-sm font-bold">Contrato CCyC</h3>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                Firma digital y descarga de PDF sellado con SHA-256.
              </p>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
              Firmar →
            </span>
          </Link>

          {/* Paso 4 */}
          <Link
            href={`/checkin/${demoBookingId}?token=${demoToken}`}
            className="group flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 hover:border-[var(--brand-primary)] hover:shadow-md transition-all"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">PASO 4</span>
                <ScanFace className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-emerald-500" />
              </div>
              <h3 className="text-sm font-bold">Pre-Checkin KYC</h3>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                DNI PDF417 + selfie con IA y Pase QR de Portería.
              </p>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              Validar →
            </span>
          </Link>

          {/* Paso 5 */}
          <Link
            href="/dashboard/propiedades"
            className="group flex flex-col justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 hover:border-[var(--brand-primary)] hover:shadow-md transition-all"
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-purple-600 dark:text-purple-400">PASO 5</span>
                <Layers className="h-4 w-4 text-[var(--text-secondary)] group-hover:text-purple-500" />
              </div>
              <h3 className="text-sm font-bold">Panel Anfitrión</h3>
              <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                Gestión de consorcios, sync iCal y micro-cánones.
              </p>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400">
              Administrar →
            </span>
          </Link>
        </div>
      </section>

      {/* Hero Principal */}
      <section
        aria-labelledby="hero-heading"
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-6 sm:p-10 space-y-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Consorcio Friendly · Pase Digital QR a Portería
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-1 text-xs font-semibold">
            <CreditCard className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
            ARS en 3 y 6 Cuotas (Mercado Pago / MODO) o USDT en Polygon
          </span>
        </div>

        <h1
          id="hero-heading"
          className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight"
        >
          Alojamientos en Argentina por día o media estadía,{" "}
          <span className="text-[var(--brand-primary)]">
            sin impuesto al dólar tarjeta y en paz con el edificio.
          </span>
        </h1>

        <p className="max-w-3xl text-base sm:text-lg text-[var(--text-secondary)]">
          Reservá directo en Pesos Argentinos o Stablecoins (USDT), con validación biométrica RENAPER para todos los huéspedes y contratos temporarios digitales (Art. 1199 CCyC) con comisión reducida del 6% en estadías de 1 a 6 meses.
        </p>
      </section>

      {/* SHOWCASE DE LA PROPIEDAD DESTACADA */}
      <section aria-labelledby="featured-property-heading" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="featured-property-heading" className="text-2xl font-bold tracking-tight">
              Propiedad Destacada en Palermo Soho
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Ejemplo real integrado con cálculo dinámico en ARS y USDT.
            </p>
          </div>
          <Link
            href="/p/loft-luminoso-palermo-soho"
            className="text-sm font-bold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1"
          >
            Ver Detalle Completo →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-sm overflow-hidden">
          <div className="relative aspect-video md:aspect-auto md:h-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800">
            {/* Imagen principal */}
            <img
              src="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80"
              alt="Loft en Palermo Soho"
              className="h-full w-full object-cover"
            />
            <div className="absolute top-3 left-3 flex flex-col gap-1">
              <span className="badge-consorcio-friendly rounded-full px-2.5 py-0.5 text-xs font-bold shadow-xs">
                Consorcio Friendly
              </span>
            </div>
          </div>

          <div className="md:col-span-2 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <MapPin className="h-3.5 w-3.5 text-[var(--brand-primary)]" />
                <span>Gorriti 4800, Palermo Soho · CABA</span>
                <span>·</span>
                <span>WiFi 300 Mbps Simétrico</span>
              </div>
              <h3 className="text-xl font-extrabold tracking-tight">
                Loft de Diseño en Palermo Soho · Balcón & Coworking
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Departamento moderno de diseño industrial equipado para estadías cortas o medias estadías de profesionales y nómades digitales (1 a 6 meses). Edificio con portería digital, micro-canon al consorcio y cerradura inteligente.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                <span className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold">
                  💵 $ 65.000 ARS / noche
                </span>
                <span className="rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 text-xs font-bold">
                  🎉 20% OFF en Media Estadía (≥30 días)
                </span>
                <span className="rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 px-2.5 py-1 text-xs font-bold">
                  ₮ Acepta USDT en Polygon
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">Tarifa base</p>
                <p className="text-xl font-black text-[var(--brand-primary)]">
                  $ 65.000 <span className="text-xs font-medium text-[var(--text-secondary)]">ARS / noche</span>
                </p>
              </div>

              <Link
                href="/p/loft-luminoso-palermo-soho"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-[var(--brand-primary-hover)] transition-colors"
              >
                Simular Reserva & Cotizar
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Demostración en vivo del Motor Matemático Decimal.js */}
      <section aria-labelledby="pricing-engine-heading" className="space-y-6">
        <div>
          <h2 id="pricing-engine-heading" className="text-2xl font-bold">
            Motor Tarifario Dual Exacto (`decimal.js`)
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Comparativa transparente entre Estadía Corta Turística y Media Estadía (1 a 6 meses) con Micro-Canon Consorcial incluido.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Estadía Corta */}
          <article className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Escapada / Turismo ({sampleShortStay.nights} noches)
              </span>
              <span className="rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-3 py-1 text-xs font-bold">
                3 y 6 Cuotas en ARS
              </span>
            </div>
            <p className="text-2xl font-extrabold">
              $ {Number(sampleShortStay.totalGuestPayable).toLocaleString("es-AR")} ARS
            </p>
            <dl className="space-y-2 text-sm border-t border-[var(--border-subtle)] pt-4">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Alojamiento neto:</dt>
                <dd className="font-semibold">$ {Number(sampleShortStay.netAccommodationAmount).toLocaleString("es-AR")} ARS</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Comisión I-bita ({sampleShortStay.platformFeePct}%):</dt>
                <dd className="font-semibold">$ {Number(sampleShortStay.platformFeeAmount).toLocaleString("es-AR")} ARS</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Micro-Canon al Consorcio ({sampleShortStay.consortiumCanonPct}%):</dt>
                <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                  $ {Number(sampleShortStay.consortiumCanonAmount).toLocaleString("es-AR")} ARS
                </dd>
              </div>
              <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 font-bold text-[var(--brand-primary)]">
                <dt>Ahorro directo vs. OTA extranjera:</dt>
                <dd>$ {Number(sampleShortStay.directSavingsAmount).toLocaleString("es-AR")} ARS</dd>
              </div>
            </dl>
          </article>

          {/* Card Media Estadía */}
          <article className="rounded-2xl border-2 border-[var(--brand-primary)] bg-[var(--bg-elevated)] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand-primary)]">
                Media Estadía ({sampleMidTerm.nights} noches · 2 Meses)
              </span>
              <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
                Comisión Reducida {sampleMidTerm.platformFeePct}% + Contrato CCyC
              </span>
            </div>
            <p className="text-2xl font-extrabold">
              $ {Number(sampleMidTerm.totalGuestPayable).toLocaleString("es-AR")} ARS
            </p>
            <dl className="space-y-2 text-sm border-t border-[var(--border-subtle)] pt-4">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Descuento mensual aplicado (20%):</dt>
                <dd className="font-semibold text-emerald-700 dark:text-emerald-400">
                  - $ {Number(sampleMidTerm.discountAmount).toLocaleString("es-AR")} ARS
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Comisión Media Estadía ({sampleMidTerm.platformFeePct}%):</dt>
                <dd className="font-semibold">$ {Number(sampleMidTerm.platformFeeAmount).toLocaleString("es-AR")} ARS</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Aporte al Fondo del Consorcio ({sampleMidTerm.consortiumCanonPct}%):</dt>
                <dd className="font-semibold">$ {Number(sampleMidTerm.consortiumCanonAmount).toLocaleString("es-AR")} ARS</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 font-bold text-[var(--brand-primary)]">
                <dt>Ahorro directo vs. Airbnb:</dt>
                <dd>$ {Number(sampleMidTerm.directSavingsAmount).toLocaleString("es-AR")} ARS</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      {/* Los 3 Pilares Arquitectónicos */}
      <section aria-label="Pilares de Innovación Local" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-[var(--border-subtle)] p-6 space-y-2">
          <CreditCard className="h-6 w-6 text-[var(--brand-primary)]" aria-hidden="true" />
          <h3 className="text-lg font-bold">Pilar A: Motor Bi-Monetario</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Cobro nativo en ARS con Mercado Pago (HMAC-SHA256) y USDT en Polygon verificado on-chain con <code>viem</code>.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] p-6 space-y-2">
          <Building2 className="h-6 w-6 text-[var(--brand-primary)]" aria-hidden="true" />
          <h3 className="text-lg font-bold">Pilar B: Consorcio Friendly</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Escaneo PDF417 del DNI argentino + selfie validada con Gemini 2.5 Flash y código de cerradura cifrado con <code>AES-256-GCM</code> (Zero-Trust).
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] p-6 space-y-2">
          <FileCheck2 className="h-6 w-6 text-[var(--brand-primary)]" aria-hidden="true" />
          <h3 className="text-lg font-bold">Pilar C: Contratos Media Estadía</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Contratos de locación temporaria (Art. 1199 CCyC) generados en PDF en servidor y sellados criptográficamente con <code>SHA-256</code>.
          </p>
        </div>
      </section>
    </div>
  );
}

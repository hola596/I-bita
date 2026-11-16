import { calculateStayPricing } from "@/lib/math/money";
import { ShieldCheck, CreditCard, FileCheck2, Building2 } from "lucide-react";

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

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-12">
      {/* Hero inspirado en Airbnb Argentina con los 3 pilares locales */}
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

      {/* Demostración en vivo del Motor Matemático Decimal.js (Estadía Corta vs Media Estadía) */}
      <section aria-labelledby="pricing-engine-heading" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 id="pricing-engine-heading" className="text-2xl font-bold">
              Motor Tarifario Dual Exacto (`decimal.js`)
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Comparativa transparente entre Estadía Corta Turística y Media Estadía (1 a 6 meses) con Micro-Canon Consorcial incluido.
            </p>
          </div>
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

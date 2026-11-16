import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones de Uso y Locación Temporaria (CCyC)",
  description:
    "Términos y Condiciones de I-bita Argentina: Mandato de cobro bi-monetario (ARS/USDT), regla Zero-Trust Consorcial y Contratos de Media Estadía (Art. 1199 CCyC).",
};

export default function TerminosPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
          Código Civil y Comercial de la Nación · Art. 1198 / 1199
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight pt-2">
          Términos y Condiciones Generales de I-bita
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Vigencia: 16 de noviembre de 2026 — República Argentina
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          1. Naturaleza del Servicio y Mandato de Liquidación (Split)
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          I-bita provee infraestructura tecnológica SaaS B2B2C y Marketplace B2C que vincula a Anfitriones verificados con Huéspedes e Inquilinos de estadía corta (1 a 29 noches) y media estadía (30 a 180 noches). Los pagos se procesan mediante proveedores regulados en Pesos Argentinos (ARS vía Mercado Pago) o en contratos inteligentes ERC-20 de USDT sobre la red Polygon verificados on-chain.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          2. Regla Inquebrantable &ldquo;Zero-Trust Consorcial&rdquo;
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          El Huésped acepta expresamente que las instrucciones exactas de ingreso y el código de cerradura de la Unidad Funcional permanecen cifrados con <code>AES-256-GCM</code> y solo se liberan cuando el <strong>100% de los adultos declarados en la reserva</strong> completan satisfactoriamente el Pre-Check-in Biométrico.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          3. Contratos de Media Estadía (Art. 1199 CCyC) y Depósito en Escrow
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          En reservas de 30 a 180 noches, las partes suscriben digitalmente el Contrato de Locación Temporaria amparado en el Artículo 1199 del Código Civil y Comercial de la Nación, sellado criptográficamente con algoritmo <code>SHA-256</code>. La liberación de la liquidación del primer período y del Micro-Canon Consorcial (1% al 2%) se ejecuta cumplidas las 24 horas posteriores al Check-in verificado sin incidentes.
        </p>
      </section>
    </article>
  );
}

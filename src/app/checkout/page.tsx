import Link from "next/link";
import { CreditCard, ArrowRight, ShieldCheck, Coins } from "lucide-react";

export const metadata = {
  title: "Checkout Bi-Monetario | I-bita Argentina",
  description: "Pasarela de pago en Pesos Argentinos (Mercado Pago / Cuotas) y USDT (Polygon).",
};

export default function CheckoutIndexPage() {
  const demoBookingId = "00000000-0000-4000-8000-000000000100";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-3.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-400">
          <CreditCard className="h-4 w-4" />
          Pasarela Dual: ARS (Mercado Pago) + USDT (Polygon Escrow)
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Checkout Bi-Monetario
        </h1>
        <p className="text-[var(--text-secondary)] text-base max-w-2xl">
          Pagá en Pesos Argentinos sin percepciones en 3 y 6 cuotas bancarias vía Mercado Pago o transferí USDT en la red Polygon verificado directamente en la blockchain con smart contracts.
        </p>

        <div className="pt-4 flex flex-wrap gap-4">
          <Link
            href={`/checkout/${demoBookingId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-[var(--brand-primary-hover)] transition-colors"
          >
            <Coins className="h-4 w-4" />
            Abrir Checkout Demo de Prueba
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/p/loft-luminoso-palermo-soho"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-5 py-3 text-sm font-semibold hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Ver Propiedad en Palermo
          </Link>
        </div>
      </div>
    </div>
  );
}

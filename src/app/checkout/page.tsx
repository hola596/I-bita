import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon3D } from "@/components/ui/Icon3D";

export const metadata = {
  title: "Pago Seguro en Pesos o USDT | I-bita Argentina",
  description:
    "Pagá tu estadía en Pesos Argentinos en cuotas o en USDT con total tranquilidad.",
};

export default function CheckoutIndexPage() {
  const demoBookingId = "00000000-0000-4000-8000-000000000100";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <section className="surface-card p-6 sm:p-10 space-y-6">
        <div className="flex items-center gap-4">
          <Icon3D name="card" size="lg" />
          <div className="space-y-1">
            <span className="inline-block rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-3 py-1 text-xs font-extrabold">
              Pagos en pesos o en dólares digitales
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Elegí cómo querés pagar tu estadía
            </h1>
          </div>
        </div>

        <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          Podés abonar en pesos argentinos con Mercado Pago en hasta 6 cuotas, sin
          recargo de dólar tarjeta, o pagar con USDT de forma directa y transparente.
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={`/checkout/${demoBookingId}`}
            className="btn-primary-3d inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold"
          >
            <span>Probar pantalla de pago</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>

          <Link
            href="/p/loft-luminoso-palermo-soho"
            className="btn-secondary-3d inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold"
          >
            <span>Volver al departamento</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

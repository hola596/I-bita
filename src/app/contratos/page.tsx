import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Icon3D } from "@/components/ui/Icon3D";

export const metadata = {
  title: "Acuerdos Digitales de Alquiler | I-bita Argentina",
  description:
    "Acuerdos simples para estadías cortas (< 30 noches) y contratos digitales Art. 1199 para alquileres de 1 a 6 meses en Argentina.",
};

export default function ContratosIndexPage() {
  const demoBookingId = "00000000-0000-4000-8000-000000000100";
  const demoToken = "00000000-0000-4000-8000-000000000777";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <section className="surface-card p-6 sm:p-10 space-y-6">
        <div className="flex items-center gap-4">
          <Icon3D name="contract" size="lg" />
          <div className="space-y-1">
            <span className="badge-consorcio-friendly inline-block rounded-full px-3 py-1 text-xs font-extrabold">
              Acuerdos simples (&lt; 30 noches) y Contratos Art. 1199 (1 a 6 meses)
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Tu acuerdo digital, claro y sin trámites
            </h1>
          </div>
        </div>

        <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          Para estadías cortas menores a 30 noches firmás un acuerdo simple en
          1 minuto con las reglas de convivencia y precio cerrado. Para estadías
          de 30 noches o más, preparamos tu contrato temporario bajo Art. 1199
          en PDF, listo para firmar desde el celular o la compu.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href={`/contratos/${demoBookingId}?token=${demoToken}`}
            className="btn-primary-3d inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold"
          >
            <span>Ver ejemplo de contrato (60 días)</span>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="surface-card p-5 space-y-2">
          <Icon3D name="contract" size="sm" />
          <h2 className="font-extrabold text-base">1. Lectura en 1 minuto</h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Resumimos los puntos esenciales: fechas, precio cerrado, garantía y
            normas de convivencia.
          </p>
        </div>
        <div className="surface-card p-5 space-y-2">
          <Icon3D name="shield" size="sm" />
          <h2 className="font-extrabold text-base">2. Documento inalterable</h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Al firmarlo, el archivo queda protegido con un sello digital para que
            nadie pueda modificarlo.
          </p>
        </div>
        <div className="surface-card p-5 space-y-2">
          <Icon3D name="check" size="sm" />
          <h2 className="font-extrabold text-base">3. Descarga privada</h2>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
            Solo vos y el anfitrión pueden descargar el PDF guardado de manera
            segura en tu reserva.
          </p>
        </div>
      </div>
    </div>
  );
}

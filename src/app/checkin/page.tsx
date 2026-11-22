import Link from "next/link";
import { ArrowRight, ScanFace } from "lucide-react";
import { Icon3D } from "@/components/ui/Icon3D";

export const metadata = {
  title: "Confirmar Identidad y Pase de Ingreso | I-bita Argentina",
  description:
    "Validación simple de DNI y selfie para ingresar tranquilo al edificio con tu pase digital.",
};

export default function CheckinIndexPage() {
  const demoBookingId = "00000000-0000-4000-8000-000000000100";
  const demoToken = "00000000-0000-4000-8000-000000000777";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <section className="surface-card p-6 sm:p-10 space-y-6">
        <div className="flex items-center gap-4">
          <Icon3D name="face" size="lg" />
          <div className="space-y-1">
            <span className="badge-consorcio-friendly inline-block rounded-full px-3 py-1 text-xs font-extrabold">
              Ingreso ordenado · Cuidamos la paz del edificio
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Confirmá tu identidad en 3 pasos simples
            </h1>
          </div>
        </div>

        <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-2xl leading-relaxed">
          Antes de llegar, cada adulto que se aloja valida su DNI argentino y una
          foto rápida. Así recibís tu pase con código QR para el encargado y la
          clave de la puerta sin demoras al llegar.
        </p>

        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href={`/checkin/${demoBookingId}?token=${demoToken}`}
            className="btn-primary-3d inline-flex min-h-[48px] items-center gap-2 rounded-2xl px-6 py-3 text-sm font-extrabold"
          >
            <ScanFace className="h-4 w-4" aria-hidden="true" />
            <span>Probar confirmación de identidad</span>
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

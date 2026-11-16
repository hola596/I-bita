import Link from "next/link";
import { ShieldCheck, ArrowRight, ScanFace, Building2 } from "lucide-react";

export const metadata = {
  title: "Pre-Check-in Biométrico | I-bita Argentina",
  description: "Validación de identidad con DNI argentino y Pase Digital de Portería.",
};

export default function CheckinIndexPage() {
  const demoBookingId = "00000000-0000-4000-8000-000000000100";
  const demoToken = "00000000-0000-4000-8000-000000000777";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          Consorcio Friendly · Zero-Trust Biométrico (Ley 25.326)
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Pre-Check-in y Pase Digital de Portería
        </h1>
        <p className="text-[var(--text-secondary)] text-base max-w-2xl">
          Todos los huéspedes adultos escanean el código de barras PDF417 de su DNI argentino y se toman una selfie biométrica validada con IA. Al completarse, el sistema emite el Pase Digital de Portería con código QR y libera el PIN de la cerradura inteligente.
        </p>

        <div className="pt-4 flex flex-wrap gap-4">
          <Link
            href={`/checkin/${demoBookingId}?token=${demoToken}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-[var(--brand-primary-hover)] transition-colors"
          >
            <ScanFace className="h-4 w-4" />
            Probar Flujo de Check-in Demo
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

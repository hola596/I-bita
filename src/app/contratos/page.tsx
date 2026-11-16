import Link from "next/link";
import { FileCheck2, ArrowRight, ShieldCheck, Download } from "lucide-react";

export const metadata = {
  title: "Contratos Temporarios Art. 1199 CCyC | I-bita Argentina",
  description: "Firma y consulta de contratos digitales de locación temporaria y media estadía.",
};

export default function ContratosIndexPage() {
  const demoBookingId = "00000000-0000-4000-8000-000000000100";
  const demoToken = "00000000-0000-4000-8000-000000000777";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
      <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-8 space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          Marco Legal CCyC Art. 1199 · Sello Criptográfico SHA-256
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Módulo de Contratos Temporarios Digitales
        </h1>
        <p className="text-[var(--text-secondary)] text-base max-w-2xl">
          En estadías de 30 a 180 noches (Media Estadía), I-bita genera automáticamente un contrato de locación temporaria en PDF, sellado en servidor con SHA-256 y firma electrónica de ambas partes.
        </p>

        <div className="pt-4 flex flex-wrap gap-4">
          <Link
            href={`/contratos/${demoBookingId}?token=${demoToken}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white shadow-md hover:bg-[var(--brand-primary-hover)] transition-colors"
          >
            <FileCheck2 className="h-4 w-4" />
            Abrir Contrato Demo (Media Estadía 60 días)
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        <div className="rounded-2xl border border-[var(--border-subtle)] p-6 space-y-2 bg-[var(--bg-elevated)]">
          <h3 className="font-bold text-base">1. Generación Server-Side</h3>
          <p className="text-[var(--text-secondary)]">
            El PDF se construye en servidor con <code>pdf-lib</code> incluyendo cláusulas legales argentinas, partes, canon y finalidad.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] p-6 space-y-2 bg-[var(--bg-elevated)]">
          <h3 className="font-bold text-base">2. Sellado SHA-256</h3>
          <p className="text-[var(--text-secondary)]">
            Se calcula el hash inmutable del documento. Cualquier alteración posterior invalida la integridad criptográfica.
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] p-6 space-y-2 bg-[var(--bg-elevated)]">
          <h3 className="font-bold text-base">3. Almacenamiento Privado</h3>
          <p className="text-[var(--text-secondary)]">
            El archivo se guarda en un bucket privado de Supabase con URL prefirmada descargable solo por huéspedes autorizados o anfitriones.
          </p>
        </div>
      </div>
    </div>
  );
}

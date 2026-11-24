import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ConsumerRequestForm } from "@/components/legal/ConsumerRequestForm";

export const metadata: Metadata = {
  title: "Botón de Baja de Servicio (Ley 24.240 · Disp. 954/2025)",
  description:
    "Solicitá la baja directa de tu cuenta o servicio en I-bita sin barreras ni inicio de sesión obligatorio.",
};

export default function BajaServicioPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 space-y-7">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Ley N° 24.240 (Art. 10 ter) · Disposición 954/2025
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight pt-1">
          Botón de Baja de Cuenta o Servicio
        </h1>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Podés solicitar la rescisión o baja directa de tu cuenta de usuario,
          perfil de anfitrión o publicación en la plataforma tecnológica I-bita,
          obteniendo de inmediato un código de confirmación sin costo alguno.
        </p>
      </header>

      <ConsumerRequestForm mode="BAJA_SERVICIO" />

      <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 sm:p-5 text-xs text-[var(--text-secondary)] space-y-1.5 leading-relaxed">
        <p className="font-extrabold text-[var(--text-primary)]">
          Alcance operativo y conservación legal
        </p>
        <p>
          La baja desactiva nuevas publicaciones y comunicaciones comerciales
          dentro de las 24 horas hábiles. Los contratos ya suscriptos, reservas en
          curso y comprobantes exigidos por normativa tributaria o de auditoría
          (Ley 25.506 / CCCN / ARCA) se conservan únicamente por los plazos
          legales aplicables.
        </p>
      </section>

      <footer className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-3 pt-2">
        <span>
          ¿Necesitás revocar una contratación reciente?{" "}
          <Link href="/legal/arrepentimiento" className="underline font-bold">
            Ir al Botón de Arrepentimiento
          </Link>
        </span>
        <Link href="/legal/privacidad" className="underline font-bold">
          Política de Privacidad y Derechos ARCO
        </Link>
      </footer>
    </article>
  );
}

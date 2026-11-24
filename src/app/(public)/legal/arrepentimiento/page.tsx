import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { ConsumerRequestForm } from "@/components/legal/ConsumerRequestForm";

export const metadata: Metadata = {
  title: "Botón de Arrepentimiento (Ley 24.240 · Disp. 954/2025)",
  description:
    "Solicitá la revocación directa de tu operación sin iniciar sesión y obtené tu código de gestión en el acto.",
};

export default function ArrepentimientoPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8 space-y-7">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Ley N° 24.240 (Art. 34) · Disposición 954/2025
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight pt-1">
          Botón de Arrepentimiento
        </h1>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          Si contrataste un servicio a través de la plataforma tecnológica I-bita,
          podés solicitar la revocación dentro del plazo legal de{" "}
          <strong className="text-[var(--text-primary)]">10 días corridos</strong>{" "}
          sin necesidad de iniciar sesión. Al enviar el formulario recibís tu{" "}
          <strong className="text-[var(--text-primary)]">
            código de gestión en pantalla
          </strong>{" "}
          y confirmación dentro de las 24 horas.
        </p>
      </header>

      <div
        role="note"
        className="rounded-2xl border border-amber-500/45 bg-amber-500/10 p-4 sm:p-5 space-y-2 text-xs sm:text-sm text-[var(--text-primary)]"
      >
        <div className="flex items-center gap-2 font-extrabold text-amber-900 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Aviso sobre excepciones legales vigentes (Art. 1116 CCCN y Ley 24.240)</span>
        </div>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Conforme el Código Civil y Comercial de la Nación y las excepciones de
          Defensa del Consumidor aplicables a prestaciones de alojamiento y
          servicios turísticos con fecha de prestación determinada, las reservas
          de fechas específicas ya confirmadas, con check-in vencido o estadía
          parcial/totalmente consumida pueden encontrarse exceptuadas de la
          revocación sin expresión de causa y se rigen por la política de
          cancelación informada antes de contratar. De todos modos, registraremos
          tu trámite con número de gestión y evaluaremos tu solicitud dentro de
          las 24 hs.
        </p>
      </div>

      <ConsumerRequestForm mode="ARREPENTIMIENTO" />

      <footer className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center justify-between gap-3 pt-2">
        <span>
          ¿Buscás dar de baja tu cuenta? Usá el{" "}
          <Link href="/legal/baja" className="underline font-bold">
            Botón de Baja
          </Link>
          .
        </span>
        <Link href="/legal/terminos" className="underline font-bold">
          Ver Términos y Política de Cancelación
        </Link>
      </footer>
    </article>
  );
}

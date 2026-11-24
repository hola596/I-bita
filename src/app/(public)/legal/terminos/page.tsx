/**
 * ============================================================================
 * AVISO LEGAL DE INGENIERÍA:
 * Este documento constituye un BORRADOR TÉCNICO BASE redactado conforme al
 * marco argentino (CCCN / DNU 70/2023, Ley 24.240, Disp. 954/2025, Ley 25.506,
 * Ley 20.266, Ley 2340 y Ley 6255 CABA). Debe ser revisado y aprobado por un
 * abogado matriculado en la República Argentina antes de operar comercialmente.
 * ============================================================================
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Términos y Condiciones de Uso · Plataforma Tecnológica I-bita",
  description:
    "Condiciones generales de I-bita Argentina: encuadre tecnológico, locación directa entre Anfitrión y Huésped, RPATT CABA, pagos y Botón de Arrepentimiento.",
};

export default function TerminosPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
          Código Civil y Comercial de la Nación · Ley 24.240 · Ley 25.506
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight pt-2">
          Términos y Condiciones Generales de Uso de I-bita
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Vigencia: 24 de noviembre de 2026 — República Argentina
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          1. Encuadre Estricto como Plataforma Tecnológica (No Inmobiliaria)
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          <strong>I-bita</strong> provee exclusivamente una plataforma tecnológica
          de software (SaaS), calendario de disponibilidad, publicación de
          anuncios, herramienta de sellado electrónico de contratos y gestión de
          pases digitales de portería.{" "}
          <strong>
            I-bita no es una inmobiliaria, no actúa como corredor inmobiliario ni
            ejerce intermediación inmobiliaria
          </strong>{" "}
          en los términos de la Ley N° 20.266, la Ley N° 2340 (CABA), la Ley N°
          5859 ni las normas colegiales locales aplicables.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          2. Relación Contractual Directa entre Anfitrión y Huésped
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Todo contrato o acuerdo de locación temporaria o de media estadía (1 a
          180 noches) se celebra <strong>directa y exclusivamente entre el
          Anfitrión (locador) y el Huésped (locatario)</strong> bajo el régimen
          del Código Civil y Comercial de la Nación y el DNU 70/2023. Cada parte
          asume de manera exclusiva la responsabilidad por la veracidad de los
          datos publicados, el estado habitable de la unidad y el cumplimiento de
          las obligaciones contractuales pactadas.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          3. Obligaciones Regulatorias, Consorciales y Fiscales del Anfitrión
        </h2>
        <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
          <li>
            <strong>Registro Turístico Local (RPATT CABA):</strong> cuando el
            inmueble se ubique en la Ciudad Autónoma de Buenos Aires y se ofrezca
            para estadías de 1 noche a 3 meses, el Anfitrión debe contar e
            informar obligatoriamente su{" "}
            <strong>Número de inscripción RPATT - Ley 6255</strong>, asumiendo
            la vigencia de dicha habilitación. I-bita podrá suspender de
            inmediato cualquier publicación ante requerimiento oficial del Ente
            de Turismo o autoridad competente.
          </li>
          <li>
            <strong>Consorcio y Seguro (Declaración Jurada):</strong> al
            completar su alta, el Anfitrión declara bajo juramento que el
            reglamento de copropiedad admite el uso temporario, que cuenta con
            autorización para coordinar ingresos en portería y que posee seguro
            de responsabilidad civil vigente.
          </li>
          <li>
            <strong>Facturación e Impuestos:</strong> el Anfitrión es único
            responsable por emitir las facturas o comprobantes fiscales ARCA
            correspondientes por el alquiler percibido y por el cumplimiento de
            sus obligaciones tributarias nacionales y locales.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          4. Procesamiento de Pagos y Adecuación Regulatoria
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Los pagos en Pesos Argentinos (ARS) se procesan a través de
          proveedores autorizados (Mercado Pago). La disponibilidad de cuotas y
          eventuales costos de financiación se rigen por las condiciones vigentes
          del procesador de pagos y entidad emisora de la tarjeta. Los cobros en
          activos virtuales (USDT) permanecen deshabilitados por defecto hasta su
          adecuación integral a las normas de CNV (PSAV · Ley 27.739) o esquema
          estrictamente no custodial.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          5. Cancelación, Botón de Arrepentimiento y Botón de Baja (Ley 24.240)
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Los usuarios consumidores cuentan con acceso directo y sin necesidad
          de inicio de sesión al{" "}
          <Link href="/legal/arrepentimiento" className="underline font-bold">
            Botón de Arrepentimiento
          </Link>{" "}
          y al{" "}
          <Link href="/legal/baja" className="underline font-bold">
            Botón de Baja
          </Link>{" "}
          conforme la Ley N° 24.240 y la Disposición 954/2025. Se deja constancia
          de que, conforme el artículo 1116 del CCCN y normativa de Defensa del
          Consumidor, las reservas de alojamiento con fecha determinada ya
          confirmadas o ejecutadas pueden hallarse alcanzadas por las
          excepciones legales al derecho de revocación sin causa y se rigen por
          la política de cancelación informada en la publicación.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          6. Evidencia Electrónica (Ley 25.506) y Regla Zero-Trust Consorcial
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          La aceptación electrónica de contratos genera un PDF sellado con{" "}
          <code>SHA-256</code> y registro probatorio inmutable de fecha UTC, IP y
          agente de usuario en los términos de la Ley N° 25.506 y el artículo
          288 del CCCN. Las instrucciones de acceso a la unidad permanecen
          cifradas con <code>AES-256-GCM</code> y solo se habilitan cuando todos
          los adultos declarados completan el Pre-Check-in Digital.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          7. Ley Aplicable y Jurisdicción
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Estos Términos y Condiciones se rigen íntegramente por las leyes de la{" "}
          <strong>República Argentina</strong>. Para cualquier controversia serán
          competentes los Tribunales Ordinarios de la Ciudad Autónoma de Buenos
          Aires, salvo en los casos alcanzados por relaciones de consumo, donde
          regirá la jurisdicción correspondiente al domicilio real del
          consumidor conforme el artículo 36 de la Ley N° 24.240.
        </p>
      </section>
    </article>
  );
}

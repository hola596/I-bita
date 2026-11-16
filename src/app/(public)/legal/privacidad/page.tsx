import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad y Datos Biométricos (Ley 25.326)",
  description:
    "Política de Privacidad, tratamiento de datos biométricos RENAPER/PDF417 y derechos ARCO ante la AAIP de I-bita Argentina.",
};

export default function PrivacidadPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
          Cumplimiento Ley N° 25.326 · AAIP Argentina
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight pt-2">
          Política de Privacidad y Protección de Datos Biométricos
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Última actualización: 16 de noviembre de 2026 — I-bita Argentina
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">1. Marco Normativo y Responsable del Tratamiento</h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          I-bita opera en estricto cumplimiento de la <strong>Ley N° 25.326 de Protección de los Datos Personales</strong> de la República Argentina y las disposiciones de la Agencia de Acceso a la Información Pública (AAIP).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          2. Tratamiento de Datos Biométricos y Módulo &ldquo;Consorcio Friendly&rdquo;
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Para garantizar la seguridad edilicia bajo la regla <strong>Zero-Trust Consorcial</strong>, el Huésped Titular y cada Acompañante Declarado mayor de 18 años otorgan su consentimiento libre, expreso e informado para:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
          <li>
            La lectura de la trama oficial <strong>PDF417</strong> del Documento Nacional de Identidad (DNI argentino) o código MRZ de Pasaporte.
          </li>
          <li>
            La contrastación biométrica facial contra la fotografía del documento mediante canales cifrados en tránsito y en reposo (<code>AES-256</code> en buckets privados con URLs firmadas efímeras).
          </li>
          <li>
            La emisión del <strong>Pase Digital de Portería</strong> firmado criptográficamente (<code>JWS/JWT</code>), el cual exhibe ante la seguridad del edificio únicamente el Nombre, N° de Documento, fotografía verificada, unidad de destino, fechas de estadía y patente vehicular, sin revelar jamas montos ni medios de pago.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">3. Derechos ARCO y Órgano de Control (AAIP)</h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.
        </p>
      </section>
    </article>
  );
}

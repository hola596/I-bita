/**
 * ============================================================================
 * AVISO LEGAL DE INGENIERÍA:
 * Este documento constituye un BORRADOR TÉCNICO BASE adaptado al marco
 * normativo argentino (Ley 25.326, Dec. 1558/2001, Disp. DNPDP 60-E/2016 y
 * resoluciones AAIP). Debe ser revisado y validado por un abogado matriculado
 * en la República Argentina antes del lanzamiento comercial definitivo.
 * ============================================================================
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad y Protección de Datos (Ley 25.326 · AAIP)",
  description:
    "Política de Privacidad, Transferencia Internacional de Datos (Art. 12 Ley 25.326), biometría eKYC y ejercicio de derechos ARCO ante la AAIP en I-bita Argentina.",
};

export default function PrivacidadPage() {
  return (
    <article className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
          Cumplimiento Ley N° 25.326 · AAIP Argentina
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight pt-2">
          Política de Privacidad y Protección de Datos Personales
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Última actualización: 24 de noviembre de 2026 — República Argentina
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          1. Responsable de la Base de Datos y Marco Normativo
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          El tratamiento de datos personales recolectados a través de la
          plataforma tecnológica <strong>I-bita</strong> se rige por la{" "}
          <strong>Ley N° 25.326</strong> de Protección de los Datos Personales,
          su Decreto Reglamentario N° 1558/2001 y las disposiciones de la Agencia
          de Acceso a la Información Pública (AAIP).
        </p>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs sm:text-sm text-[var(--text-secondary)] space-y-1">
          <p>
            <strong>Titular / Responsable de la Base de Datos:</strong>{" "}
            <code>[RAZÓN SOCIAL PENDIENTE DE INSCRIPCIÓN]</code>
          </p>
          <p>
            <strong>CUIT:</strong> <code>[CUIT PENDIENTE]</code>
          </p>
          <p>
            <strong>Domicilio legal:</strong>{" "}
            <code>[DOMICILIO LEGAL EN REPÚBLICA ARGENTINA]</code>
          </p>
          <p>
            <strong>Canal de privacidad y derechos ARCO:</strong>{" "}
            <Link href="/contacto" className="underline font-bold">
              Formulario de contacto / privacidad
            </Link>
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          2. Finalidad del Tratamiento y Datos Biométricos de Control Edilicio
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Tratamos datos identificatorios, fiscales y contractuales para proveer
          la infraestructura tecnológica de publicación, reservas, firma
          electrónica entre partes y control de ingreso en portería. En
          particular, cuando el Huésped Titular o sus Acompañantes adultos
          realizan el Pre-Check-in Digital:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-[var(--text-secondary)]">
          <li>
            Se procesa la lectura local de la trama <strong>PDF417</strong> del
            Documento Nacional de Identidad (DNI argentino) para verificar
            identidad y mayoría de edad (+18 años).
          </li>
          <li>
            Se captura una fotografía del frente del DNI y una selfie en vivo
            con prueba de vida, comparadas en microservicio biométrico privado.
          </li>
          <li>
            <strong>Minimización y borrado automático (TTL):</strong> las
            imágenes crudas capturadas para validación se almacenan en bucket
            privado cifrado y se eliminan automáticamente entre{" "}
            <strong>24 y 72 horas</strong> posteriores a la verificación,
            conservando únicamente el resultado del cotejo y el hash de
            auditoría.
          </li>
          <li>
            El <strong>Pase Digital de Portería</strong> firmado con JWS/JWT
            exhibe ante la seguridad del edificio únicamente Nombre, DNI, foto de
            referencia temporal, unidad de destino, fechas y patente vehicular,
            sin exponer importes ni datos bancarios.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          3. Transferencia Internacional de Datos (Art. 12 Ley N° 25.326)
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Para garantizar disponibilidad, baja latencia y cifrado en la nube, la
          infraestructura tecnológica de I-bita utiliza proveedores cloud cuyos
          servidores se encuentran ubicados fuera de la República Argentina —
          principalmente en <strong>Estados Unidos de América</strong> (como
          Vercel Inc., Supabase Inc., Railway Corp. y servicios de correo
          transaccional). Dichos países podrían no contar con legislación
          considerada de nivel adecuado por la AAIP en los términos de la
          Disposición DNPDP 60-E/2016.
        </p>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          Al registrarse, publicar propiedades, aceptar esta política o marcar el
          consentimiento expreso en el flujo de validación de identidad,{" "}
          <strong>
            el Titular presta su consentimiento expreso e informado (art. 12 inc.
            1 Ley 25.326) para la transferencia internacional de sus datos
          </strong>{" "}
          a los citados proveedores de infraestructura bajo estándares de
          confidencialidad y cifrado en tránsito (TLS) y reposo (AES-256).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          4. Ejercicio de Derechos ARCO (Acceso, Rectificación, Actualización y Supresión)
        </h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          El titular de los datos puede solicitar en todo momento el acceso,
          rectificación, actualización o supresión de sus datos personales a
          través del{" "}
          <Link href="/legal/baja" className="underline font-bold">
            Botón de Baja
          </Link>{" "}
          o mediante{" "}
          <Link href="/contacto" className="underline font-bold">
            nuestro canal de soporte
          </Link>
          . Conforme la Ley N° 25.326, los pedidos de acceso se responderán
          dentro de los <strong>10 días corridos</strong> y las solicitudes de
          rectificación, actualización o supresión dentro de los{" "}
          <strong>5 días hábiles</strong>, sin perjuicio de la conservación de
          evidencia contractual y tributaria por los plazos legales obligatorios.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5">
        <h2 className="text-lg font-bold">
          5. Aviso Legal Obligatorio · Órgano de Control (AAIP)
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          &ldquo;El titular de los datos personales tiene la facultad de ejercer
          el derecho de acceso a los mismos en forma gratuita a intervalos no
          inferiores a seis meses, salvo que se acredite un interés legítimo al
          efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
          N° 25.326. La <strong>AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA</strong>,
          en su carácter de Órgano de Control de la Ley N° 25.326, tiene la
          atribución de atender las denuncias y reclamos que interpongan quienes
          resulten afectados en sus derechos por incumplimiento de las normas
          vigentes en materia de protección de datos personales.&rdquo;
        </p>
      </section>
    </article>
  );
}

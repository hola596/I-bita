import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ShieldCheck,
  Building2,
  Calendar,
  MapPin,
  Lock,
  ExternalLink,
} from "lucide-react";
import {
  resolveDemoOrBookingCheckinStateAction,
  getBookingAccessDetailsAction,
} from "@/modules/consortium/actions";
import { BiometricCheckinFlow } from "@/components/kyc/BiometricCheckinFlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title:
    "Pre-Check-in Biométrico Zero-Trust · Escáner PDF417 DNI (@zxing) & Gemini 2.5 Flash",
  description:
    "Validación biométrica obligatoria de adultos declarados mediante lectura PDF417 del DNI argentino (@zxing) y auditoría multimodal con Google Gemini 2.5 Flash para Consorcios de Propiedad Horizontal.",
};

interface CheckinPageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function BiometricPreCheckinPage({
  params,
  searchParams,
}: CheckinPageProps) {
  const { bookingId } = await params;
  const { token } = await searchParams;

  const stateRes = await resolveDemoOrBookingCheckinStateAction(
    bookingId,
    token ?? null
  );

  if (!stateRes.ok) {
    notFound();
  }

  const checkinState = stateRes.data;
  const { booking, consortium } = checkinState;

  // Para el verificador de acceso usa el token del cupo activo (o el de la URL)
  const accessRes = await getBookingAccessDetailsAction(
    booking.id,
    token ?? checkinState.activeSlot?.inviteToken ?? null
  );
  const access = accessRes.ok ? accessRes.data : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Cabecera de la Reserva y Protocolo Consorcio Friendly */}
      <header className="space-y-4 border-b border-[var(--border-subtle)] pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Épica 3 · Story 3.2 — Pre-Check-in Biométrico PDF417 + Gemini 2.5
            Flash
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-bold">
            <Lock
              className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            Zero-Trust Gate: PIN Bloqueado hasta 100% Adultos Verificados
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              Pre-Check-in Biométrico · {booking.propertyTitle}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[var(--text-secondary)] font-medium">
              <span className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)]">
                <MapPin
                  className="h-4 w-4 text-[var(--brand-primary)]"
                  aria-hidden="true"
                />
                {booking.addressLine} · {booking.unitIdentifier}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                {booking.checkIn} al {booking.checkOut} ({booking.nightsCount}{" "}
                noches)
              </span>
              {consortium?.active && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    {consortium.consortiumName}
                  </span>
                </>
              )}
            </p>
          </div>

          <a
            href={`/p/${booking.propertySlug}`}
            className="inline-flex items-center gap-1.5 self-start md:self-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2 text-xs font-bold hover:bg-[var(--bg-elevated)]"
          >
            <span>Volver a /p/{booking.propertySlug}</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      {/* Flujo Móvil Interactivo de Verificación Biométrica */}
      <BiometricCheckinFlow initialState={checkinState} />

      {/* Compuerta Zero-Trust (Story 3.3): el PIN y el QR solo se renderizan en servidor con 100% verificado */}
      <section
        aria-labelledby="access-gate-heading"
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 space-y-3"
      >
        <h2 id="access-gate-heading" className="text-xl font-extrabold">
          Acceso a la Unidad y Pase de Portería
        </h2>
        {access && access.accessCode ? (
          <div className="space-y-4">
            <p>
              PIN de cerradura:{" "}
              <code className="rounded-lg bg-[var(--bg-primary)] px-3 py-1 text-lg font-black">
                {access.accessCode}
              </code>
            </p>
            {access.porteriaPass && (
              <div className="space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={access.porteriaPass.qrDataUrl}
                  alt="Código QR del Pase Digital de Portería"
                  width={240}
                  height={240}
                  className="rounded-xl bg-white p-2"
                />
                <p className="text-xs break-all">
                  Verificador:{" "}
                  <a className="underline" href={access.porteriaPass.verificationUrl}>
                    abrir pase en portería
                  </a>
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            <Lock className="inline h-4 w-4" aria-hidden="true" /> Bloqueado en el
            servidor hasta que el 100% de los adultos declarados complete su
            verificación. Recargá la página al finalizar.
          </p>
        )}
      </section>
    </div>
  );
}

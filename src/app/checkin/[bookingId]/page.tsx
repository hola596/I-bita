import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, Calendar, Lock, MapPin, ShieldCheck } from "lucide-react";
import {
  resolveDemoOrBookingCheckinStateAction,
  getBookingAccessDetailsAction,
} from "@/modules/consortium/actions";
import { BiometricCheckinFlow } from "@/components/kyc/BiometricCheckinFlow";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { getBookingHostResponseState } from "@/modules/hosts/response-sla";
import { HostResponseWindowCard } from "@/components/host/HostResponseWindowCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirmar identidad para ingresar · I-bita",
  description:
    "Validá tu DNI y tu foto en 3 pasos simples para recibir la clave de ingreso y el pase digital de portería.",
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

  const [accessRes, hostResponseState] = await Promise.all([
    getBookingAccessDetailsAction(
      booking.id,
      token ?? checkinState.activeSlot?.inviteToken ?? null
    ),
    getBookingHostResponseState(booking.id),
  ]);
  const access = accessRes.ok ? accessRes.data : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Cabecera clara y humana */}
      <header className="surface-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Ingreso protegido · Edificio amigable
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
            <Lock
              className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400"
              aria-hidden="true"
            />
            Tus datos quedan resguardados (Ley 25.326)
          </span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <Icon3D name="face" size="lg" />
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Confirmá tu identidad · {booking.propertyTitle}
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
          </div>

          <Link
            href={`/p/${booking.propertySlug}`}
            className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center rounded-xl px-4 text-xs font-extrabold self-start md:self-auto whitespace-nowrap"
          >
            Ver detalle del departamento
          </Link>
        </div>
      </header>

      {/* Asistente paso a paso de confirmación */}
      <BiometricCheckinFlow initialState={checkinState} />

      {/* Ventana sincronizada de respuesta e instrucciones de ingreso del anfitrión */}
      {hostResponseState && (
        <HostResponseWindowCard
          mode="booking-status"
          bookingId={hostResponseState.bookingId}
          hostName={hostResponseState.hostName}
          bookingStatus={hostResponseState.bookingStatus}
          windowSummary={hostResponseState}
        />
      )}

      {/* Entrega segura de la clave de entrada y pase de portería */}
      <section
        aria-labelledby="access-gate-heading"
        className="surface-card p-6 sm:p-8 space-y-4"
      >
        <div className="flex items-center gap-3">
          <Icon3D name="key" size="md" />
          <div>
            <h2 id="access-gate-heading" className="text-xl font-extrabold">
              Tu clave de entrada y pase para portería
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Se habilitan automáticamente en cuanto todos los adultos completan
              su validación.
            </p>
          </div>
        </div>

        {access && access.accessCode ? (
          <div className="space-y-4">
            <AchievementBanner
              icon="trophy"
              tone="emerald"
              title="¡Todo listo! Ya tenés tu ingreso habilitado"
              description="Usá este código en la cerradura al llegar y mostrá el QR si el encargado te lo pide."
            />

            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 space-y-4">
              <p className="text-sm font-bold">
                Código de la puerta:{" "}
                <code className="ml-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] px-4 py-1.5 text-xl font-black tracking-wider">
                  {access.accessCode}
                </code>
              </p>
              {access.porteriaPass && (
                <div className="space-y-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={access.porteriaPass.qrDataUrl}
                    alt="Código QR del Pase Digital de Portería"
                    width={220}
                    height={220}
                    className="rounded-2xl bg-white p-3 border border-[var(--border-subtle)]"
                  />
                  <p className="text-xs">
                    <a
                      className="btn-secondary-3d inline-flex min-h-[40px] items-center rounded-xl px-4 font-extrabold"
                      href={access.porteriaPass.verificationUrl}
                    >
                      Abrir pase digital para portería →
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 flex items-start gap-3 text-xs sm:text-sm text-[var(--text-secondary)]">
            <Lock
              className="h-4 w-4 shrink-0 mt-0.5 text-amber-600"
              aria-hidden="true"
            />
            <p className="leading-relaxed">
              Por tranquilidad del consorcio, la clave de la cerradura permanece
              guardada hasta que{" "}
              <strong>todos los adultos declarados</strong> completen los 3
              pasos de arriba. Cuando terminen, recargá esta página para ver tu
              código.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

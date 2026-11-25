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
import { getContractDetailsAction } from "@/modules/contracts/actions";
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

  const resolvedToken = token ?? checkinState.activeSlot?.inviteToken ?? null;
  const [accessRes, contractRes, hostResponseState] = await Promise.all([
    getBookingAccessDetailsAction(booking.id, resolvedToken),
    getContractDetailsAction(booking.id, resolvedToken),
    getBookingHostResponseState(booking.id),
  ]);
  const access = accessRes.ok ? accessRes.data : null;
  const initialContractSigned = Boolean(
    contractRes.ok && contractRes.data?.guestSignedAt
  );

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

      {/* Asistente paso a paso de confirmación y próximos pasos en vivo */}
      <BiometricCheckinFlow
        initialState={checkinState}
        initialAccess={access}
        initialContractSigned={initialContractSigned}
      />

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
    </div>
  );
}

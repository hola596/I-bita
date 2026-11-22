import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listHostPropertiesAction } from "@/modules/properties/actions";
import {
  getPropertiesOccupiedDateRangesMap,
  listPublicProperties,
} from "@/modules/properties/queries";
import { getArgentinaTodayYmd } from "@/lib/calendar/availability";
import { listHostConsortiumConfigsAction } from "@/modules/consortium/actions";
import {
  listHostBookingConfirmationsAction,
  listHostMidTermApplicationsAction,
} from "@/modules/bookings/host-approval-actions";
import { getHostEarningsSummary } from "@/modules/payments/host-earnings";
import { PropertyDashboardClient } from "@/components/properties/PropertyDashboardClient";
import { Icon3D } from "@/components/ui/Icon3D";

export const metadata: Metadata = {
  title: "Panel de Anfitriones y Edificios · I-bita",
  description:
    "Administrá tus propiedades, sincronizá tu calendario con Airbnb y configurá el ingreso seguro con tu consorcio.",
};

export const dynamic = "force-dynamic";

export default async function HostPropertiesDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <section className="surface-card p-6 sm:p-8 text-center space-y-5">
          <div className="flex justify-center">
            <Icon3D name="building" size="lg" />
          </div>
          <div className="space-y-1.5">
            <span className="badge-consorcio-friendly inline-block rounded-full px-3 py-0.5 text-xs font-extrabold">
              Espacio exclusivo para anfitriones aprobados
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight pt-1">
              Ingresá o registrate como anfitrión para publicar
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Si ya tenés un perfil aprobado de dueño, iniciá sesión. Si recién
              empezás, completá el registro guiado en menos de 2 minutos.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <Link
              href="/login"
              className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 text-sm font-extrabold"
            >
              <span>Ingresar a mi cuenta</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/onboarding/anfitrion"
              className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
            >
              Quiero ser anfitrión
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "role, host_approval_status, host_approval_notes, payout_split_ars_pct"
    )
    .eq("id", user.id)
    .maybeSingle();

  const isApprovedHost =
    profileRow?.role === "SUPERADMIN" ||
    (profileRow?.role === "HOST" &&
      profileRow?.host_approval_status === "APPROVED");

  if (!isApprovedHost) {
    const isPending = profileRow?.host_approval_status === "PENDING_APPROVAL";
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <section className="surface-card p-6 sm:p-8 text-center space-y-5">
          <div className="flex justify-center">
            <Icon3D name={isPending ? "shield" : "building"} size="lg" />
          </div>
          <div className="space-y-2">
            {isPending ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-1 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                En capa de aprobación
              </span>
            ) : (
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)]">
                Requiere aprobación de anfitrión
              </span>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {isPending
                ? "Tu perfil de anfitrión está en revisión"
                : "Primero completá la aprobación de anfitrión"}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {isPending
                ? "Apenas aprobemos tu solicitud vas a poder publicar tus propiedades desde acá."
                : profileRow?.host_approval_notes ||
                  "Para cuidar la seguridad del edificio y de los huéspedes, habilitamos este panel luego de aprobar tus datos de anfitrión."}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-1">
            <Link
              href="/onboarding/anfitrion"
              className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 text-sm font-extrabold"
            >
              <span>
                {isPending
                  ? "Ver estado de mi aprobación"
                  : "Completar registro de anfitrión"}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/perfil"
              className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
            >
              Volver a mi perfil
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const [
    hostRes,
    publicProps,
    consortiumRes,
    midTermAppsRes,
    hostConfirmationsRes,
    hostEarnings,
  ] = await Promise.all([
    listHostPropertiesAction(),
    listPublicProperties(),
    listHostConsortiumConfigsAction(),
    listHostMidTermApplicationsAction(),
    listHostBookingConfirmationsAction(),
    getHostEarningsSummary(user.id),
  ]);

  const initialHostProperties = hostRes.ok ? hostRes.data : [];
  const initialConsortiumConfigs = consortiumRes.ok ? consortiumRes.data : {};
  const initialMidTermApplications = midTermAppsRes.ok
    ? midTermAppsRes.data
    : [];
  const initialBookingConfirmations = hostConfirmationsRes.ok
    ? hostConfirmationsRes.data
    : [];
  const propertyIdsForCalendar = Array.from(
    new Set([
      ...initialHostProperties.map((p) => p.id),
      ...publicProps.map((p) => p.id),
    ])
  );
  const occupiedRangesByProperty =
    await getPropertiesOccupiedDateRangesMap(propertyIdsForCalendar);
  const todayYmd = getArgentinaTodayYmd();
  const payoutSplitArsPct =
    typeof profileRow?.payout_split_ars_pct === "number"
      ? profileRow.payout_split_ars_pct
      : 100;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <header className="surface-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge-consorcio-friendly rounded-full px-3.5 py-1 text-xs font-extrabold">
              ✓ Anfitrión aprobado
            </span>
            <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
              {initialHostProperties.length === 0
                ? "Creá tu primera publicación"
                : `${initialHostProperties.length} ${
                    initialHostProperties.length === 1
                      ? "propiedad registrada"
                      : "propiedades registradas"
                  }`}
            </span>
          </div>

          <Link
            href="/"
            className="btn-secondary-3d inline-flex min-h-[38px] items-center rounded-xl px-3.5 text-xs font-extrabold"
          >
            Volver al inicio
          </Link>
        </div>

        <div className="flex items-start gap-4">
          <Icon3D name="building" size="lg" />
          <div className="space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {initialHostProperties.length === 0
                ? "Creá tu primera publicación"
                : "Publicá una nueva propiedad o administrá las actuales"}
            </h1>
            <p className="max-w-3xl text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Publicá tu alojamiento con un enlace directo para compartir,
              habilitá el aviso por WhatsApp para el encargado del consorcio y
              guardá la clave de la cerradura de forma protegida para tus
              huéspedes verificados.
            </p>
          </div>
        </div>
      </header>

      <PropertyDashboardClient
        initialHostProperties={initialHostProperties}
        initialPublicProperties={publicProps}
        initialConsortiumConfigs={initialConsortiumConfigs}
        initialMidTermApplications={initialMidTermApplications}
        initialBookingConfirmations={initialBookingConfirmations}
        occupiedRangesByProperty={occupiedRangesByProperty}
        todayYmd={todayYmd}
        initialHostEarnings={hostEarnings}
        payoutSplitArsPct={payoutSplitArsPct}
        authenticatedEmail={user.email ?? null}
      />
    </div>
  );
}

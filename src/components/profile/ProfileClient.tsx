"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  ExternalLink,
  Loader2,
  LogOut,
  MessageSquare,
  Moon,
  Pencil,
  Sun,
  Type,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  updateBasicProfileAction,
  type HostApprovalStatus,
} from "@/modules/auth/actions";
import type { HostEarningsSummary } from "@/lib/math/host-earnings";
import type { HostResponseMetrics } from "@/lib/host/response-schedule";
import { CORRIDOR_LABELS } from "@/modules/properties/validators";
import { HostEarningsPanel } from "@/components/host/HostEarningsPanel";
import { HostResponseProfileCard } from "@/components/host/HostResponseProfileCard";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  formatHoldRemainingLabel,
  resolveBookingConfirmationPhase,
} from "@/lib/bookings/partial-hold";

export interface ProfileClientProps {
  user: {
    id: string;
    email: string;
  };
  profile: {
    fullName: string;
    phoneWhatsapp: string | null;
    role: string;
    cuitCuil: string | null;
    payoutCbuCvu: string | null;
    payoutUsdtWallet: string | null;
    payoutSplitArsPct: number;
    hostApprovalStatus: HostApprovalStatus;
    hostApprovalReviewedAt: string | null;
    hostApprovalNotes: string | null;
    createdAt: string | null;
  } | null;
  hostProperties: Array<{
    id: string;
    slug: string;
    title: string;
    corridor: string;
    nightlyRate: number;
    baseCurrency: string;
    isPublished: boolean;
  }>;
  guestBookings: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    nightsCount: number;
    status: string;
    paymentCurrency: string;
    totalAmount: string;
    holdExpiresAt?: string | null;
    hostConfirmedAt?: string | null;
  }>;
  hostEarnings?: HostEarningsSummary | null;
  hostResponseMetrics?: HostResponseMetrics | null;
  canReviewInDev?: boolean;
}

const BOOKING_STATUS_LABELS: Record<
  string,
  { label: string; badgeClass: string }
> = {
  PENDING_HOST_APPROVAL: {
    label: "Esperando entrevista y aprobación",
    badgeClass:
      "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40",
  },
  PENDING_PAYMENT: {
    label: "Pendiente de pago",
    badgeClass:
      "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40",
  },
  PAID_PENDING_KYC: {
    label: "Falta confirmar identidad",
    badgeClass:
      "bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] border border-sky-600/30",
  },
  ALL_ADULTS_VERIFIED: {
    label: "Lista para ingresar",
    badgeClass: "badge-consorcio-friendly",
  },
  CHECKED_IN: {
    label: "En estadía",
    badgeClass: "badge-consorcio-friendly",
  },
  COMPLETED: {
    label: "Finalizada",
    badgeClass:
      "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
  },
  CANCELLED: {
    label: "Cancelada",
    badgeClass: "bg-red-100 text-red-900 border border-red-400/40",
  },
  EXPIRED: {
    label: "Reserva parcial vencida",
    badgeClass: "bg-red-100 text-red-900 border border-red-400/40",
  },
};

function getInitials(fullName: string, email: string): string {
  const clean = fullName.trim();
  if (clean) {
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function maskCbu(raw: string | null): string {
  if (!raw) return "Sin configurar";
  const digits = raw.replace(/\s+/g, "");
  if (digits.length < 6) return "Configurado";
  return `•••• •••• •••• ••${digits.slice(-5)}`;
}

function shortenWallet(raw: string | null): string {
  if (!raw) return "Sin configurar";
  if (raw.length < 14) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

export function ProfileClient({
  user,
  profile,
  hostProperties,
  guestBookings,
  hostEarnings = null,
  hostResponseMetrics = null,
  canReviewInDev = false,
}: ProfileClientProps) {
  const router = useRouter();
  const {
    theme,
    toggleTheme,
    readingSize,
    toggleReadingSize,
    currency,
    setCurrency,
    notify,
  } = usePreferences();

  const initialFullName =
    profile?.fullName?.trim() || user.email.split("@")[0] || "Usuario I-bita";

  const [displayName, setDisplayName] = useState(initialFullName);
  const [displayPhone, setDisplayPhone] = useState(
    profile?.phoneWhatsapp ?? ""
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editStep, setEditStep] = useState<0 | 1>(0);
  const [editFullName, setEditFullName] = useState(initialFullName);
  const [editPhone, setEditPhone] = useState(profile?.phoneWhatsapp ?? "");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: "idle" | "success" | "error";
    text?: string;
  }>({ type: "idle" });
  const [signingOut, setSigningOut] = useState(false);

  const approvalStatus: HostApprovalStatus =
    profile?.hostApprovalStatus ?? "NONE";
  const isApprovedHost =
    profile?.role === "SUPERADMIN" ||
    (profile?.role === "HOST" && approvalStatus === "APPROVED");
  const isPendingHost = approvalStatus === "PENDING_APPROVAL";
  const isRejectedHost = approvalStatus === "REJECTED";
  const isPureGuest = !isApprovedHost && !isPendingHost && !isRejectedHost;

  const hasPublishedProperties = hostProperties.length > 0;
  const hostActionLabel = hasPublishedProperties
    ? "Publicar nueva propiedad"
    : "Crear mi primera publicación";

  const arsPct = profile?.payoutSplitArsPct ?? 70;
  const usdtPct = Math.max(0, 100 - arsPct);
  const initials = getInitials(displayName, user.email);

  async function handleSaveBasicProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage({ type: "idle" });

    const res = await updateBasicProfileAction({
      fullName: editFullName,
      phoneWhatsapp: editPhone,
    });

    setSaving(false);
    if (!res.ok) {
      setSaveMessage({ type: "error", text: res.error.message });
      return;
    }

    setDisplayName(res.data.fullName);
    setDisplayPhone(res.data.phoneWhatsapp ?? "");
    setIsEditing(false);
    setSaveMessage({
      type: "success",
      text: "Guardamos tus datos personales correctamente.",
    });
    notify("¡Perfil actualizado!", "celebration", "check");
    router.refresh();
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    notify("Cerraste sesión correctamente. ¡Hasta pronto!", "info", "user");
    router.push("/");
    router.refresh();
  }

  return (
    <div className="onboarding-grid-bg relative overflow-x-clip py-8 sm:py-10">
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Cabecera diferenciada según rol y estado de aprobación */}
        <header className="surface-card p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-800 text-xl font-black text-white shadow-lg">
              {initials}
              <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[var(--bg-primary)] bg-emerald-400"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-extrabold">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400"
                  />
                  Sesión activa · Estás en tu perfil
                </span>

                {isApprovedHost && (
                  <span className="rounded-full bg-[var(--surface-tint)] border border-[var(--brand-primary)]/30 px-3 py-0.5 text-xs font-extrabold text-[var(--brand-primary)]">
                    Anfitrión aprobado
                  </span>
                )}
                {isPendingHost && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-0.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Solicitud de anfitrión en aprobación
                  </span>
                )}
                {isRejectedHost && (
                  <span className="rounded-full bg-red-100 border border-red-400/50 px-3 py-0.5 text-xs font-extrabold text-red-900">
                    Requiere corrección de anfitrión
                  </span>
                )}
                {isPureGuest && (
                  <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-0.5 text-xs font-extrabold text-[var(--text-primary)]">
                    Huésped I-bita
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] truncate">
                Hola, {displayName}
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] truncate">
                {user.email}
              </p>
            </div>
          </div>

          {/* Botones principales acordes a la experiencia del usuario */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isApprovedHost ? (
              <>
                <Link
                  href="/dashboard/propiedades"
                  className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-xs sm:text-sm font-extrabold whitespace-nowrap"
                >
                  <span>{hostActionLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {hasPublishedProperties && (
                  <Link
                    href="/"
                    className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center rounded-2xl px-4 text-xs sm:text-sm font-extrabold whitespace-nowrap"
                  >
                    Volver al inicio
                  </Link>
                )}
              </>
            ) : isPendingHost ? (
              <Link
                href="/onboarding/anfitrion"
                className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-xs sm:text-sm font-extrabold whitespace-nowrap"
              >
                <span>Ver estado de aprobación</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : isRejectedHost ? (
              <Link
                href="/onboarding/anfitrion?editar=1"
                className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-xs sm:text-sm font-extrabold whitespace-nowrap"
              >
                <span>Corregir solicitud</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                href="/#alojamientos-disponibles"
                className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-xs sm:text-sm font-extrabold whitespace-nowrap"
              >
                <span>Ver hospedajes disponibles</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}

            <Link
              href="/mensajes"
              className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-4 text-xs sm:text-sm font-extrabold whitespace-nowrap"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>Mensajes</span>
            </Link>

            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-4 text-xs sm:text-sm font-extrabold whitespace-nowrap disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>{signingOut ? "Saliendo..." : "Cerrar sesión"}</span>
            </button>
          </div>
        </header>

        {saveMessage.type === "success" && (
          <AchievementBanner
            icon="check"
            tone="emerald"
            title="¡Listo! Tu perfil quedó actualizado"
            description={saveMessage.text ?? "Ya guardamos los cambios."}
          />
        )}

        {isApprovedHost && hostEarnings && (
          <HostEarningsPanel
            earnings={hostEarnings}
            payoutSplitArsPct={arsPct}
            variant="profile"
          />
        )}

        {isApprovedHost && hostResponseMetrics && (
          <HostResponseProfileCard metrics={hostResponseMetrics} />
        )}

        {/* Contenido simétrico en 2 columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Columna Izquierda (7 cols): Datos personales + Reservas */}
          <div className="lg:col-span-7 space-y-6">
            {/* Mis datos personales */}
            <section
              aria-labelledby="personal-info-heading"
              className="surface-card p-6 space-y-5"
            >
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
                <div className="flex items-center gap-3">
                  <Icon3D name="user" size="md" />
                  <div>
                    <h2
                      id="personal-info-heading"
                      className="text-lg font-extrabold"
                    >
                      Tus datos personales
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      La información con la que te identificamos en tus estadías.
                    </p>
                  </div>
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditFullName(displayName);
                      setEditPhone(displayPhone);
                      setEditStep(0);
                      setSaveMessage({ type: "idle" });
                      setIsEditing(true);
                    }}
                    className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Editar datos</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditStep(0);
                    }}
                    className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-1 rounded-xl px-3 text-xs font-extrabold"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Cancelar</span>
                  </button>
                )}
              </div>

              {!isEditing ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                    <dt className="text-xs font-bold text-[var(--text-secondary)]">
                      Nombre o razón social
                    </dt>
                    <dd className="mt-1 font-extrabold text-[var(--text-primary)]">
                      {displayName}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                    <dt className="text-xs font-bold text-[var(--text-secondary)]">
                      WhatsApp de contacto
                    </dt>
                    <dd className="mt-1 font-mono font-bold text-[var(--text-primary)]">
                      {displayPhone || "Todavía no cargado"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
                    <dt className="text-xs font-bold text-[var(--text-secondary)]">
                      Correo de tu cuenta
                    </dt>
                    <dd className="mt-1 font-bold text-[var(--text-primary)] break-all">
                      {user.email}
                    </dd>
                  </div>
                </dl>
              ) : (
                <form
                  onSubmit={(e) => {
                    if (editStep === 0) {
                      e.preventDefault();
                      if (editFullName.trim().length >= 3) setEditStep(1);
                      return;
                    }
                    void handleSaveBasicProfile(e);
                  }}
                  className="animate-ibita-fade-up space-y-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-extrabold text-[var(--text-secondary)]">
                      <span>Paso {editStep + 1} de 2</span>
                      <span>
                        {editStep === 0 ? "Tu nombre visible" : "Tu WhatsApp"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          editStep > 0
                            ? "bg-emerald-600"
                            : "bg-[var(--brand-primary)]"
                        }`}
                      />
                      <div
                        className={`h-1.5 rounded-full ${
                          editStep === 1
                            ? "bg-[var(--brand-primary)]"
                            : "bg-[var(--border-subtle)]"
                        }`}
                      />
                    </div>
                  </div>

                  {editStep === 0 ? (
                    <div key="edit-step-0" className="animate-ibita-slide-next space-y-2">
                      <label
                        htmlFor="profile-fullname"
                        className="block text-xs font-extrabold"
                      >
                        Nombre completo o razón social *
                      </label>
                      <input
                        id="profile-fullname"
                        type="text"
                        required
                        minLength={3}
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        className="min-h-[48px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 text-sm font-semibold"
                      />
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={editFullName.trim().length < 3}
                          onClick={() => setEditStep(1)}
                          className="btn-primary-3d inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-5 text-xs sm:text-sm font-extrabold disabled:opacity-45"
                        >
                          <span>Siguiente</span>
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key="edit-step-1" className="animate-ibita-slide-next space-y-3">
                      <div>
                        <label
                          htmlFor="profile-whatsapp"
                          className="block text-xs font-extrabold mb-1.5"
                        >
                          WhatsApp de contacto (opcional)
                        </label>
                        <input
                          id="profile-whatsapp"
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="+5491123456789"
                          className="min-h-[48px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 text-sm font-mono font-semibold"
                        />
                      </div>

                      {saveMessage.type === "error" && (
                        <p
                          role="alert"
                          className="rounded-xl bg-red-100 text-red-900 px-3.5 py-2.5 text-xs font-bold"
                        >
                          {saveMessage.text}
                        </p>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditStep(0)}
                          disabled={saving}
                          className="btn-secondary-3d inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Atrás</span>
                        </button>

                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-5 text-xs sm:text-sm font-extrabold disabled:opacity-50"
                        >
                          {saving ? (
                            <>
                              <Loader2
                                className="h-4 w-4 animate-spin"
                                aria-hidden="true"
                              />
                              <span>Guardando...</span>
                            </>
                          ) : (
                            <span>Guardar mis datos</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </section>

            {/* Mis reservas y viajes */}
            <section
              aria-labelledby="my-bookings-heading"
              className="surface-card p-6 space-y-5"
            >
              <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
                <Icon3D name="calendar" size="md" />
                <div>
                  <h2
                    id="my-bookings-heading"
                    className="text-lg font-extrabold"
                  >
                    Tus reservas y viajes
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Seguí el estado de tus estadías, pagos o validaciones desde acá.
                  </p>
                </div>
              </div>

              {guestBookings.length === 0 ? (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-[var(--text-primary)]">
                      Todavía no agendaste un hospedaje
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Explorá los alojamientos disponibles y elegí tus fechas.
                    </p>
                  </div>
                  <Link
                    href="/#alojamientos-disponibles"
                    className="btn-secondary-3d inline-flex min-h-[42px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold whitespace-nowrap"
                  >
                    <span>Ver hospedajes</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {guestBookings.map((booking) => {
                    const phase = resolveBookingConfirmationPhase({
                      status: booking.status,
                      holdExpiresAt: booking.holdExpiresAt,
                      hostConfirmedAt: booking.hostConfirmedAt,
                    });
                    const holdClock =
                      phase === "PARTIAL_HOLD" && booking.holdExpiresAt
                        ? formatHoldRemainingLabel(booking.holdExpiresAt)
                            .expiresAtClockEsAr
                        : null;

                    const statusInfo =
                      phase === "EXPIRED"
                        ? BOOKING_STATUS_LABELS.EXPIRED!
                        : phase === "PARTIAL_HOLD"
                          ? {
                              label: holdClock
                                ? `Reserva parcial (1 h) · vence ${holdClock} hs`
                                : "Reserva parcial (1 h)",
                              badgeClass:
                                "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40",
                            }
                          : phase === "PAID_AWAITING_HOST"
                            ? {
                                label: "Pago OK · Falta anfitrión",
                                badgeClass:
                                  "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40",
                              }
                            : phase === "CONFIRMED" &&
                                booking.status !== "CHECKED_IN" &&
                                booking.status !== "COMPLETED"
                              ? {
                                  label: "Reserva confirmada ✓",
                                  badgeClass: "badge-consorcio-friendly",
                                }
                              : BOOKING_STATUS_LABELS[booking.status] ?? {
                                  label: booking.status,
                                  badgeClass:
                                    "bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]",
                                };
                    const formattedTotal = Number.isFinite(
                      Number(booking.totalAmount)
                    )
                      ? Number(booking.totalAmount).toLocaleString("es-AR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : booking.totalAmount;

                    const actionHref =
                      booking.status === "PENDING_PAYMENT" ||
                      booking.status === "PENDING_HOST_APPROVAL"
                        ? `/checkout/${booking.id}`
                        : `/checkin/${booking.id}`;
                    const actionLabel =
                      booking.status === "PENDING_PAYMENT"
                        ? "Ir a pagar"
                        : booking.status === "PENDING_HOST_APPROVAL"
                          ? "Ver estado de solicitud"
                          : "Ver ingreso y QR";

                    return (
                      <li
                        key={booking.id}
                        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${statusInfo.badgeClass}`}
                            >
                              {statusInfo.label}
                            </span>
                            <span className="text-xs font-bold text-[var(--text-secondary)]">
                              {booking.nightsCount} noches
                            </span>
                          </div>
                          <p className="text-sm font-extrabold text-[var(--text-primary)]">
                            Del {booking.checkIn} al {booking.checkOut}
                          </p>
                          <p className="text-xs font-semibold text-[var(--text-secondary)]">
                            Total: {formattedTotal} {booking.paymentCurrency}
                          </p>
                        </div>

                        {phase === "CANCELLED" || phase === "EXPIRED" ? (
                          <span className="text-xs font-bold text-[var(--text-secondary)]">
                            {phase === "EXPIRED"
                              ? "Reserva parcial vencida · fechas liberadas"
                              : "Solicitud cancelada"}
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {booking.status === "PENDING_HOST_APPROVAL" && (
                              <Link
                                href={`/mensajes?booking=${booking.id}`}
                                className="btn-secondary-3d inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold whitespace-nowrap"
                              >
                                <MessageSquare
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Abrir chat</span>
                              </Link>
                            )}
                            <Link
                              href={actionHref}
                              className="btn-secondary-3d inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold whitespace-nowrap"
                            >
                              <span>{actionLabel}</span>
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* Columna Derecha (5 cols): Separación clara entre Huésped y Anfitrión */}
          <div className="lg:col-span-5 space-y-6">
            {/* Comodidad visual — siempre útil para el usuario */}
            <section
              aria-labelledby="comfort-settings-heading"
              className="surface-card p-6 space-y-4"
            >
              <div className="flex items-center gap-3">
                <Icon3D name="sparkle" size="md" />
                <div>
                  <h2
                    id="comfort-settings-heading"
                    className="text-base font-extrabold"
                  >
                    Comodidad de tu pantalla
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Se guarda automáticamente en este dispositivo.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="btn-secondary-3d flex min-h-[46px] items-center justify-between rounded-xl px-4 text-xs font-extrabold"
                >
                  <span>Apariencia de pantalla</span>
                  <span className="inline-flex items-center gap-1.5">
                    {theme === "dark" ? (
                      <>
                        <Moon
                          className="h-3.5 w-3.5 text-indigo-400"
                          aria-hidden="true"
                        />
                        <span>Modo oscuro</span>
                      </>
                    ) : (
                      <>
                        <Sun
                          className="h-3.5 w-3.5 text-amber-500"
                          aria-hidden="true"
                        />
                        <span>Modo claro</span>
                      </>
                    )}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleReadingSize}
                  className="btn-secondary-3d flex min-h-[46px] items-center justify-between rounded-xl px-4 text-xs font-extrabold"
                >
                  <span>Tamaño de lectura</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Type className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {readingSize === "comfortable"
                        ? "Texto grande ✓"
                        : "Estándar"}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setCurrency(currency === "ARS" ? "USDT" : "ARS")
                  }
                  className="btn-secondary-3d flex min-h-[46px] items-center justify-between rounded-xl px-4 text-xs font-extrabold"
                >
                  <span>Moneda preferida</span>
                  <span>{currency === "ARS" ? "Pesos (ARS $)" : "USDT ₮"}</span>
                </button>
              </div>
            </section>

            {/* Experiencia Anfitrión Aprobado */}
            {isApprovedHost && (
              <section
                aria-labelledby="host-summary-heading"
                className="surface-card p-6 space-y-5"
              >
                <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-4">
                  <Icon3D name="building" size="md" />
                  <div>
                    <h2
                      id="host-summary-heading"
                      className="text-lg font-extrabold"
                    >
                      Tu espacio de anfitrión
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Propiedades activas y configuración de cobros aprobada.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-3">
                  <div className="flex justify-between text-xs font-extrabold">
                    <span className="text-[var(--brand-primary)]">
                      {arsPct}% en Pesos (ARS)
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {usdtPct}% en USDT
                    </span>
                  </div>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-primary)]">
                    <div
                      className="h-full bg-[var(--brand-primary)]"
                      style={{ width: `${arsPct}%` }}
                    />
                    <div
                      className="h-full bg-emerald-600"
                      style={{ width: `${usdtPct}%` }}
                    />
                  </div>

                  <dl className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)] text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-secondary)]">CBU / CVU:</dt>
                      <dd className="font-mono font-bold">
                        {maskCbu(profile?.payoutCbuCvu ?? null)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--text-secondary)]">
                        Billetera USDT:
                      </dt>
                      <dd className="font-mono font-bold">
                        {shortenWallet(profile?.payoutUsdtWallet ?? null)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {hostProperties.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-extrabold text-[var(--text-secondary)]">
                      Tus propiedades ({hostProperties.length}):
                    </p>
                    <ul className="space-y-2">
                      {hostProperties.slice(0, 4).map((prop) => (
                        <li
                          key={prop.id}
                          className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold truncate">
                              {prop.title}
                            </p>
                            <p className="text-[11px] text-[var(--text-secondary)] truncate">
                              {(CORRIDOR_LABELS as Record<string, string>)[
                                prop.corridor
                              ] ?? prop.corridor}{" "}
                              · {prop.isPublished ? "Publicada" : "Borrador"}
                            </p>
                          </div>
                          <Link
                            href={`/p/${prop.slug}`}
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-extrabold text-[var(--brand-primary)] hover:underline"
                          >
                            <span>Ver</span>
                            <ExternalLink
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <Link
                    href="/dashboard/propiedades"
                    className="btn-primary-3d inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-extrabold"
                  >
                    <span>{hostActionLabel}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Link
                      href="/onboarding/anfitrion?editar=1"
                      className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center rounded-xl px-3 text-xs font-extrabold"
                    >
                      Editar datos de cobro
                    </Link>
                    <Link
                      href="/"
                      className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center rounded-xl px-3 text-xs font-extrabold"
                    >
                      Volver al inicio
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* Estado Pendiente de Aprobación */}
            {isPendingHost && (
              <section
                aria-labelledby="host-pending-heading"
                className="surface-card p-6 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <Icon3D name="shield" size="md" />
                  <div>
                    <h2
                      id="host-pending-heading"
                      className="text-base font-extrabold"
                    >
                      Solicitud de anfitrión en aprobación
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      Estamos revisando tus datos para habilitar las
                      publicaciones.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/onboarding/anfitrion"
                    className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center rounded-xl px-4 text-xs font-extrabold"
                  >
                    Ver detalle de la solicitud
                  </Link>
                  {canReviewInDev && (
                    <Link
                      href="/admin/aprobaciones"
                      className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      Panel de aprobación
                    </Link>
                  )}
                </div>
              </section>
            )}

            {/* Estado Rechazado / Corrección requerida */}
            {isRejectedHost && (
              <section
                aria-labelledby="host-rejected-heading"
                className="surface-card p-6 space-y-4"
              >
                <h2
                  id="host-rejected-heading"
                  className="text-base font-extrabold text-red-800 dark:text-red-300"
                >
                  Tu solicitud necesita una corrección
                </h2>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {profile?.hostApprovalNotes ||
                    "Revisá tu CUIT, CBU/CVU o billetera USDT y volvé a enviarla."}
                </p>
                <Link
                  href="/onboarding/anfitrion?editar=1"
                  className="btn-primary-3d inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-xs font-extrabold"
                >
                  Corregir datos y volver a enviar
                </Link>
              </section>
            )}

            {/* Opción discreta y sin protagonismo en la experiencia exclusiva de Huésped */}
            {isPureGuest && (
              <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-secondary)]/55 p-4 flex items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-secondary)]">
                  ¿Tenés un departamento propio?
                </p>
                <Link
                  href="/onboarding/anfitrion"
                  className="inline-flex shrink-0 items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)]/70 px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors whitespace-nowrap"
                >
                  Convertirme en un anfitrión
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

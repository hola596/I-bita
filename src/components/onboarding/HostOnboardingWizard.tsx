"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { isAddress } from "viem";
import {
  completeHostOnboardingAction,
  type HostApprovalStatus,
} from "@/modules/auth/actions";
import { reviewHostApplicationAction } from "@/modules/auth/approval-actions";
import {
  isValidArgentineCuit,
  isValidCbuOrCvu,
} from "@/modules/auth/validators";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useMultiStepOnboarding } from "@/hooks/useMultiStepOnboarding";
import { Icon3D, type Icon3DName } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";
import { ProgressiveFlowShell } from "@/components/ui/ProgressiveFlowShell";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  formatResponseScheduleSummary,
  normalizeHostResponseSchedule,
  type MaxResponseHours,
  type WeekdayCode,
} from "@/lib/host/response-schedule";
import {
  HostResponseScheduleEditor,
  type HostResponseScheduleFormValue,
} from "@/components/host/HostResponseScheduleEditor";

export interface HostOnboardingInitialUser {
  id: string;
  email: string | null;
}

export interface HostOnboardingInitialProfile {
  fullName?: string;
  phoneWhatsapp?: string;
  cuitCuil?: string;
  payoutCbuCvu?: string;
  payoutUsdtWallet?: string;
  payoutSplitArsPct?: number;
  responseSchedule?: unknown;
  role?: string;
}

interface HostOnboardingWizardProps {
  initialUser: HostOnboardingInitialUser | null;
  initialProfile: HostOnboardingInitialProfile | null;
  initialApprovalStatus?: HostApprovalStatus;
  initialApprovalNotes?: string | null;
  existingPropertiesCount?: number;
  startInEditMode?: boolean;
  canApproveLocally?: boolean;
}

const DRAFT_STORAGE_KEY = "ibita_host_onboarding_draft_v1";

interface StepDefinition {
  id: string;
  shortTitle: string;
  title: string;
  subtitle: string;
  icon: Icon3DName;
}

const ONBOARDING_STEPS: ReadonlyArray<StepDefinition> = [
  {
    id: "name",
    shortTitle: "Tu nombre",
    title: "Configurá tu perfil de anfitrión",
    subtitle: "Empecemos por cómo querés presentarte ante los huéspedes.",
    icon: "user",
  },
  {
    id: "whatsapp",
    shortTitle: "Respaldo",
    title: "Teléfono de respaldo verificado",
    subtitle:
      "Solo para seguridad y validación de tu cuenta. Toda la comunicación con huéspedes y soporte sucede dentro de I-bita.",
    icon: "shield",
  },
  {
    id: "fiscal",
    shortTitle: "Respaldo fiscal",
    title: "Sumá tu respaldo fiscal simple",
    subtitle:
      "Solo te pedimos tu CUIT o CUIL para los contratos digitales a tu nombre.",
    icon: "contract",
  },
  {
    id: "payout",
    shortTitle: "Cómo cobrás",
    title: "Elegí cómo querés recibir tus cobros",
    subtitle:
      "Cobrá en pesos argentinos, en USDT o combinando ambos porcentajes.",
    icon: "coin",
  },
  {
    id: "response_schedule",
    shortTitle: "Horario de respuesta",
    title: "Confirmá tus días y horario de respuesta",
    subtitle:
      "Paso obligatorio: todo huésped recibirá automáticamente esta ventana al reservar y tu tasa de respuesta se sincronizará con estos horarios.",
    icon: "chat",
  },
  {
    id: "review",
    shortTitle: "Revisar y enviar",
    title: "Todo listo para enviar tu perfil",
    subtitle: "Revisá tus datos y envialos a nuestra capa de aprobación.",
    icon: "trophy",
  },
];

const HOST_ONBOARDING_STEP_IMAGES: ReadonlyArray<{
  url: string;
  alt: string;
  badge: string;
}> = [
  {
    url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Living comedor luminoso listo para recibir huéspedes",
    badge: "Paso 1 · Perfil verificado de anfitrión",
  },
  {
    url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Departamento cuidado y luminoso",
    badge: "Paso 2 · Comunicación directa y sin vueltas",
  },
  {
    url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Espacio preparado para estadías cortas y largas",
    badge: "Paso 3 · Contratos claros bajo ley argentina",
  },
  {
    url: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Cocina integrada moderna en departamento equipado",
    badge: "Paso 4 · Cobrás en Pesos y/o USDT",
  },
  {
    url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Alojamiento listo para coordinar confirmaciones rápidas",
    badge: "Paso 5 · Ventana obligatoria de respuesta",
  },
  {
    url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Detalles de categoría en alojamiento urbano",
    badge: "Paso 6 · Capa de aprobación de anfitriones",
  },
];

function normalizeWhatsapp(raw: string): string {
  return raw.replace(/[\s().-]/g, "").trim();
}

function formatCuitDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

export function HostOnboardingWizard({
  initialUser,
  initialProfile,
  initialApprovalStatus = "NONE",
  initialApprovalNotes = null,
  existingPropertiesCount = 0,
  startInEditMode = false,
  canApproveLocally = false,
}: HostOnboardingWizardProps) {
  const router = useRouter();
  const { notify } = usePreferences();
  const {
    currentStepIndex,
    direction,
    totalSteps,
    progressPct,
    nextStep,
    previousStep,
    goTo,
  } = useMultiStepOnboarding(ONBOARDING_STEPS.length, 0);

  const [approvalStatus, setApprovalStatus] = useState<HostApprovalStatus>(
    initialApprovalStatus
  );
  const [approvalNotes, setApprovalNotes] = useState<string | null>(
    initialApprovalNotes
  );
  const [propertiesCount, setPropertiesCount] = useState<number>(
    existingPropertiesCount
  );
  const [inEditMode, setInEditMode] = useState<boolean>(
    startInEditMode || initialApprovalStatus === "NONE"
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    initialUser?.id ?? null
  );
  const [authEmail, setAuthEmail] = useState<string | null>(
    initialUser?.email ?? null
  );
  const [reviewLoading, setReviewLoading] = useState(false);

  const [fullName, setFullName] = useState(initialProfile?.fullName ?? "");
  const [phoneWhatsapp, setPhoneWhatsapp] = useState(
    initialProfile?.phoneWhatsapp ?? ""
  );
  const [cuitCuil, setCuitCuil] = useState(
    initialProfile?.cuitCuil ? formatCuitDisplay(initialProfile.cuitCuil) : ""
  );
  const [payoutSplitArsPct, setPayoutSplitArsPct] = useState<number>(
    initialProfile?.payoutSplitArsPct ?? 70
  );
  const [payoutMode, setPayoutMode] = useState<
    "balanced" | "ars_only" | "custom"
  >(
    initialProfile?.payoutSplitArsPct === 100
      ? "ars_only"
      : initialProfile?.payoutSplitArsPct === undefined ||
          initialProfile.payoutSplitArsPct === 70
        ? "balanced"
        : "custom"
  );
  const [payoutCbuCvu, setPayoutCbuCvu] = useState(
    initialProfile?.payoutCbuCvu ?? ""
  );
  const [payoutUsdtWallet, setPayoutUsdtWallet] = useState(
    initialProfile?.payoutUsdtWallet ?? ""
  );
  const initialNormalizedSchedule = normalizeHostResponseSchedule(
    initialProfile?.responseSchedule
  );
  const [responseScheduleValue, setResponseScheduleValue] =
    useState<HostResponseScheduleFormValue>({
      days: initialNormalizedSchedule.schedule.days,
      startHour: initialNormalizedSchedule.schedule.startHour,
      endHour: initialNormalizedSchedule.schedule.endHour,
      maxResponseHours: initialNormalizedSchedule.schedule.maxResponseHours,
      confirmedCommitment: Boolean(
        initialNormalizedSchedule.isConfigured &&
          initialNormalizedSchedule.schedule.confirmedAt
      ),
    });

  const [inlineAuthMode, setInlineAuthMode] = useState<"signup" | "signin">(
    "signup"
  );
  const [inlineEmail, setInlineEmail] = useState("");
  const [inlinePassword, setInlinePassword] = useState("");

  const [status, setStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
    checksumWallet?: string;
  }>({ type: "idle" });

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<{
        fullName: string;
        phoneWhatsapp: string;
        cuitCuil: string;
        payoutSplitArsPct: number;
        responseSchedule: {
          days?: WeekdayCode[];
          startHour?: number;
          endHour?: number;
          maxResponseHours?: MaxResponseHours;
        };
      }>;
      if (!initialProfile?.fullName && parsed.fullName) {
        setFullName(parsed.fullName);
      }
      if (!initialProfile?.phoneWhatsapp && parsed.phoneWhatsapp) {
        setPhoneWhatsapp(parsed.phoneWhatsapp);
      }
      if (!initialProfile?.cuitCuil && parsed.cuitCuil) {
        setCuitCuil(formatCuitDisplay(parsed.cuitCuil));
      }
      if (
        initialProfile?.payoutSplitArsPct === undefined &&
        typeof parsed.payoutSplitArsPct === "number"
      ) {
        setPayoutSplitArsPct(parsed.payoutSplitArsPct);
        setPayoutMode(
          parsed.payoutSplitArsPct === 100
            ? "ars_only"
            : parsed.payoutSplitArsPct === 70
              ? "balanced"
              : "custom"
        );
      }
      if (!initialProfile?.responseSchedule && parsed.responseSchedule) {
        const normalizedDraft = normalizeHostResponseSchedule(
          parsed.responseSchedule
        );
        if (normalizedDraft.isConfigured) {
          setResponseScheduleValue((prev) => ({
            days: normalizedDraft.schedule.days,
            startHour: normalizedDraft.schedule.startHour,
            endHour: normalizedDraft.schedule.endHour,
            maxResponseHours: normalizedDraft.schedule.maxResponseHours,
            confirmedCommitment: prev.confirmedCommitment,
          }));
        }
      }
    } catch {
      // Ignorar errores de sessionStorage
    }
  }, [initialProfile]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          fullName,
          phoneWhatsapp,
          cuitCuil,
          payoutSplitArsPct,
          responseSchedule: {
            days: responseScheduleValue.days,
            startHour: responseScheduleValue.startHour,
            endHour: responseScheduleValue.endHour,
            maxResponseHours: responseScheduleValue.maxResponseHours,
          },
        })
      );
    } catch {
      // Ignorar si está deshabilitado
    }
  }, [
    fullName,
    phoneWhatsapp,
    cuitCuil,
    payoutSplitArsPct,
    responseScheduleValue.days,
    responseScheduleValue.startHour,
    responseScheduleValue.endHour,
    responseScheduleValue.maxResponseHours,
  ]);

  const normalizedPhone = normalizeWhatsapp(phoneWhatsapp);
  const isFullNameValid =
    fullName.trim().length >= 3 && fullName.trim().length <= 120;
  const isPhoneValid = /^\+?[0-9]{10,15}$/.test(normalizedPhone);
  const step1Valid = isFullNameValid && isPhoneValid;

  const cuitDigitsCount = cuitCuil.replace(/\D/g, "").length;
  const isCuitValid = isValidArgentineCuit(cuitCuil);
  const step2Valid = isCuitValid;

  const cleanCbu = payoutCbuCvu.replace(/\s+/g, "");
  const isCbuValid = isValidCbuOrCvu(cleanCbu);
  const isWalletValid = isAddress(payoutUsdtWallet.trim(), { strict: false });
  const step3Valid = isCbuValid && isWalletValid;
  const isResponseScheduleValid =
    responseScheduleValue.days.length >= 1 &&
    responseScheduleValue.endHour - responseScheduleValue.startHour >= 2 &&
    responseScheduleValue.confirmedCommitment === true;

  const scheduleSummaryText = formatResponseScheduleSummary({
    days: responseScheduleValue.days,
    startHour: responseScheduleValue.startHour,
    endHour: responseScheduleValue.endHour,
    maxResponseHours: responseScheduleValue.maxResponseHours,
    timezone: "America/Argentina/Buenos_Aires",
    confirmedAt: null,
  });

  const stepValidFlags = [
    isFullNameValid,
    isPhoneValid,
    step2Valid,
    step3Valid,
    isResponseScheduleValid,
    isFullNameValid &&
      isPhoneValid &&
      step2Valid &&
      step3Valid &&
      isResponseScheduleValid,
  ];

  const handleSelectPayoutStrategy = (
    mode: "balanced" | "ars_only" | "custom",
    pct: number
  ) => {
    setPayoutMode(mode);
    setPayoutSplitArsPct(pct);
    notify(
      mode === "ars_only"
        ? "Configuramos 100% de tus cobros en Pesos Argentinos."
        : mode === "balanced"
          ? "Elegiste el reparto equilibrado: 70% Pesos y 30% USDT."
          : "Podés ajustar el porcentaje exacto con el deslizador.",
      "info",
      "coin"
    );
  };

  const handleStepNext = (completedStepIndex: number) => {
    if (completedStepIndex === 0 && isFullNameValid) {
      notify("¡Genial! Ya guardamos tu nombre.", "success", "user");
      nextStep();
      return;
    }
    if (completedStepIndex === 1 && isPhoneValid) {
      notify("¡Listo! Guardamos tu teléfono de respaldo.", "success", "shield");
      nextStep();
      return;
    }
    if (completedStepIndex === 2 && step2Valid) {
      notify(
        "¡CUIT verificado! Avanzamos a tu forma de cobro.",
        "success",
        "contract"
      );
      nextStep();
      return;
    }
    if (completedStepIndex === 3 && step3Valid) {
      notify(
        "¡Cuentas listas! Ahora confirmá tus horarios de respuesta.",
        "success",
        "coin"
      );
      nextStep();
      return;
    }
    if (completedStepIndex === 4 && isResponseScheduleValid) {
      notify(
        "¡Horario de respuesta confirmado! Revisá tu resumen antes de enviarlo.",
        "success",
        "check"
      );
      nextStep();
    }
  };

  async function handleSubmitToApproval(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ type: "loading" });

    let resolvedUserId = currentUserId;

    if (!authEmail) {
      const trimmedEmail = inlineEmail.trim();
      if (!trimmedEmail || inlinePassword.length < 8) {
        setStatus({
          type: "error",
          message:
            "Ingresá tu correo y una contraseña de al menos 8 caracteres para guardar tu solicitud.",
        });
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const redirectOrigin =
        typeof window !== "undefined" ? window.location.origin : "";

      if (inlineAuthMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: inlinePassword,
          options: {
            emailRedirectTo: `${redirectOrigin}/auth/callback?next=/onboarding/anfitrion`,
          },
        });
        if (error) {
          setStatus({ type: "error", message: error.message });
          return;
        }
        if (!data.session) {
          setStatus({
            type: "error",
            message:
              "Te enviamos un correo para confirmar tu cuenta. Confirmalo y volvé a presionar el botón, o cambiá a 'Ya tengo cuenta'.",
          });
          return;
        }
        setAuthEmail(data.user?.email ?? trimmedEmail);
        resolvedUserId = data.user?.id ?? null;
        setCurrentUserId(resolvedUserId);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: inlinePassword,
        });
        if (error) {
          setStatus({ type: "error", message: error.message });
          return;
        }
        setAuthEmail(data.user?.email ?? trimmedEmail);
        resolvedUserId = data.user?.id ?? null;
        setCurrentUserId(resolvedUserId);
      }
    }

    const res = await completeHostOnboardingAction({
      fullName: fullName.trim(),
      phoneWhatsapp: normalizedPhone,
      cuitCuil: cuitCuil.trim(),
      payoutCbuCvu: cleanCbu,
      payoutUsdtWallet: payoutUsdtWallet.trim(),
      payoutSplitArsPct: Number(payoutSplitArsPct),
      responseSchedule: {
        days: responseScheduleValue.days,
        startHour: responseScheduleValue.startHour,
        endHour: responseScheduleValue.endHour,
        maxResponseHours: responseScheduleValue.maxResponseHours,
        confirmedCommitment: true,
      },
    });

    if (res.ok) {
      try {
        window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Sin acción
      }
      setCurrentUserId(res.data.userId);
      setPropertiesCount(res.data.existingPropertiesCount);
      setApprovalStatus("PENDING_APPROVAL");
      setApprovalNotes(null);
      setInEditMode(false);
      setStatus({
        type: "success",
        message: `Recibimos tu solicitud de anfitrión con billetera verificada (${res.data.checksumWallet}).`,
        checksumWallet: res.data.checksumWallet,
      });
      notify(
        "¡Listo! Enviamos tus datos a la capa de aprobación.",
        "celebration",
        "shield"
      );
      router.refresh();
    } else {
      setStatus({
        type: "error",
        message: res.error.message,
      });
    }
  }

  async function handleSimulateLocalApproval() {
    if (!currentUserId) return;
    setReviewLoading(true);
    const res = await reviewHostApplicationAction({
      profileId: currentUserId,
      decision: "APPROVED",
    });
    setReviewLoading(false);

    if (!res.ok) {
      setStatus({ type: "error", message: res.error.message });
      return;
    }

    setApprovalStatus("APPROVED");
    setPropertiesCount(res.data.existingPropertiesCount);
    setInEditMode(false);
    notify(
      "¡Tu perfil de anfitrión fue aprobado!",
      "celebration",
      "trophy"
    );
    router.refresh();
  }

  const usdtSplitPct = Math.max(0, 100 - payoutSplitArsPct);

  const hasPublishedBefore = propertiesCount > 0;
  const approvedPrimaryLabel = hasPublishedBefore
    ? "Publicar nueva propiedad"
    : "Crear mi primera publicación";

  const activeStepDef =
    ONBOARDING_STEPS[currentStepIndex] ?? ONBOARDING_STEPS[0]!;
  const activeStepMedia =
    HOST_ONBOARDING_STEP_IMAGES[currentStepIndex] ??
    HOST_ONBOARDING_STEP_IMAGES[0]!;
  const isFinalReviewStep = currentStepIndex === totalSteps - 1;
  const canAdvanceCurrentStep = Boolean(stepValidFlags[currentStepIndex]);

  return (
    <div className="onboarding-grid-bg relative overflow-x-clip py-8 sm:py-12">
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Cabecera superior */}
        <header className="surface-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Icon3D name="building" size="md" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge-consorcio-friendly rounded-full px-3 py-0.5 text-[11px] font-extrabold">
                    Registro de anfitrión · con aprobación de perfil
                  </span>
                  {authEmail && (
                    <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                      Sesión: {authEmail}
                    </span>
                  )}
                </div>
                <h1 className="mt-1 text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Convertite en anfitrión y publicá con respaldo
                </h1>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-extrabold text-[var(--brand-primary)]">
                {!inEditMode && approvalStatus === "APPROVED"
                  ? "Perfil aprobado ✓"
                  : !inEditMode && approvalStatus === "PENDING_APPROVAL"
                    ? "En capa de aprobación"
                    : `Paso ${currentStepIndex + 1} de ${totalSteps}`}
              </span>
              <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                {!inEditMode && approvalStatus === "APPROVED"
                  ? "100% habilitado"
                  : !inEditMode && approvalStatus === "PENDING_APPROVAL"
                    ? "Revisión en curso"
                    : `${progressPct}% completado`}
              </p>
            </div>
          </div>

          <div
            role="progressbar"
            aria-valuenow={
              !inEditMode && approvalStatus !== "NONE" ? 100 : progressPct
            }
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso del registro de anfitrión"
            className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)]"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-emerald-600 transition-all duration-300"
              style={{
                width: `${
                  !inEditMode && approvalStatus !== "NONE" ? 100 : progressPct
                }%`,
              }}
            />
          </div>
        </header>

        {/* ESTADO A: EN CAPA DE APROBACIÓN (PENDING_APPROVAL) */}
        {!inEditMode && approvalStatus === "PENDING_APPROVAL" && (
          <section className="surface-card animate-ibita-fade-up p-6 sm:p-10 space-y-6">
            <div className="flex flex-col items-center text-center space-y-3">
              <Icon3D name="shield" size="lg" />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 px-3.5 py-1 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Capa de aprobación · Revisando tu perfil
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {hasPublishedBefore
                  ? "Recibimos la actualización de tus datos"
                  : "¡Recibimos tu solicitud de anfitrión!"}
              </h2>
              <p className="max-w-xl text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
                {hasPublishedBefore
                  ? "Como modificaste tus datos de anfitrión, nuestro equipo está validando los cambios. Apenas los aprobemos vas a ver habilitado el botón para publicar una nueva propiedad."
                  : "Estamos revisando tu información fiscal y de cobro para cuidar la confianza de los edificios y huéspedes. Te avisamos apenas quede aprobado."}
              </p>
            </div>

            <div className="mx-auto max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-2xl border border-emerald-600/35 bg-[var(--badge-consorcio-bg)]/50 p-4 font-bold text-[var(--badge-consorcio-text)]">
                ✓ 1. Datos enviados
              </div>
              <div className="rounded-2xl border border-emerald-600/35 bg-[var(--badge-consorcio-bg)]/50 p-4 font-bold text-[var(--badge-consorcio-text)]">
                ✓ 2. CUIT y cuentas validadas
              </div>
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 font-extrabold text-amber-900 dark:text-amber-300">
                ⏳ 3. Aprobación de perfil
              </div>
            </div>

            {status.type === "error" && (
              <p
                role="alert"
                className="mx-auto max-w-xl rounded-xl bg-red-100 text-red-900 px-4 py-3 text-xs font-bold"
              >
                {status.message}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                href="/perfil"
                className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 text-sm font-extrabold"
              >
                <span>Ir a mi perfil</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/"
                className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center rounded-2xl px-6 text-sm font-extrabold"
              >
                Volver al inicio
              </Link>
              <button
                type="button"
                onClick={() => {
                  setInEditMode(true);
                  goTo(0);
                }}
                className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl px-5 text-xs font-extrabold"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Modificar datos enviados</span>
              </button>
              <Link
                href={
                  currentUserId
                    ? `/mensajes?hostApproval=${currentUserId}`
                    : "/mensajes"
                }
                className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl px-5 text-xs font-extrabold text-emerald-700 dark:text-emerald-400"
              >
                <MessageSquare
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                />
                <span>Consultar aprobación en Mensajes</span>
              </Link>
            </div>

            {canApproveLocally && currentUserId && (
              <div className="mx-auto max-w-xl pt-2">
                <ProgressiveDisclosure
                  icon="sparkle"
                  title="Modo revisión local / administrador: aprobar ahora"
                  subtitle="Permite validar la experiencia post-aprobación sin esperar una revisión externa."
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs text-[var(--text-secondary)]">
                      También podés revisar todas las solicitudes en{" "}
                      <Link
                        href="/admin/aprobaciones"
                        className="underline font-bold text-[var(--brand-primary)]"
                      >
                        /admin/aprobaciones
                      </Link>
                      .
                    </p>
                    <button
                      type="button"
                      disabled={reviewLoading}
                      onClick={handleSimulateLocalApproval}
                      className="btn-primary-3d inline-flex min-h-[42px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                    >
                      {reviewLoading ? (
                        <>
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                          <span>Aprobando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Aprobar solicitud ahora</span>
                        </>
                      )}
                    </button>
                  </div>
                </ProgressiveDisclosure>
              </div>
            )}
          </section>
        )}

        {/* ESTADO B: ANFITRIÓN APROBADO */}
        {!inEditMode && approvalStatus === "APPROVED" && (
          <section className="surface-card animate-ibita-fade-up p-6 sm:p-10 space-y-6 text-center">
            <div className="flex justify-center">
              <Icon3D name="trophy" size="lg" />
            </div>

            <div className="mx-auto max-w-2xl space-y-2">
              <span className="badge-consorcio-friendly inline-block rounded-full px-3.5 py-1 text-xs font-extrabold">
                ✓ Perfil de anfitrión aprobado
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight pt-1">
                ¡Felicitaciones, {fullName.trim() || "Anfitrión"}!
              </h2>
              <p className="text-sm sm:text-base text-[var(--text-secondary)]">
                {hasPublishedBefore
                  ? `Tus datos actualizados están aprobados. Ya tenés ${propertiesCount} ${
                      propertiesCount === 1
                        ? "propiedad publicada"
                        : "propiedades publicadas"
                    } con reparto ${payoutSplitArsPct}% ARS / ${usdtSplitPct}% USDT.`
                  : `Tu perfil quedó aprobado y verificado con reparto ${payoutSplitArsPct}% en Pesos (ARS) y ${usdtSplitPct}% en USDT.`}
              </p>
            </div>

            <AchievementBanner
              icon="check"
              tone="emerald"
              title="Anfitrión habilitado"
              description={
                hasPublishedBefore
                  ? "Podés sumar un nuevo departamento cuando quieras o volver a la portada."
                  : "Ya podés crear tu primera publicación con fotos, precios y reglas de convivencia."
              }
            />

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/dashboard/propiedades"
                className="btn-primary-3d inline-flex min-h-[50px] w-full sm:w-auto items-center justify-center gap-2 rounded-2xl px-7 py-3 text-sm font-extrabold"
              >
                <span>{approvedPrimaryLabel}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>

              <Link
                href="/"
                className="btn-secondary-3d inline-flex min-h-[50px] w-full sm:w-auto items-center justify-center rounded-2xl px-6 py-3 text-sm font-extrabold"
              >
                Volver al inicio
              </Link>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setInEditMode(true);
                  goTo(0);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Editar mis datos de anfitrión</span>
              </button>
            </div>
          </section>
        )}

        {/* ESTADO C: SOLICITUD CON CORRECCIÓN REQUERIDA (REJECTED) */}
        {!inEditMode && approvalStatus === "REJECTED" && (
          <section className="surface-card animate-ibita-fade-up p-6 sm:p-10 space-y-5 text-center">
            <div className="flex justify-center">
              <Icon3D name="contract" size="lg" />
            </div>
            <div className="mx-auto max-w-xl space-y-2">
              <span className="inline-block rounded-full bg-red-100 text-red-900 px-3 py-1 text-xs font-extrabold">
                Necesita una corrección
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight">
                Revisá tus datos antes de publicar
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {approvalNotes ||
                  "Verificá tu CUIT, CBU/CVU y dirección USDT y volvé a enviarnos la solicitud."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setInEditMode(true);
                  goTo(0);
                }}
                className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 text-sm font-extrabold"
              >
                <span>Corregir mis datos</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <Link
                href="/"
                className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
              >
                Volver al inicio
              </Link>
            </div>
          </section>
        )}

        {/* ESTADO D: ASISTENTE PROGRESIVO DE 6 PASOS ESTILO AIRBNB (inEditMode) */}
        {inEditMode && (
          <form
            onSubmit={(e) => {
              if (!isFinalReviewStep) {
                e.preventDefault();
                handleStepNext(currentStepIndex);
                return;
              }
              void handleSubmitToApproval(e);
            }}
          >
            <ProgressiveFlowShell
              eyebrow={`Paso ${currentStepIndex + 1} de ${totalSteps} · ${activeStepDef.shortTitle}`}
              title={activeStepDef.title}
              subtitle={activeStepDef.subtitle}
              currentStep={currentStepIndex}
              totalSteps={totalSteps}
              direction={direction}
              mediaImageUrl={activeStepMedia.url}
              mediaImageAlt={activeStepMedia.alt}
              mediaBadge={activeStepMedia.badge}
              rightSlot={
                <div className="surface-card p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                      Vista previa en vivo
                    </span>
                    <Sparkles
                      className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                        {fullName.trim() || "Tu nombre o inmobiliaria"}
                      </p>
                      <p className="text-xs font-mono text-[var(--text-secondary)] truncate">
                        {phoneWhatsapp.trim() || "Tel. de respaldo"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                        isCuitValid
                          ? "badge-consorcio-friendly"
                          : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {isCuitValid ? "✓ CUIT verificado" : "CUIT pendiente"}
                    </span>
                  </div>
                  <div className="space-y-1 border-t border-[var(--border-subtle)] pt-2">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-[var(--brand-primary)]">
                        {payoutSplitArsPct}% Pesos
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {usdtSplitPct}% USDT
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                      <div
                        className="h-full bg-[var(--brand-primary)] transition-all duration-300"
                        style={{ width: `${payoutSplitArsPct}%` }}
                      />
                      <div
                        className="h-full bg-emerald-600 transition-all duration-300"
                        style={{ width: `${usdtSplitPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="border-t border-[var(--border-subtle)] pt-2 text-[11px] flex items-center justify-between gap-2">
                    <span className="font-bold text-[var(--text-secondary)]">
                      Horario de respuesta:
                    </span>
                    <span
                      className={`font-extrabold text-right ${
                        isResponseScheduleValid
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      {scheduleSummaryText}
                      {isResponseScheduleValid ? " ✓" : ""}
                    </span>
                  </div>
                </div>
              }
              canGoBack={currentStepIndex > 0}
              onBack={previousStep}
              canGoNext={
                isFinalReviewStep
                  ? stepValidFlags[totalSteps - 1] && status.type !== "loading"
                  : canAdvanceCurrentStep
              }
              onNext={
                isFinalReviewStep
                  ? undefined
                  : () => handleStepNext(currentStepIndex)
              }
              nextLabel="Siguiente"
              submitButtonLabel={
                isFinalReviewStep
                  ? hasPublishedBefore
                    ? "Guardar cambios y enviar a aprobación"
                    : authEmail
                      ? "Enviar perfil a aprobación"
                      : inlineAuthMode === "signup"
                        ? "Crear cuenta y enviar a aprobación"
                        : "Ingresar y enviar a aprobación"
                  : undefined
              }
              isSubmitting={status.type === "loading"}
              submittingLabel="Enviando a aprobación..."
            >
              {/* PASO 0: NOMBRE O RAZÓN SOCIAL */}
              {currentStepIndex === 0 && (
                <div className="space-y-2.5">
                  <label htmlFor="fullName" className="sr-only">
                    Nombre o razón social
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="min-h-[54px] w-full rounded-full border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 text-base font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
                    placeholder="Ej: Martín Gómez Propiedades"
                  />
                  <div className="flex items-center justify-between px-2 text-xs">
                    <span className="text-[var(--text-secondary)]">
                      Mínimo 3 letras; aparece en tu perfil público.
                    </span>
                    {isFullNameValid && (
                      <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                        ✓ Listo
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* PASO 1: TELÉFONO DE RESPALDO VERIFICADO */}
              {currentStepIndex === 1 && (
                <div className="space-y-2.5">
                  <label htmlFor="phoneWhatsapp" className="sr-only">
                    Teléfono de respaldo verificado
                  </label>
                  <input
                    id="phoneWhatsapp"
                    name="phoneWhatsapp"
                    type="tel"
                    required
                    value={phoneWhatsapp}
                    onChange={(e) => setPhoneWhatsapp(e.target.value)}
                    className="min-h-[54px] w-full rounded-full border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 text-base font-mono font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
                    placeholder="+54 9 11 2345-6789"
                  />
                  <div className="flex items-center justify-between px-2 text-xs">
                    <span className="text-[var(--text-secondary)]">
                      Con código de área (10 a 15 números).
                    </span>
                    {isPhoneValid && (
                      <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                        ✓ Válido
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* PASO 2: RESPALDO FISCAL (CUIT/CUIL) */}
              {currentStepIndex === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1 text-xs font-extrabold">
                      <label htmlFor="cuitCuil">CUIT o CUIL *</label>
                      <span
                        className={
                          isCuitValid
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-[var(--text-secondary)]"
                        }
                      >
                        {cuitDigitsCount} / 11 dígitos
                      </span>
                    </div>
                    <input
                      id="cuitCuil"
                      name="cuitCuil"
                      type="text"
                      inputMode="numeric"
                      required
                      value={cuitCuil}
                      onChange={(e) =>
                        setCuitCuil(formatCuitDisplay(e.target.value))
                      }
                      className="min-h-[54px] w-full rounded-full border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 text-base font-mono font-bold tracking-wide focus:border-[var(--brand-primary)] focus:outline-none"
                      placeholder="20-12345678-6"
                    />
                    {isCuitValid ? (
                      <p
                        role="status"
                        className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        ¡CUIT verificado! Listo para tus contratos digitales.
                      </p>
                    ) : cuitDigitsCount === 11 ? (
                      <p
                        role="alert"
                        className="rounded-xl bg-amber-500/15 border border-amber-500/40 px-3.5 py-2 text-xs font-bold text-amber-900 dark:text-amber-300"
                      >
                        Ese número no coincide con el dígito verificador. Revisá si algún número quedó invertido.
                      </p>
                    ) : null}
                  </div>

                  <ProgressiveDisclosure
                    icon="shield"
                    title="¿Por qué te pedimos el CUIT o CUIL?"
                    subtitle="Solo lo usamos para tus acuerdos legales; nunca se publica."
                  >
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                      En alquileres de 1 a 6 meses en Argentina, el contrato temporario necesita identificar al dueño con su CUIT o CUIL para que el acuerdo tenga respaldo legal.
                    </p>
                  </ProgressiveDisclosure>
                </div>
              )}

              {/* PASO 3: CÓMO QUERÉS COBRAR */}
              {currentStepIndex === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSelectPayoutStrategy("balanced", 70)}
                      aria-pressed={payoutMode === "balanced"}
                      className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer space-y-1 ${
                        payoutMode === "balanced"
                          ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] ring-2 ring-[var(--brand-primary)]/20"
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <span className="block text-[11px] font-extrabold text-[var(--brand-primary)]">
                        Recomendado
                      </span>
                      <p className="text-xs font-black">70% ARS · 30% USDT</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectPayoutStrategy("ars_only", 100)}
                      aria-pressed={payoutMode === "ars_only"}
                      className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer space-y-1 ${
                        payoutMode === "ars_only"
                          ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] ring-2 ring-[var(--brand-primary)]/20"
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <span className="block text-[11px] font-extrabold text-[var(--text-secondary)]">
                        Todo en Pesos
                      </span>
                      <p className="text-xs font-black">100% ARS</p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleSelectPayoutStrategy(
                          "custom",
                          payoutSplitArsPct === 100 ? 50 : payoutSplitArsPct
                        )
                      }
                      aria-pressed={payoutMode === "custom"}
                      className={`rounded-2xl border p-3.5 text-left transition-all cursor-pointer space-y-1 ${
                        payoutMode === "custom"
                          ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] ring-2 ring-[var(--brand-primary)]/20"
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                      }`}
                    >
                      <span className="block text-[11px] font-extrabold text-[var(--text-secondary)]">
                        A tu medida
                      </span>
                      <p className="text-xs font-black">Elegís el %</p>
                    </button>
                  </div>

                  {payoutMode === "custom" && (
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 space-y-1.5">
                      <div className="flex justify-between text-xs font-extrabold">
                        <label htmlFor="payoutSplitArsPct">
                          Pesos: {payoutSplitArsPct}%
                        </label>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          USDT: {usdtSplitPct}%
                        </span>
                      </div>
                      <input
                        id="payoutSplitArsPct"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={payoutSplitArsPct}
                        onChange={(e) =>
                          setPayoutSplitArsPct(Number(e.target.value))
                        }
                        className="w-full accent-[var(--brand-primary)] cursor-pointer"
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-extrabold">
                        <label htmlFor="payoutCbuCvu">CBU o CVU (22 números) *</label>
                        <span
                          className={
                            isCbuValid
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-[var(--text-secondary)]"
                          }
                        >
                          {cleanCbu.length}/22 {isCbuValid ? "✓" : ""}
                        </span>
                      </div>
                      <input
                        id="payoutCbuCvu"
                        name="payoutCbuCvu"
                        type="text"
                        inputMode="numeric"
                        required
                        maxLength={22}
                        value={payoutCbuCvu}
                        onChange={(e) =>
                          setPayoutCbuCvu(
                            e.target.value.replace(/\D/g, "").slice(0, 22)
                          )
                        }
                        className="min-h-[48px] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 text-sm font-mono font-bold"
                        placeholder="0000003100012345678901"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-extrabold">
                        <label htmlFor="payoutUsdtWallet">
                          Dirección USDT (Red Polygon) *
                        </label>
                        {isWalletValid && (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            ✓ Válida
                          </span>
                        )}
                      </div>
                      <input
                        id="payoutUsdtWallet"
                        name="payoutUsdtWallet"
                        type="text"
                        required
                        value={payoutUsdtWallet}
                        onChange={(e) => setPayoutUsdtWallet(e.target.value)}
                        className="min-h-[48px] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 text-sm font-mono font-semibold"
                        placeholder="0x223c27263ef7d49491031e6cda3feaf2690dd1f7"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 4: INTERVALO OBLIGATORIO DE RESPUESTA */}
              {currentStepIndex === 4 && (
                <HostResponseScheduleEditor
                  value={responseScheduleValue}
                  onChange={setResponseScheduleValue}
                  mode="onboarding"
                />
              )}

              {/* PASO 5: REVISAR Y ENVIAR */}
              {currentStepIndex === 5 && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-[var(--text-secondary)]">
                        Nombre:
                      </span>{" "}
                      <strong className="text-[var(--text-primary)]">{fullName}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => goTo(0)}
                      className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-[var(--text-secondary)]">
                        Tel. respaldo:
                      </span>{" "}
                      <strong className="font-mono text-[var(--text-primary)]">
                        {normalizedPhone}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => goTo(1)}
                      className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-[var(--text-secondary)]">
                        CUIT / CUIL:
                      </span>{" "}
                      <strong className="font-mono text-[var(--text-primary)]">
                        {cuitCuil}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => goTo(2)}
                      className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-extrabold text-[var(--text-primary)]">
                        Cobros: {payoutSplitArsPct}% ARS · {usdtSplitPct}% USDT
                      </p>
                      <p className="font-mono text-[11px] text-[var(--text-secondary)] truncate">
                        CBU {cleanCbu} · Wallet {payoutUsdtWallet}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => goTo(3)}
                      className="font-extrabold text-[var(--brand-primary)] underline shrink-0 cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-extrabold text-[var(--text-primary)]">
                        Horario de respuesta confirmado ✓
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {scheduleSummaryText}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => goTo(4)}
                      className="font-extrabold text-[var(--brand-primary)] underline shrink-0 cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>

                  {authEmail ? (
                    <div className="badge-consorcio-friendly flex items-center gap-2 rounded-2xl p-3.5 text-xs font-extrabold">
                      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        Sesión abierta como <strong>{authEmail}</strong>. Listo para enviar.
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-[var(--brand-primary)]/35 bg-[var(--surface-tint)]/55 p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
                          <Lock className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
                          Vinculá tu correo para enviar
                        </span>
                        <div className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-0.5 text-[11px] font-extrabold">
                          <button
                            type="button"
                            onClick={() => setInlineAuthMode("signup")}
                            className={`rounded-full px-2.5 py-1 cursor-pointer ${
                              inlineAuthMode === "signup"
                                ? "bg-[var(--brand-primary)] text-white"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            Crear cuenta
                          </button>
                          <button
                            type="button"
                            onClick={() => setInlineAuthMode("signin")}
                            className={`rounded-full px-2.5 py-1 cursor-pointer ${
                              inlineAuthMode === "signin"
                                ? "bg-[var(--brand-primary)] text-white"
                                : "text-[var(--text-secondary)]"
                            }`}
                          >
                            Ya tengo cuenta
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          id="inline-host-email"
                          type="email"
                          required
                          value={inlineEmail}
                          onChange={(e) => setInlineEmail(e.target.value)}
                          placeholder="tu@correo.com.ar"
                          className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs"
                        />
                        <input
                          id="inline-host-password"
                          type="password"
                          required
                          minLength={8}
                          value={inlinePassword}
                          onChange={(e) => setInlinePassword(e.target.value)}
                          placeholder="Contraseña (mín. 8)"
                          className="min-h-[44px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {status.type === "error" && (
                    <p
                      role="alert"
                      className="rounded-2xl border border-red-600/40 bg-red-100 text-red-950 px-4 py-3 text-xs font-bold"
                    >
                      {status.message}
                    </p>
                  )}
                </div>
              )}
            </ProgressiveFlowShell>
          </form>
        )}

        <p className="text-center text-xs font-semibold text-[var(--text-secondary)]">
          Tus avances se guardan automáticamente mientras completás el registro.
        </p>
      </div>
    </div>
  );
}

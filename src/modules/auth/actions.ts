"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { Client } from "pg";
import { env } from "@/env";
import {
  DDJJ_CONSORCIO_VERSION,
  isCryptoPaymentsEnabled,
} from "@/lib/compliance/feature-flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  HostOnboardingSubmissionSchema,
  UpdateHostResponseScheduleSchema,
  BasicProfileUpdateSchema,
  type HostOnboardingInput,
  type HostResponseScheduleInput,
  type BasicProfileUpdateInput,
} from "./validators";
import { type ActionResult } from "@/lib/errors/app-error";
import { sendNewHostApprovalEmail } from "@/lib/notifications/resend";
import { ensureHostApprovalConversationWithPg } from "@/modules/messaging/server";
import {
  formatResponseScheduleSummary,
  type HostResponseSchedule,
} from "@/lib/host/response-schedule";

export type HostApprovalStatus =
  | "NONE"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export async function completeHostOnboardingAction(
  rawInput: HostOnboardingInput
): Promise<
  ActionResult<{
    userId: string;
    role: string;
    approvalStatus: "PENDING_APPROVAL";
    checksumWallet: string;
    existingPropertiesCount: number;
  }>
> {
  const parsed = HostOnboardingSubmissionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ?? "Datos de onboarding inválidos",
        details: parsed.error.flatten(),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Debés iniciar sesión para completar el alta de Anfitrión.",
      },
    };
  }

  const [existingProfileRes, propertiesCountRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("host_id", user.id),
  ]);

  const currentRole = existingProfileRes.data?.role;
  const nextRole =
    currentRole === "HOST" || currentRole === "SUPERADMIN"
      ? currentRole
      : "GUEST";
  const existingPropertiesCount = propertiesCountRes.count ?? 0;

  const {
    fullName,
    phoneWhatsapp,
    cuitCuil,
    payoutCbuCvu,
    payoutUsdtWallet,
    payoutSplitArsPct,
    jurisdiccionPrincipal,
    numeroRegistroTuristico,
    responseSchedule,
  } = parsed.data;

  const effectiveArsPct = isCryptoPaymentsEnabled() ? payoutSplitArsPct : 100;
  const effectiveWallet = payoutUsdtWallet?.trim() || null;

  let ddjjIp = "0.0.0.0";
  try {
    const reqHeaders = await headers();
    ddjjIp = (
      reqHeaders.get("x-forwarded-for")?.split(",")[0] ??
      reqHeaders.get("x-real-ip") ??
      "0.0.0.0"
    )
      .trim()
      .slice(0, 120);
  } catch {
    ddjjIp = "0.0.0.0";
  }

  const storedResponseSchedule: HostResponseSchedule = {
    days: responseSchedule.days,
    startHour: responseSchedule.startHour,
    endHour: responseSchedule.endHour,
    maxResponseHours: responseSchedule.maxResponseHours,
    timezone: "America/Argentina/Buenos_Aires",
    confirmedAt: new Date().toISOString(),
  };
  const responseScheduleSummary = formatResponseScheduleSummary(
    storedResponseSchedule
  );

  const nowIso = new Date().toISOString();
  const { error: upsertError } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    full_name: fullName,
    phone_whatsapp: phoneWhatsapp,
    role: nextRole,
    cuit_cuil: cuitCuil.replace(/\D/g, ""),
    payout_cbu_cvu: payoutCbuCvu.replace(/\s+/g, ""),
    payout_usdt_wallet: effectiveWallet,
    payout_split_ars_pct: effectiveArsPct,
    jurisdiccion_principal: jurisdiccionPrincipal,
    numero_registro_turistico_default: numeroRegistroTuristico.trim() || null,
    ddjj_consorcio_accepted_at: nowIso,
    ddjj_consorcio_ip: ddjjIp,
    ddjj_consorcio_version: DDJJ_CONSORCIO_VERSION,
    response_schedule: storedResponseSchedule,
    host_approval_status: "PENDING_APPROVAL",
    host_approval_reviewed_at: null,
    host_approval_notes: null,
    updated_at: nowIso,
  });

  if (upsertError) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: upsertError.message,
      },
    };
  }

  try {
    const pg = new Client({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });
    await pg.connect();
    try {
      await ensureHostApprovalConversationWithPg(pg, {
        profileId: user.id,
        actorUserId: user.id,
        isAdmin: false,
        systemNoticeBody:
          existingPropertiesCount > 0
            ? `${fullName} actualizó sus datos fiscales/cobro e intervalo de respuesta (${responseScheduleSummary}) y reenvió la solicitud a revisión.`
            : `${fullName} envió su solicitud inicial de alta como anfitrión con horario de respuesta confirmado (${responseScheduleSummary}).`,
      });
    } finally {
      await pg.end();
    }
  } catch {
    // El hilo interno es best-effort para no bloquear el guardado del perfil
  }

  await sendNewHostApprovalEmail({
    fullName,
    email: user.email ?? "",
    phoneWhatsapp,
    cuitCuil,
    payoutSplitArsPct: effectiveArsPct,
    checksumWallet: effectiveWallet ?? "Sin billetera USDT (solo ARS)",
    existingPropertiesCount,
    responseScheduleSummary,
  });

  revalidatePath("/perfil");
  revalidatePath("/onboarding/anfitrion");
  revalidatePath("/dashboard/propiedades");
  revalidatePath("/admin/aprobaciones");
  revalidatePath("/mensajes");

  return {
    ok: true,
    data: {
      userId: user.id,
      role: nextRole,
      approvalStatus: "PENDING_APPROVAL",
      checksumWallet: effectiveWallet ?? "100% ARS (CBU/CVU)",
      existingPropertiesCount,
    },
  };
}

export async function updateBasicProfileAction(
  rawInput: BasicProfileUpdateInput
): Promise<ActionResult<{ fullName: string; phoneWhatsapp: string | null }>> {
  const parsed = BasicProfileUpdateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ?? "Revisá los datos ingresados.",
        details: parsed.error.flatten(),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Ingresá a tu cuenta para guardar cambios en tu perfil.",
      },
    };
  }

  const { fullName, phoneWhatsapp } = parsed.data;

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone_whatsapp: phoneWhatsapp,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: updateError.message,
        },
      };
    }
  } else {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      email: user.email ?? "",
      full_name: fullName,
      phone_whatsapp: phoneWhatsapp,
      role: "GUEST",
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: insertError.message,
        },
      };
    }
  }

  revalidatePath("/perfil");

  return {
    ok: true,
    data: {
      fullName,
      phoneWhatsapp,
    },
  };
}

/**
 * Permite a un anfitrión ya registrado confirmar o actualizar su intervalo
 * de días/horarios de respuesta sin reiniciar el estado de aprobación de perfil.
 */
export async function updateHostResponseScheduleAction(
  rawInput: HostResponseScheduleInput
): Promise<
  ActionResult<{
    schedule: HostResponseSchedule;
    scheduleSummary: string;
  }>
> {
  const parsed = UpdateHostResponseScheduleSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Revisá los días y horarios de respuesta antes de guardar.",
        details: parsed.error.flatten(),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Ingresá a tu cuenta de anfitrión para guardar tu horario de respuesta.",
      },
    };
  }

  const storedSchedule: HostResponseSchedule = {
    days: parsed.data.days,
    startHour: parsed.data.startHour,
    endHour: parsed.data.endHour,
    maxResponseHours: parsed.data.maxResponseHours,
    timezone: "America/Argentina/Buenos_Aires",
    confirmedAt: new Date().toISOString(),
  };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      response_schedule: storedSchedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (updateError) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: updateError.message,
      },
    };
  }

  revalidatePath("/perfil");
  revalidatePath("/dashboard/propiedades");
  revalidatePath("/onboarding/anfitrion");

  return {
    ok: true,
    data: {
      schedule: storedSchedule,
      scheduleSummary: formatResponseScheduleSummary(storedSchedule),
    },
  };
}

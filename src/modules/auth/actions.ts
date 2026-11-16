"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { HostOnboardingSchema, type HostOnboardingInput } from "./validators";
import { type ActionResult } from "@/lib/errors/app-error";

export async function completeHostOnboardingAction(
  rawInput: HostOnboardingInput
): Promise<ActionResult<{ userId: string; role: "HOST"; checksumWallet: string }>> {
  const parsed = HostOnboardingSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Datos de onboarding inválidos",
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

  const { fullName, phoneWhatsapp, cuitCuil, payoutCbuCvu, payoutUsdtWallet, payoutSplitArsPct } =
    parsed.data;

  const { error: upsertError } = await supabase.from("profiles").upsert({
    id: user.id,
    email: user.email ?? "",
    full_name: fullName,
    phone_whatsapp: phoneWhatsapp,
    role: "HOST",
    cuit_cuil: cuitCuil.replace(/\D/g, ""),
    payout_cbu_cvu: payoutCbuCvu.replace(/\s+/g, ""),
    payout_usdt_wallet: payoutUsdtWallet,
    payout_split_ars_pct: payoutSplitArsPct,
    updated_at: new Date().toISOString(),
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

  return {
    ok: true,
    data: {
      userId: user.id,
      role: "HOST",
      checksumWallet: payoutUsdtWallet,
    },
  };
}

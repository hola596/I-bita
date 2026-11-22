import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HostApprovalStatus } from "@/modules/auth/actions";
import {
  HostOnboardingWizard,
  type HostOnboardingInitialProfile,
  type HostOnboardingInitialUser,
} from "@/components/onboarding/HostOnboardingWizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Registro de Dueños y Anfitriones | I-bita Argentina",
  description:
    "Completá tu alta guiada en pocos minutos: datos de contacto, respaldo fiscal, cobros y aprobación de perfil.",
};

interface HostOnboardingPageProps {
  searchParams: Promise<{ editar?: string }>;
}

export default async function HostOnboardingPage({
  searchParams,
}: HostOnboardingPageProps) {
  const { editar } = await searchParams;
  const startInEditMode = editar === "1";

  let initialUser: HostOnboardingInitialUser | null = null;
  let initialProfile: HostOnboardingInitialProfile | null = null;
  let initialApprovalStatus: HostApprovalStatus = "NONE";
  let initialApprovalNotes: string | null = null;
  let existingPropertiesCount = 0;
  let canApproveLocally = process.env.NODE_ENV !== "production";

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      initialUser = {
        id: user.id,
        email: user.email ?? null,
      };

      const [profileRes, propertiesCountRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "full_name, phone_whatsapp, cuit_cuil, payout_cbu_cvu, payout_usdt_wallet, payout_split_ars_pct, response_schedule, role, host_approval_status, host_approval_notes"
          )
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("host_id", user.id),
      ]);

      existingPropertiesCount = propertiesCountRes.count ?? 0;

      const profileRow = profileRes.data;
      if (profileRow) {
        initialProfile = {
          fullName: profileRow.full_name ?? undefined,
          phoneWhatsapp: profileRow.phone_whatsapp ?? undefined,
          cuitCuil: profileRow.cuit_cuil ?? undefined,
          payoutCbuCvu: profileRow.payout_cbu_cvu ?? undefined,
          payoutUsdtWallet: profileRow.payout_usdt_wallet ?? undefined,
          payoutSplitArsPct:
            typeof profileRow.payout_split_ars_pct === "number"
              ? profileRow.payout_split_ars_pct
              : undefined,
          responseSchedule: profileRow.response_schedule ?? undefined,
          role: profileRow.role ?? undefined,
        };
        initialApprovalStatus = (profileRow.host_approval_status ??
          "NONE") as HostApprovalStatus;
        initialApprovalNotes = profileRow.host_approval_notes
          ? String(profileRow.host_approval_notes)
          : null;

        if (profileRow.role === "SUPERADMIN") {
          canApproveLocally = true;
        }
      }
    }
  } catch {
    initialUser = null;
    initialProfile = null;
  }

  return (
    <HostOnboardingWizard
      initialUser={initialUser}
      initialProfile={initialProfile}
      initialApprovalStatus={initialApprovalStatus}
      initialApprovalNotes={initialApprovalNotes}
      existingPropertiesCount={existingPropertiesCount}
      startInEditMode={startInEditMode}
      canApproveLocally={canApproveLocally}
    />
  );
}

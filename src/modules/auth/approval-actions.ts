"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/errors/app-error";
import type { HostApprovalStatus } from "./actions";
import {
  formatResponseScheduleSummary,
  normalizeHostResponseSchedule,
} from "@/lib/host/response-schedule";

export interface HostApplicationSummary {
  id: string;
  email: string;
  fullName: string;
  phoneWhatsapp: string | null;
  cuitCuil: string | null;
  maskedCbuCvu: string;
  shortWallet: string;
  payoutSplitArsPct: number;
  responseScheduleSummary: string | null;
  role: string;
  approvalStatus: HostApprovalStatus;
  reviewedAt: string | null;
  notes: string | null;
  propertiesCount: number;
  updatedAt: string;
}

function createPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

function maskCbu(raw: string | null): string {
  if (!raw) return "Sin CBU";
  const digits = raw.replace(/\s+/g, "");
  return digits.length >= 5 ? `•••• ${digits.slice(-5)}` : "Configurado";
}

function shortenWallet(raw: string | null): string {
  if (!raw) return "Sin wallet";
  return raw.length >= 12 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw;
}

async function canReviewHostApplications(userId: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  return data?.role === "SUPERADMIN";
}

export async function listPendingHostApplicationsAction(): Promise<
  ActionResult<HostApplicationSummary[]>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Debés iniciar sesión para revisar solicitudes de anfitriones.",
      },
    };
  }

  const allowed = await canReviewHostApplications(user.id);
  if (!allowed) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "No tenés permisos de revisión para ver esta cola.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();

  try {
    const res = await pg.query<{
      id: string;
      email: string;
      full_name: string;
      phone_whatsapp: string | null;
      cuit_cuil: string | null;
      payout_cbu_cvu: string | null;
      payout_usdt_wallet: string | null;
      payout_split_ars_pct: string | number;
      response_schedule: unknown;
      role: string;
      host_approval_status: HostApprovalStatus;
      host_approval_reviewed_at: string | null;
      host_approval_notes: string | null;
      updated_at: string;
      properties_count: string | number;
    }>(
      `SELECT
         p.id,
         p.email,
         p.full_name,
         p.phone_whatsapp,
         p.cuit_cuil,
         p.payout_cbu_cvu,
         p.payout_usdt_wallet,
         p.payout_split_ars_pct,
         p.response_schedule,
         p.role::text AS role,
         p.host_approval_status::text AS host_approval_status,
         p.host_approval_reviewed_at::text AS host_approval_reviewed_at,
         p.host_approval_notes,
         p.updated_at::text AS updated_at,
         COUNT(pr.id)::int AS properties_count
       FROM public.profiles p
       LEFT JOIN public.properties pr ON pr.host_id = p.id
       WHERE p.host_approval_status IN ('PENDING_APPROVAL', 'REJECTED', 'APPROVED')
       GROUP BY p.id
       ORDER BY
         CASE p.host_approval_status
           WHEN 'PENDING_APPROVAL' THEN 0
           WHEN 'REJECTED' THEN 1
           WHEN 'APPROVED' THEN 2
           ELSE 3
         END,
         p.updated_at DESC
       LIMIT 50`
    );

    const mapped: HostApplicationSummary[] = res.rows.map((r) => {
      const normalized = normalizeHostResponseSchedule(r.response_schedule);
      return {
        id: String(r.id),
        email: String(r.email ?? ""),
        fullName: String(r.full_name ?? ""),
        phoneWhatsapp: r.phone_whatsapp ? String(r.phone_whatsapp) : null,
        cuitCuil: r.cuit_cuil ? String(r.cuit_cuil) : null,
        maskedCbuCvu: maskCbu(r.payout_cbu_cvu ? String(r.payout_cbu_cvu) : null),
        shortWallet: shortenWallet(
          r.payout_usdt_wallet ? String(r.payout_usdt_wallet) : null
        ),
        payoutSplitArsPct: Number(r.payout_split_ars_pct ?? 100),
        responseScheduleSummary: normalized.isConfigured
          ? formatResponseScheduleSummary(normalized.schedule)
          : null,
        role: String(r.role ?? "GUEST"),
        approvalStatus: (r.host_approval_status ?? "NONE") as HostApprovalStatus,
        reviewedAt: r.host_approval_reviewed_at
          ? String(r.host_approval_reviewed_at)
          : null,
        notes: r.host_approval_notes ? String(r.host_approval_notes) : null,
        propertiesCount: Number(r.properties_count ?? 0),
        updatedAt: String(r.updated_at ?? ""),
      };
    });

    return { ok: true, data: mapped };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Error al consultar la cola de aprobación.",
      },
    };
  } finally {
    await pg.end();
  }
}

export async function reviewHostApplicationAction(input: {
  profileId: string;
  decision: "APPROVED" | "REJECTED";
  notes?: string;
}): Promise<
  ActionResult<{
    profileId: string;
    approvalStatus: "APPROVED" | "REJECTED";
    existingPropertiesCount: number;
  }>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Debés iniciar sesión para aprobar solicitudes.",
      },
    };
  }

  const allowed = await canReviewHostApplications(user.id);
  if (!allowed) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "No tenés permisos para aprobar o rechazar anfitriones.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();

  try {
    const existingRes = await pg.query<{ id: string; role: string }>(
      `SELECT id, role::text AS role FROM public.profiles WHERE id = $1 LIMIT 1`,
      [input.profileId]
    );

    const targetProfile = existingRes.rows[0];
    if (!targetProfile) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No encontramos el perfil solicitado.",
        },
      };
    }

    const trimmedNotes = input.notes?.trim() || null;

    if (input.decision === "APPROVED") {
      const nextRole =
        targetProfile.role === "SUPERADMIN" ? "SUPERADMIN" : "HOST";
      await pg.query(
        `UPDATE public.profiles
         SET role = $1::user_role,
             host_approval_status = 'APPROVED'::host_approval_status,
             host_approval_reviewed_at = NOW(),
             host_approval_notes = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [nextRole, trimmedNotes, input.profileId]
      );
    } else {
      await pg.query(
        `UPDATE public.profiles
         SET host_approval_status = 'REJECTED'::host_approval_status,
             host_approval_reviewed_at = NOW(),
             host_approval_notes = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [
          trimmedNotes ?? "Revisá y corregí los datos ingresados.",
          input.profileId,
        ]
      );
    }

    const countRes = await pg.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM public.properties WHERE host_id = $1`,
      [input.profileId]
    );
    const existingPropertiesCount = Number(countRes.rows[0]?.count ?? 0);

    revalidatePath("/perfil");
    revalidatePath("/onboarding/anfitrion");
    revalidatePath("/dashboard/propiedades");
    revalidatePath("/admin/aprobaciones");

    return {
      ok: true,
      data: {
        profileId: input.profileId,
        approvalStatus: input.decision,
        existingPropertiesCount,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "Error al procesar la revisión del anfitrión.",
      },
    };
  } finally {
    await pg.end();
  }
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HostApprovalStatus } from "@/modules/auth/actions";
import { getHostEarningsSummary } from "@/modules/payments/host-earnings";
import { getHostResponseMetricsSummary } from "@/modules/hosts/response-sla";
import {
  getUserNotificationsSummaryWithPg,
  isMessagingAdmin,
} from "@/modules/messaging/server";
import {
  ProfileClient,
  type ProfileClientProps,
} from "@/components/profile/ProfileClient";
import { Icon3D } from "@/components/ui/Icon3D";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mi Perfil y Cuenta | I-bita Argentina",
  description:
    "Consultá tu perfil activo, tus datos de contacto, reservas y estado de anfitrión.",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  let user: { id: string; email: string } | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      user = {
        id: data.user.id,
        email: data.user.email ?? "",
      };
    }

    if (!user) {
      return (
        <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
          <section className="surface-card p-6 sm:p-8 text-center space-y-5">
            <div className="flex justify-center">
              <Icon3D name="user" size="lg" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-extrabold tracking-tight">
                Todavía no ingresaste a tu cuenta
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Iniciá sesión para ver tu perfil, tus reservas y tus propiedades
                publicadas.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
              <Link
                href="/login"
                className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 text-sm font-extrabold"
              >
                <span>Ingresar a mi cuenta</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/"
                className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
              >
                Volver al inicio
              </Link>
            </div>
          </section>
        </div>
      );
    }

    try {
      await supabase.rpc("expire_stale_booking_holds", {
        p_property_id: null,
      });
    } catch {
      // Ignorar si la función RPC aún no está disponible
    }

    const [profileRes, propertiesRes, bookingsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name, phone_whatsapp, role, cuit_cuil, payout_cbu_cvu, payout_usdt_wallet, payout_split_ars_pct, host_approval_status, host_approval_reviewed_at, host_approval_notes, created_at"
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("properties")
        .select(
          "id, slug, title, corridor, nightly_rate, base_currency, is_published"
        )
        .eq("host_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("bookings")
        .select(
          "id, check_in, check_out, nights_count, status, payment_currency, total_amount, hold_expires_at, host_confirmed_at"
        )
        .eq("guest_id", user.id)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const profileRow = profileRes.data;
    const mappedProfile: ProfileClientProps["profile"] = profileRow
      ? {
          fullName: profileRow.full_name ?? "",
          phoneWhatsapp: profileRow.phone_whatsapp ?? null,
          role: profileRow.role ?? "GUEST",
          cuitCuil: profileRow.cuit_cuil ?? null,
          payoutCbuCvu: profileRow.payout_cbu_cvu ?? null,
          payoutUsdtWallet: profileRow.payout_usdt_wallet ?? null,
          payoutSplitArsPct:
            typeof profileRow.payout_split_ars_pct === "number"
              ? profileRow.payout_split_ars_pct
              : 100,
          hostApprovalStatus: (profileRow.host_approval_status ??
            "NONE") as HostApprovalStatus,
          hostApprovalReviewedAt: profileRow.host_approval_reviewed_at
            ? String(profileRow.host_approval_reviewed_at)
            : null,
          hostApprovalNotes: profileRow.host_approval_notes
            ? String(profileRow.host_approval_notes)
            : null,
          createdAt: profileRow.created_at ?? null,
        }
      : null;

    const hostProperties: ProfileClientProps["hostProperties"] = (
      propertiesRes.data ?? []
    ).map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      corridor: p.corridor,
      nightlyRate: Number(p.nightly_rate ?? 0),
      baseCurrency: p.base_currency ?? "ARS",
      isPublished: Boolean(p.is_published),
    }));

    const guestBookings: ProfileClientProps["guestBookings"] = (
      bookingsRes.data ?? []
    ).map((b) => ({
      id: b.id,
      checkIn: String(b.check_in),
      checkOut: String(b.check_out),
      nightsCount: Number(b.nights_count ?? 1),
      status: String(b.status ?? "PENDING_PAYMENT"),
      paymentCurrency: String(b.payment_currency ?? "ARS"),
      totalAmount: String(b.total_amount ?? "0"),
      holdExpiresAt: b.hold_expires_at ? String(b.hold_expires_at) : null,
      hostConfirmedAt: b.host_confirmed_at ? String(b.host_confirmed_at) : null,
    }));

    const isApprovedHost =
      mappedProfile?.role === "SUPERADMIN" ||
      (mappedProfile?.role === "HOST" &&
        mappedProfile?.hostApprovalStatus === "APPROVED");

    const [hostEarnings, hostResponseMetrics] = isApprovedHost
      ? await Promise.all([
          getHostEarningsSummary(user.id),
          getHostResponseMetricsSummary(user.id),
        ])
      : [null, null];

    const canReviewInDev =
      process.env.NODE_ENV !== "production" ||
      mappedProfile?.role === "SUPERADMIN";

    let unreadMessagesCount = 0;
    try {
      const pg = new Client({
        connectionString: env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      });
      await pg.connect();
      try {
        const isAdmin = await isMessagingAdmin(pg, user.id);
        const notif = await getUserNotificationsSummaryWithPg(pg, {
          userId: user.id,
          userEmail: user.email,
          isAdmin,
          isApprovedHost,
        });
        unreadMessagesCount = notif.unreadMessagesCount;
      } finally {
        await pg.end();
      }
    } catch {
      unreadMessagesCount = 0;
    }

    return (
      <ProfileClient
        user={user}
        profile={mappedProfile}
        hostProperties={hostProperties}
        guestBookings={guestBookings}
        hostEarnings={hostEarnings}
        hostResponseMetrics={hostResponseMetrics}
        unreadMessagesCount={unreadMessagesCount}
        canReviewInDev={canReviewInDev}
      />
    );
  } catch {
    return (
      <div className="mx-auto max-w-lg px-4 py-14 sm:px-6">
        <section className="surface-card p-6 sm:p-8 text-center space-y-5">
          <div className="flex justify-center">
            <Icon3D name="user" size="lg" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Ingresá para ver tu perfil
          </h1>
          <Link
            href="/login"
            className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-6 text-sm font-extrabold"
          >
            <span>Ingresar a mi cuenta</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </div>
    );
  }
}

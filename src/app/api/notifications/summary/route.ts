import { NextResponse } from "next/server";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getUserNotificationsSummaryWithPg,
  isMessagingAdmin,
} from "@/modules/messaging/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          ok: true,
          authenticated: false,
          unreadMessagesCount: 0,
          unreadConversationsCount: 0,
          pendingHostRequestsCount: 0,
          totalAttentionCount: 0,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    const pg = new Client({
      connectionString: env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    await pg.connect();

    try {
      const [profileRes, isAdmin] = await Promise.all([
        pg.query<{
          role: string | null;
          host_approval_status: string | null;
        }>(
          `SELECT role::text AS role, host_approval_status::text AS host_approval_status
           FROM public.profiles
           WHERE id = $1
           LIMIT 1`,
          [user.id]
        ),
        isMessagingAdmin(pg, user.id),
      ]);

      const profileRow = profileRes.rows[0];
      const isApprovedHost =
        profileRow?.role === "SUPERADMIN" ||
        (profileRow?.role === "HOST" &&
          profileRow?.host_approval_status === "APPROVED");

      const summary = await getUserNotificationsSummaryWithPg(pg, {
        userId: user.id,
        userEmail: user.email ?? null,
        isAdmin,
        isApprovedHost,
      });

      return NextResponse.json(
        {
          ok: true,
          authenticated: true,
          ...summary,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    } finally {
      await pg.end();
    }
  } catch {
    return NextResponse.json(
      {
        ok: true,
        authenticated: false,
        unreadMessagesCount: 0,
        unreadConversationsCount: 0,
        pendingHostRequestsCount: 0,
        totalAttentionCount: 0,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
}

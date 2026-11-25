import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SubscribeBodySchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url("El endpoint de suscripción Web Push debe ser una URL válida.")
    .max(2048),
  keys: z.object({
    p256dh: z.string().trim().min(10).max(512),
    auth: z.string().trim().min(10).max(256),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Iniciá sesión para activar notificaciones en este dispositivo.",
          },
        },
        { status: 401 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INVALID_JSON", message: "Cuerpo JSON inválido." },
        },
        { status: 400 }
      );
    }

    const parsed = SubscribeBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Datos inválidos de suscripción Web Push.",
          },
        },
        { status: 422 }
      );
    }

    const nowIso = new Date().toISOString();
    const userAgent =
      request.headers.get("user-agent")?.slice(0, 500) ?? null;

    const admin = createSupabaseAdminClient();
    const { error: upsertError } = await admin
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          user_agent: userAgent,
          updated_at: nowIso,
        },
        { onConflict: "endpoint" }
      );

    if (upsertError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INTERNAL_ERROR", message: upsertError.message },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      subscribedAt: nowIso,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "No se pudo guardar la suscripción Push.",
        },
      },
      { status: 500 }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UnsubscribeBodySchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url("El endpoint de suscripción Web Push debe ser una URL válida.")
    .max(2048),
});

export async function DELETE(request: NextRequest) {
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
            message: "Iniciá sesión para administrar tus notificaciones.",
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

    const parsed = UnsubscribeBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ??
              "Indicá el endpoint a desactivar.",
          },
        },
        { status: 422 }
      );
    }

    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", parsed.data.endpoint)
      .eq("user_id", user.id);

    if (deleteError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: "INTERNAL_ERROR", message: deleteError.message },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "No se pudo desactivar la suscripción Push.",
        },
      },
      { status: 500 }
    );
  }
}

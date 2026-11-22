"use server";

import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/errors/app-error";
import { sendNewContactInquiryEmail } from "@/lib/notifications/resend";
import { createSupportConversationWithPg } from "@/modules/messaging/server";
import {
  ContactInquirySchema,
  type ContactInquiryInput,
} from "./schema";

export async function submitContactInquiryAction(
  rawInput: ContactInquiryInput
): Promise<
  ActionResult<{
    inquiryId: string;
    conversationId: string | null;
    emailNotified: boolean;
  }>
> {
  const parsed = ContactInquirySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ?? "Datos de formulario inválidos",
        details: parsed.error.flatten(),
      },
    };
  }

  let authenticatedUserId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticatedUserId = user?.id ?? null;
  } catch {
    authenticatedUserId = null;
  }

  const pg = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await pg.connect();
  let inquiryId: string;
  let conversationId: string | null = null;

  try {
    await pg.query("BEGIN");

    const insertRes = await pg.query<{ id: string }>(
      `INSERT INTO public.contact_inquiries (
         full_name, email, phone, subject, message
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        parsed.data.fullName,
        parsed.data.email,
        parsed.data.phone ?? null,
        parsed.data.subject,
        parsed.data.message,
      ]
    );

    inquiryId = insertRes.rows[0]!.id;

    let linkedUserId = authenticatedUserId;
    if (!linkedUserId) {
      const profileRes = await pg.query<{ id: string }>(
        `SELECT id FROM public.profiles WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [parsed.data.email]
      );
      linkedUserId = profileRes.rows[0]?.id ?? null;
    }

    conversationId = await createSupportConversationWithPg(pg, {
      inquiryId,
      userId: linkedUserId,
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });

    await pg.query("COMMIT");
  } catch (err) {
    try {
      await pg.query("ROLLBACK");
    } catch {
      // Ignorar fallo secundario
    }
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          err instanceof Error
            ? err.message
            : "No pudimos registrar tu consulta en este momento.",
      },
    };
  } finally {
    await pg.end();
  }

  const emailResult = await sendNewContactInquiryEmail({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    subject: parsed.data.subject,
    message: parsed.data.message,
    conversationId,
  });

  try {
    revalidatePath("/admin/consultas");
    revalidatePath("/mensajes");
  } catch {
    // Ignorar fuera de contexto de Next.js
  }

  return {
    ok: true,
    data: {
      inquiryId,
      conversationId,
      emailNotified: emailResult.ok,
    },
  };
}

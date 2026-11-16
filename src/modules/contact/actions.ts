"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/errors/app-error";
import {
  ContactInquirySchema,
  type ContactInquiryInput,
} from "./schema";

export async function submitContactInquiryAction(
  rawInput: ContactInquiryInput
): Promise<ActionResult<{ inquiryId: string }>> {
  const parsed = ContactInquirySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Datos de formulario inválidos",
        details: parsed.error.flatten(),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("contact_inquiries").insert({
    full_name: parsed.data.fullName,
    email: parsed.data.email,
    phone: parsed.data.phone ?? null,
    subject: parsed.data.subject,
    message: parsed.data.message,
  });

  if (error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error.message,
      },
    };
  }

  return {
    ok: true,
    data: {
      inquiryId: "PERSISTED_OK",
    },
  };
}

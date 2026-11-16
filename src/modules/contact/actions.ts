"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { type ActionResult } from "@/lib/errors/app-error";

export const ContactInquirySchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre completo")
    .max(100)
    .regex(/^[^<>]*$/, "Caracteres inválidos detectados"),
  email: z.string().trim().email("Ingresá un correo electrónico válido").max(150),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9\s()-]*$/, "Formato de teléfono inválido")
    .optional(),
  subject: z
    .string()
    .trim()
    .min(4, "El asunto debe tener al menos 4 caracteres")
    .max(140)
    .regex(/^[^<>]*$/, "Caracteres inválidos detectados"),
  message: z
    .string()
    .trim()
    .min(10, "El mensaje debe tener al menos 10 caracteres")
    .max(2000)
    .regex(/^[^<>]*$/, "Caracteres inválidos detectados"),
});

export type ContactInquiryInput = z.infer<typeof ContactInquirySchema>;

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

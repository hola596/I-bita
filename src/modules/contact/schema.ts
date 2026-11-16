import { z } from "zod";

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

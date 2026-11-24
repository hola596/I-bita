import { z } from "zod";

export const ConsumerArrepentimientoSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Ingresá un correo electrónico válido para enviarte la constancia."),
  bookingCode: z
    .string()
    .trim()
    .max(80, "El código de reserva no puede superar 80 caracteres.")
    .optional()
    .default(""),
  reason: z
    .string()
    .trim()
    .max(1000, "El motivo no puede superar 1000 caracteres.")
    .optional()
    .default(""),
});

export type ConsumerArrepentimientoInput = z.input<
  typeof ConsumerArrepentimientoSchema
>;

export const ConsumerBajaSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Ingresá el correo electrónico de tu cuenta o suscripción."),
  accountReference: z
    .string()
    .trim()
    .max(80, "La referencia no puede superar 80 caracteres.")
    .optional()
    .default(""),
  reason: z
    .string()
    .trim()
    .max(1000, "El motivo no puede superar 1000 caracteres.")
    .optional()
    .default(""),
});

export type ConsumerBajaInput = z.input<typeof ConsumerBajaSchema>;

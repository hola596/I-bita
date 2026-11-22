import { z } from "zod";
import { isAddress, getAddress } from "viem";
import {
  ALLOWED_MAX_RESPONSE_HOURS,
  WEEKDAY_CODES,
  type MaxResponseHours,
} from "@/lib/host/response-schedule";

/**
 * Valida el dígito verificador Módulo 11 de un CUIT/CUIL argentino (11 dígitos).
 */
export function isValidArgentineCuit(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * (weights[i] ?? 0);
  }
  const mod = 11 - (sum % 11);
  const checkDigit = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return checkDigit === Number(digits[10]);
}

/**
 * Valida formato de CBU o CVU argentino (exactamente 22 dígitos numéricos).
 */
export function isValidCbuOrCvu(raw: string): boolean {
  const digits = raw.replace(/\s+/g, "");
  return /^\d{22}$/.test(digits);
}

export const HostResponseScheduleSchema = z
  .object({
    days: z
      .array(z.enum(WEEKDAY_CODES))
      .min(1, "Seleccioná al menos 1 día hábil de atención para responder reservas")
      .max(7)
      .transform((days) => WEEKDAY_CODES.filter((code) => days.includes(code))),
    startHour: z.coerce
      .number()
      .int("El horario de inicio debe ser una hora entera")
      .min(0, "La hora de inicio debe estar entre 00:00 y 22:00")
      .max(22, "La hora de inicio debe estar entre 00:00 y 22:00"),
    endHour: z.coerce
      .number()
      .int("El horario de cierre debe ser una hora entera")
      .min(2, "La hora de cierre debe ser entre 02:00 y 24:00")
      .max(24, "La hora de cierre debe ser entre 02:00 y 24:00"),
    maxResponseHours: z.coerce.number().refine(
      (n): n is MaxResponseHours =>
        (ALLOWED_MAX_RESPONSE_HOURS as ReadonlyArray<number>).includes(n),
      "Elegí un tiempo máximo de respuesta válido (1, 2, 4, 6 o 12 hs)."
    ),
    confirmedCommitment: z.literal(true, {
      errorMap: () => ({
        message:
          "Tenés que confirmar tu compromiso obligatorio de responder dentro de este intervalo.",
      }),
    }),
  })
  .refine((val) => val.endHour - val.startHour >= 2, {
    message:
      "El intervalo horario de respuesta debe abarcar al menos 2 horas por día.",
    path: ["endHour"],
  });

export type HostResponseScheduleInput = z.input<typeof HostResponseScheduleSchema>;
export type HostResponseScheduleOutput = z.output<typeof HostResponseScheduleSchema>;

export const UpdateHostResponseScheduleSchema = HostResponseScheduleSchema;

export const HostOnboardingSchema = z.object({
  fullName: z.string().trim().min(3, "El nombre completo debe tener al menos 3 caracteres").max(120),
  phoneWhatsapp: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/, "Ingresá un número de WhatsApp válido (ej: +5491123456789)"),
  cuitCuil: z
    .string()
    .trim()
    .refine(isValidArgentineCuit, "El CUIT/CUIL ingresado no supera la validación Módulo 11 de ARCA/AFIP"),
  payoutCbuCvu: z
    .string()
    .trim()
    .refine(isValidCbuOrCvu, "El CBU/CVU debe contener exactamente 22 dígitos numéricos"),
  payoutUsdtWallet: z
    .string()
    .trim()
    .refine((addr) => isAddress(addr, { strict: false }), "La dirección de Wallet USDT no es una dirección EVM/Polygon válida")
    .transform((addr) => getAddress(addr)),
  payoutSplitArsPct: z.coerce
    .number()
    .min(0, "El porcentaje en ARS debe estar entre 0% y 100%")
    .max(100, "El porcentaje en ARS debe estar entre 0% y 100%"),
  responseSchedule: HostResponseScheduleSchema.optional(),
});

export const HostOnboardingSubmissionSchema = HostOnboardingSchema.extend({
  responseSchedule: HostResponseScheduleSchema,
});

export type HostOnboardingInput = z.input<typeof HostOnboardingSubmissionSchema>;
export type HostOnboardingOutput = z.output<typeof HostOnboardingSubmissionSchema>;

export const BasicProfileUpdateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "El nombre completo debe tener al menos 3 caracteres")
    .max(120, "El nombre no puede superar los 120 caracteres"),
  phoneWhatsapp: z
    .string()
    .trim()
    .refine(
      (val) =>
        val === "" || /^\+?[0-9]{10,15}$/.test(val.replace(/[\s().-]/g, "")),
      "Ingresá un WhatsApp válido (ej: +5491123456789)"
    )
    .transform((val) =>
      val === "" ? null : val.replace(/[\s().-]/g, "")
    ),
});

export type BasicProfileUpdateInput = z.input<typeof BasicProfileUpdateSchema>;
export type BasicProfileUpdateOutput = z.output<typeof BasicProfileUpdateSchema>;

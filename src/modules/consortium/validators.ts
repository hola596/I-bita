import { z } from "zod";
import {
  isValidArgentineCuit,
  isValidCbuOrCvu,
} from "@/modules/auth/validators";

export const ALLOWED_MICRO_CANON_PCTS = [0, 1, 1.5, 2] as const;
export type MicroCanonPct = (typeof ALLOWED_MICRO_CANON_PCTS)[number];

/**
 * Formatea un CUIT/CUIL de 11 dígitos al estándar `XX-XXXXXXXX-X` (13 caracteres).
 */
export function formatArgentineCuit(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return raw.trim();
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10, 11)}`;
}

/**
 * Normaliza un número de WhatsApp al formato internacional E.164 (`+549...`).
 */
export function normalizeE164Whatsapp(raw: string): string {
  const trimmed = raw.trim().replace(/[\s()-]/g, "");
  if (!trimmed) return "";
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

/**
 * Valida que el identificador bancario del consorcio sea un CBU/CVU de 22 dígitos
 * o un Alias bancario argentino válido (6 a 60 caracteres alfanuméricos con punto o guion).
 */
export function isValidCbuOrAlias(raw: string): boolean {
  const cleaned = raw.trim();
  if (!cleaned) return true;
  if (/^\d+$/.test(cleaned.replace(/\s+/g, ""))) {
    return isValidCbuOrCvu(cleaned);
  }
  return /^[a-zA-Z0-9._-]{6,60}$/.test(cleaned);
}

export const UpsertConsortiumConfigSchema = z.object({
  propertyId: z
    .string()
    .trim()
    .uuid("El ID de la Unidad Funcional debe ser un UUID válido."),
  consortiumName: z
    .string()
    .trim()
    .min(
      3,
      "La razón social o nombre del consorcio debe tener al menos 3 caracteres."
    )
    .max(160, "El nombre del consorcio no puede superar los 160 caracteres."),
  consortiumCuit: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim().length === 0) return null;
      return formatArgentineCuit(val);
    })
    .refine(
      (val) => val === null || isValidArgentineCuit(val),
      "El CUIT del consorcio debe tener formato válido XX-XXXXXXXX-X y superar la validación Módulo 11 de ARCA/AFIP."
    ),
  porteriaWhatsapp: z
    .string()
    .trim()
    .transform(normalizeE164Whatsapp)
    .refine(
      (val) => /^\+[1-9]\d{9,14}$/.test(val) && val.length <= 30,
      "Ingresá el WhatsApp de portería/guardia en formato internacional E.164 (ej: +5491144556677)."
    ),
  adminEmail: z
    .string()
    .trim()
    .email("Ingresá un correo electrónico válido para la administración del consorcio.")
    .max(160, "El email de administración no puede superar los 160 caracteres.")
    .transform((val) => val.toLowerCase()),
  microCanonPct: z.coerce
    .number({
      invalid_type_error:
        "El porcentaje de Micro-Canon Consorcial debe ser un número válido.",
    })
    .refine(
      (val): val is MicroCanonPct =>
        (ALLOWED_MICRO_CANON_PCTS as readonly number[]).includes(val),
      "El porcentaje de Micro-Canon Consorcial debe ser estrictamente 0%, 1%, 1.5% o 2%."
    ),
  consortiumCbuAlias: z
    .string()
    .trim()
    .max(60, "El CBU/CVU o Alias del consorcio no puede superar los 60 caracteres.")
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || val.trim().length === 0) return null;
      return val.trim();
    })
    .refine(
      (val) => val === null || isValidCbuOrAlias(val),
      "Ingresá un CBU/CVU de 22 dígitos o un Alias bancario argentino válido (6 a 60 caracteres)."
    ),
  active: z.boolean().default(true),
  hostId: z.string().trim().uuid().optional(),
});

export const GetConsortiumConfigSchema = z.object({
  propertyId: z
    .string()
    .trim()
    .uuid("El ID de la Unidad Funcional debe ser un UUID válido."),
  hostId: z.string().trim().uuid().optional(),
});

export type UpsertConsortiumConfigInput = z.input<
  typeof UpsertConsortiumConfigSchema
>;
export type UpsertConsortiumConfigOutput = z.output<
  typeof UpsertConsortiumConfigSchema
>;
export type GetConsortiumConfigInput = z.input<typeof GetConsortiumConfigSchema>;

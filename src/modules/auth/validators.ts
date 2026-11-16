import { z } from "zod";
import { isAddress, getAddress } from "viem";

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
});

export type HostOnboardingInput = z.input<typeof HostOnboardingSchema>;
export type HostOnboardingOutput = z.output<typeof HostOnboardingSchema>;

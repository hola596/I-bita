import { z } from "zod";
import { AppError } from "@/lib/errors/app-error";
import { MidTermPolicySchema } from "./mid-term-policy";

export const PROPERTY_CORRIDORS = [
  "CABA",
  "COSTA_ATLANTICA",
  "CORDOBA",
  "VACA_MUERTA",
] as const;

export type PropertyCorridor = (typeof PROPERTY_CORRIDORS)[number];

export const CORRIDOR_LABELS: Record<PropertyCorridor, string> = {
  CABA: "CABA (Palermo, Recoleta, Belgrano, Núñez)",
  COSTA_ATLANTICA: "Costa Atlántica (Mar del Plata, Pinamar, Cariló)",
  CORDOBA: "Sierras de Córdoba y Capital",
  VACA_MUERTA: "Corredor Corporativo / Vaca Muerta (Neuquén, Añelo)",
};

export const PROPERTY_CURRENCIES = ["ARS", "USD", "USDT"] as const;
export type PropertyCurrency = (typeof PROPERTY_CURRENCIES)[number];

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/webp",
  "image/avif",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB máximo por foto
export const MAX_PROPERTY_IMAGES = 10;
export const DEFAULT_IMAGE_WIDTH = 1200;
export const DEFAULT_IMAGE_HEIGHT = 900;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyPropertyTitle(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export const PropertyImageSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "La URL de la imagen es obligatoria")
    .refine(
      (val) =>
        val.startsWith("https://") ||
        val.startsWith("/") ||
        /^data:image\/(webp|avif|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(val),
      "La imagen debe servirse por HTTPS, ruta local segura o formato optimizado WebP/AVIF/JPEG/PNG"
    ),
  alt: z
    .string()
    .trim()
    .min(3, "El texto alternativo (alt) debe tener al menos 3 caracteres para accesibilidad WCAG AAA")
    .max(180, "El texto alternativo no puede superar los 180 caracteres"),
  width: z
    .number()
    .int()
    .min(400, "El ancho mínimo de foto optimizada es 400px (CLS = 0)")
    .max(7680, "El ancho máximo permitido es 7680px")
    .default(DEFAULT_IMAGE_WIDTH),
  height: z
    .number()
    .int()
    .min(300, "El alto mínimo de foto optimizada es 300px (CLS = 0)")
    .max(4320, "El alto máximo permitido es 4320px")
    .default(DEFAULT_IMAGE_HEIGHT),
  mimeType: z
    .enum(ALLOWED_IMAGE_MIME_TYPES, {
      errorMap: () => ({
        message: "Formato de imagen inválido. Solo se aceptan WebP, AVIF, JPEG o PNG.",
      }),
    })
    .default("image/webp"),
  sizeBytes: z
    .number()
    .int()
    .positive("El tamaño del archivo debe ser mayor a 0 bytes")
    .max(
      MAX_IMAGE_SIZE_BYTES,
      "Cada fotografía optimizada no puede superar el tamaño máximo de 5 MB (5.242.880 bytes)"
    )
    .default(245_000),
});

export type PropertyImageItem = z.infer<typeof PropertyImageSchema>;

export const PhotoUploadCheckSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1, "Nombre de archivo requerido")
    .refine(
      (name) => /\.(webp|avif|jpe?g|png)$/i.test(name),
      "Extensión de archivo no permitida. Use .webp, .avif, .jpg, .jpeg o .png"
    ),
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES, {
    errorMap: () => ({
      message: "Formato MIME no permitido. Use image/webp, image/avif, image/jpeg o image/png",
    }),
  }),
  sizeBytes: z
    .number()
    .int()
    .positive("El archivo de imagen está vacío")
    .max(
      MAX_IMAGE_SIZE_BYTES,
      "La imagen excede el límite máximo de 5 MB permitido por unidad funcional"
    ),
  width: z.number().int().min(400).max(7680).default(DEFAULT_IMAGE_WIDTH),
  height: z.number().int().min(300).max(4320).default(DEFAULT_IMAGE_HEIGHT),
});

export type PhotoUploadCheckInput = z.input<typeof PhotoUploadCheckSchema>;

export function validatePhotoUpload(input: PhotoUploadCheckInput) {
  const parsed = PhotoUploadCheckSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Archivo de imagen inválido",
      422,
      parsed.error.flatten()
    );
  }
  return parsed.data;
}

export const CreatePropertyBaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "El título de la Unidad Funcional debe tener al menos 5 caracteres")
    .max(140, "El título no puede superar los 140 caracteres"),
  slug: z
    .string()
    .trim()
    .min(3, "El slug debe tener entre 3 y 120 caracteres")
    .max(120, "El slug no puede superar los 120 caracteres")
    .regex(
      SLUG_REGEX,
      "El slug debe ser URL-safe (solo minúsculas, números y guiones medios, ej: palermo-loft-4b)"
    ),
  description: z
    .string()
    .trim()
    .min(20, "La descripción debe detallar la unidad con al menos 20 caracteres")
    .max(4000, "La descripción no puede superar los 4000 caracteres"),
  corridor: z.enum(PROPERTY_CORRIDORS, {
    errorMap: () => ({
      message:
        "Corredor geográfico inválido. Valores permitidos: CABA, COSTA_ATLANTICA, CORDOBA, VACA_MUERTA",
    }),
  }),
  address_line: z
    .string()
    .trim()
    .min(5, "La dirección física debe tener al menos 5 caracteres")
    .max(200, "La dirección no puede superar los 200 caracteres"),
  unit_identifier: z
    .string()
    .trim()
    .min(1, "Indicá la Unidad Funcional (ej: Piso 4 Depto B / UF 12)")
    .max(40, "El identificador de unidad no puede superar los 40 caracteres"),
  max_adults: z.coerce
    .number()
    .int("La capacidad de adultos debe ser un número entero")
    .min(1, "La capacidad mínima es de 1 adulto")
    .max(20, "La capacidad máxima permitida es de 20 adultos"),
  base_currency: z.enum(PROPERTY_CURRENCIES, {
    errorMap: () => ({
      message: "Moneda base inválida. Valores permitidos: ARS, USD, USDT",
    }),
  }),
  nightly_rate: z.coerce
    .number()
    .positive("La tarifa base por noche debe ser mayor a 0")
    .max(50_000_000, "La tarifa por noche excede el límite permitido"),
  monthly_discount_pct: z.coerce
    .number()
    .min(
      15,
      "El descuento mensual de Media Estadía (30 a 180 noches) debe ser de al menos 15%"
    )
    .max(
      50,
      "El descuento mensual de Media Estadía no puede superar el 50%"
    )
    .default(20),
  absorb_installments_cost: z.boolean().default(false),
  accepts_usdt: z.boolean().default(true),
  wifi_speed_mbps: z.coerce
    .number()
    .int()
    .min(1, "La velocidad de Wi-Fi debe ser mayor a 0 Mbps")
    .max(10000, "La velocidad de Wi-Fi no puede superar 10.000 Mbps")
    .nullable()
    .optional()
    .default(300),
  images: z
    .array(PropertyImageSchema)
    .min(1, "Debés incluir al menos 1 fotografía optimizada de la Unidad Funcional")
    .max(MAX_PROPERTY_IMAGES, `Máximo ${MAX_PROPERTY_IMAGES} fotografías por propiedad`),
  accessCodePlain: z
    .string()
    .trim()
    .min(
      4,
      "El PIN o instrucciones de cerradura electrónica debe tener al menos 4 caracteres"
    )
    .max(
      240,
      "Las instrucciones de cerradura electrónica no pueden superar los 240 caracteres"
    ),
  midTermPolicy: MidTermPolicySchema.optional(),
  is_published: z.boolean().default(true),
});

export type CreatePropertyInput = z.input<typeof CreatePropertyBaseSchema> & {
  addressLine?: string;
  unitIdentifier?: string;
  maxAdults?: number;
  baseCurrency?: PropertyCurrency;
  nightlyRate?: number;
  monthlyDiscountPct?: number;
  absorbInstallmentsCost?: boolean;
  acceptsUsdt?: boolean;
  wifiSpeedMbps?: number | null;
  isPublished?: boolean;
};

export type CreatePropertyPayload = z.output<typeof CreatePropertyBaseSchema>;

export const CreatePropertySchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    address_line: obj.address_line ?? obj.addressLine,
    unit_identifier: obj.unit_identifier ?? obj.unitIdentifier,
    max_adults: obj.max_adults ?? obj.maxAdults,
    base_currency: obj.base_currency ?? obj.baseCurrency,
    nightly_rate: obj.nightly_rate ?? obj.nightlyRate,
    monthly_discount_pct: obj.monthly_discount_pct ?? obj.monthlyDiscountPct ?? 20,
    absorb_installments_cost:
      obj.absorb_installments_cost ?? obj.absorbInstallmentsCost ?? false,
    accepts_usdt: obj.accepts_usdt ?? obj.acceptsUsdt ?? true,
    wifi_speed_mbps: obj.wifi_speed_mbps ?? obj.wifiSpeedMbps ?? 300,
    midTermPolicy: obj.midTermPolicy ?? obj.mid_term_policy,
    is_published: obj.is_published ?? obj.isPublished ?? true,
  };
}, CreatePropertyBaseSchema);

export const UpdatePropertySchema = CreatePropertyBaseSchema.partial().extend({
  id: z.string().uuid("ID de propiedad inválido"),
  accessCodePlain: z
    .string()
    .trim()
    .min(4, "El nuevo PIN de acceso debe tener al menos 4 caracteres")
    .max(240, "El PIN de acceso no puede superar los 240 caracteres")
    .optional(),
});

export type UpdatePropertyInput = z.input<typeof UpdatePropertySchema>;

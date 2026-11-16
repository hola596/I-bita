import { z } from "zod";

export const ICAL_DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires" as const;
export const ICAL_PROD_ID = "//I-bita Argentina//Channel Manager//ES" as const;

export const ICAL_SOURCES = [
  "Airbnb",
  "Booking.com",
  "Vrbo",
  "Temporarios Externo",
] as const;

export type IcalSourceName = (typeof ICAL_SOURCES)[number];

export const RegisterIcalFeedSchema = z.object({
  propertyId: z
    .string()
    .trim()
    .uuid("El identificador de la Unidad Funcional (propertyId) debe ser un UUID válido."),
  sourceName: z
    .string()
    .trim()
    .min(2, "El nombre de la fuente iCal debe tener al menos 2 caracteres (ej. Airbnb).")
    .max(50, "El nombre de la fuente iCal no puede superar los 50 caracteres.")
    .default("Airbnb"),
  feedUrl: z
    .string()
    .trim()
    .min(8, "La URL del calendario .ics es obligatoria.")
    .max(2048, "La URL del calendario .ics no puede superar los 2048 caracteres."),
});

export type RegisterIcalFeedInput = z.input<typeof RegisterIcalFeedSchema>;
export type RegisterIcalFeedPayload = z.output<typeof RegisterIcalFeedSchema>;

export const SyncIcalFeedSchema = z.object({
  propertyId: z
    .string()
    .trim()
    .uuid("El identificador de la Unidad Funcional (propertyId) debe ser un UUID válido."),
  feedUrl: z
    .string()
    .trim()
    .min(8, "La URL del calendario .ics es obligatoria.")
    .max(2048, "La URL del calendario .ics no puede superar los 2048 caracteres."),
  sourceName: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .optional()
    .default("Airbnb"),
  feedId: z.string().trim().uuid().optional(),
});

export type SyncIcalFeedInput = z.input<typeof SyncIcalFeedSchema>;
export type SyncIcalFeedPayload = z.output<typeof SyncIcalFeedSchema>;

export const SyncExternalIcalSchema = SyncIcalFeedSchema;
export type SyncExternalIcalInput = SyncIcalFeedInput;

export const PropertyIdParamSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/\.ics$/i, "").trim())
  .pipe(
    z
      .string()
      .uuid("El parámetro propertyId debe ser un UUID v4 válido.")
  );

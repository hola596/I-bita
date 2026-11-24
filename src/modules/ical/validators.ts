import { z } from "zod";
import {
  ICAL_PLATFORM_SOURCES,
  normalizeExternalIcalUrlInput,
  type IcalPlatformSource,
} from "@/lib/ical/platform-guides";

export const ICAL_DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires" as const;
export const ICAL_PROD_ID = "//I-bita Argentina//Channel Manager//ES" as const;

export const ICAL_SOURCES = ICAL_PLATFORM_SOURCES;

export type IcalSourceName = IcalPlatformSource;

const normalizedUrlStringSchema = z
  .string()
  .trim()
  .min(8, "La URL del calendario .ics es obligatoria.")
  .max(2048, "La URL del calendario .ics no puede superar los 2048 caracteres.")
  .transform((val) => normalizeExternalIcalUrlInput(val).normalizedUrl);

export const RegisterIcalFeedSchema = z.object({
  propertyId: z
    .string()
    .trim()
    .uuid(
      "El identificador de la Unidad Funcional (propertyId) debe ser un UUID válido."
    ),
  sourceName: z
    .string()
    .trim()
    .min(
      2,
      "El nombre de la fuente iCal debe tener al menos 2 caracteres (ej. Airbnb)."
    )
    .max(50, "El nombre de la fuente iCal no puede superar los 50 caracteres.")
    .default("Airbnb"),
  feedUrl: normalizedUrlStringSchema,
});

export type RegisterIcalFeedInput = z.input<typeof RegisterIcalFeedSchema>;
export type RegisterIcalFeedPayload = z.output<typeof RegisterIcalFeedSchema>;

export const SyncIcalFeedSchema = z.object({
  propertyId: z
    .string()
    .trim()
    .uuid(
      "El identificador de la Unidad Funcional (propertyId) debe ser un UUID válido."
    ),
  feedUrl: normalizedUrlStringSchema,
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

export const TestExternalIcalSchema = z.object({
  feedUrl: normalizedUrlStringSchema,
  sourceName: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .optional()
    .default("Airbnb"),
});

export type TestExternalIcalInput = z.input<typeof TestExternalIcalSchema>;

export const DeleteIcalFeedSchema = z.object({
  feedId: z.string().trim().uuid("El feedId debe ser un UUID válido."),
  propertyId: z
    .string()
    .trim()
    .uuid("El propertyId debe ser un UUID válido."),
});

export type DeleteIcalFeedInput = z.input<typeof DeleteIcalFeedSchema>;

export const ConfirmIcalExportSchema = z.object({
  feedId: z.string().trim().uuid("El feedId debe ser un UUID válido."),
  propertyId: z
    .string()
    .trim()
    .uuid("El propertyId debe ser un UUID válido."),
  confirmed: z.boolean().default(true),
});

export type ConfirmIcalExportInput = z.input<typeof ConfirmIcalExportSchema>;

export const HostCalendarFeedPreferenceSchema = z.object({
  sourceName: z.enum(ICAL_PLATFORM_SOURCES),
  feedUrl: normalizedUrlStringSchema,
  validatedAt: z.string().nullable().optional(),
  detectedEventsCount: z.number().int().min(0).nullable().optional(),
  nextBlockedRange: z
    .object({
      checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .nullable()
    .optional(),
});

export const HostCalendarSyncPreferencesSchema = z.object({
  mode: z.enum(["ibita_only", "external_sync"]).default("ibita_only"),
  selectedSources: z.array(z.enum(ICAL_PLATFORM_SOURCES)).default([]),
  feeds: z.array(HostCalendarFeedPreferenceSchema).max(10).default([]),
  updatedAt: z.string().nullable().optional(),
});

export const PropertyIdParamSchema = z
  .string()
  .trim()
  .transform((val) => val.replace(/\.ics$/i, "").trim())
  .pipe(z.string().uuid("El parámetro propertyId debe ser un UUID v4 válido."));

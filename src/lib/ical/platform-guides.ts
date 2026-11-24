export const ICAL_PLATFORM_SOURCES = [
  "Airbnb",
  "Booking.com",
  "Google Calendar",
  "Apple Calendar / Otro",
  "Vrbo",
  "Temporarios Externo",
] as const;

export type IcalPlatformSource = (typeof ICAL_PLATFORM_SOURCES)[number];

export interface IcalPlatformGuide {
  source: IcalPlatformSource;
  label: string;
  shortTagline: string;
  syncFrequencyLabel: string;
  recommendedExportScope: "native" | "all";
  urlPlaceholder: string;
  importSteps: readonly [string, string, string];
  exportSteps: readonly [string, string, string];
  platformWarning?: string;
}

export const ICAL_PLATFORM_GUIDES: Record<IcalPlatformSource, IcalPlatformGuide> = {
  Airbnb: {
    source: "Airbnb",
    label: "Airbnb",
    shortTagline: "Sincronización bidireccional por .ics",
    syncFrequencyLabel: "Airbnb actualiza cada ~3 hs",
    recommendedExportScope: "native",
    urlPlaceholder: "https://www.airbnb.com.ar/calendar/ical/123456789.ics?s=...",
    importSteps: [
      "Entrá a tu anuncio en Airbnb → Calendario → Disponibilidad.",
      "Hacé clic en Conectar calendarios → Exportar calendario.",
      "Copiá el enlace .ics que te da Airbnb y pegalo acá abajo.",
    ],
    exportSteps: [
      "Copiá el enlace .ics de I-bita con el botón de abajo.",
      "En Airbnb, abrí Calendario → Disponibilidad → Importar calendario.",
      "Pegá el enlace, ponele de nombre 'I-bita' y guardá.",
    ],
  },
  "Booking.com": {
    source: "Booking.com",
    label: "Booking.com",
    shortTagline: "Sincronización Extranet / Partner Hub",
    syncFrequencyLabel: "Booking actualiza cada ~2 hs",
    recommendedExportScope: "native",
    urlPlaceholder: "https://ical.booking.com/v1/export?t=...",
    importSteps: [
      "Ingresá a tu Extranet de Booking → Tarifas y disponibilidad → Calendario.",
      "Abrí Sincronizar calendarios → Importar y exportar calendarios.",
      "Tocá Exportar tu calendario (Copiar enlace) y pegalo acá.",
    ],
    exportSteps: [
      "Copiá el enlace .ics de I-bita con el botón de abajo.",
      "En la Extranet de Booking, tocá Agregar conexión de calendario.",
      "Pegá el enlace de I-bita, nombralo 'I-bita' y confirmá.",
    ],
    platformWarning:
      "Importante sobre Booking.com: según su documentación oficial, Booking oculta las opciones iCal si el tipo de alojamiento tiene más de 1 unidad física en el mismo anuncio.",
  },
  "Google Calendar": {
    source: "Google Calendar",
    label: "Google Calendar",
    shortTagline: "Bloqueos personales y calendario de lectura",
    syncFrequencyLabel: "Google actualiza cada 12 a 24 hs",
    recommendedExportScope: "all",
    urlPlaceholder:
      "https://calendar.google.com/calendar/ical/.../private-.../basic.ics",
    importSteps: [
      "Abrí Google Calendar desde la computadora (web) y tocá el ícono Configuración.",
      "Elegí tu calendario a la izquierda y entrá en Integrar el calendario.",
      "Copiá la 'Dirección secreta en formato iCal' (no el enlace web).",
    ],
    exportSteps: [
      "Copiá el enlace consolidado para Google / Apple Calendar de abajo.",
      "En Google Calendar (web), tocá '+' junto a Otros calendarios → Desde URL.",
      "Pegá el enlace y tocá Agregar calendario para ver tus reservas.",
    ],
    platformWarning:
      "Tené en cuenta que Google Calendar refresca calendarios externos cada 12 a 24 hs (sin botón manual). Es ideal para importar tus bloqueos personales hacia I-bita, no como puente rápido hacia Airbnb o Booking.",
  },
  "Apple Calendar / Otro": {
    source: "Apple Calendar / Otro",
    label: "Apple Calendar / Otro",
    shortTagline: "Enlaces webcal:// o .ics estándar RFC 5545",
    syncFrequencyLabel: "Según configuración de tu app",
    recommendedExportScope: "all",
    urlPlaceholder: "webcal://p01-caldav.icloud.com/published/2/...",
    importSteps: [
      "Abrí Calendario en iCloud / Apple o tu plataforma de alquiler.",
      "Activá 'Calendario público' o buscá 'Exportar enlace iCal (.ics)'.",
      "Copiá la URL (aceptamos webcal:// o https://) y pegala acá.",
    ],
    exportSteps: [
      "Copiá el enlace consolidado de I-bita (.ics).",
      "En Calendario de Apple elegí Archivo → Nueva suscripción a calendario.",
      "Pegá el enlace y elegí actualizar cada 15 minutos o cada hora.",
    ],
  },
  Vrbo: {
    source: "Vrbo",
    label: "Vrbo",
    shortTagline: "Calendario de exportación/importación Vrbo",
    syncFrequencyLabel: "Vrbo actualiza periódicamente",
    recommendedExportScope: "native",
    urlPlaceholder: "https://www.vrbo.com/icalendar/...",
    importSteps: [
      "Entrá al calendario de tu propiedad en Vrbo.",
      "Abrí Importar y exportar → Exportar calendario.",
      "Copiá el enlace .ics y pegalo acá.",
    ],
    exportSteps: [
      "Copiá el enlace .ics de I-bita (modo nativo).",
      "En Vrbo abrí Importar calendario y pegá el enlace.",
      "Guardá la conexión con el nombre 'I-bita'.",
    ],
  },
  "Temporarios Externo": {
    source: "Temporarios Externo",
    label: "Otro portal .ics",
    shortTagline: "Alohar, PMS propio o cualquier feed RFC 5545",
    syncFrequencyLabel: "I-bita revisa cada 20 min",
    recommendedExportScope: "native",
    urlPlaceholder: "https://tu-portal.com/calendars/unidad-1.ics",
    importSteps: [
      "Ingresá a tu portal o channel manager externo.",
      "Buscá la sección 'Exportar calendario iCal (.ics)'.",
      "Copiá el enlace completo y pegalo acá.",
    ],
    exportSteps: [
      "Copiá el enlace .ics de I-bita (modo nativo).",
      "Pegalo en la sección 'Importar calendario externo' de tu otro portal.",
      "Confirmá la vinculación bidireccional.",
    ],
  },
};

export const PRIMARY_ONBOARDING_ICAL_SOURCES: readonly IcalPlatformSource[] = [
  "Airbnb",
  "Booking.com",
  "Google Calendar",
  "Apple Calendar / Otro",
] as const;

export function normalizeExternalIcalUrlInput(raw: string): {
  normalizedUrl: string;
  convertedWebcal: boolean;
} {
  const trimmed = raw.trim();
  if (/^webcals?:\/\//i.test(trimmed)) {
    return {
      normalizedUrl: trimmed.replace(/^webcals?:\/\//i, "https://"),
      convertedWebcal: true,
    };
  }
  return {
    normalizedUrl: trimmed,
    convertedWebcal: false,
  };
}

export interface ClientIcalUrlDiagnosis {
  status: "empty" | "valid" | "warning" | "error";
  normalizedUrl: string;
  convertedWebcal: boolean;
  message: string;
  actionHint?: string;
}

export function diagnoseIcalUrlClient(
  rawUrl: string,
  sourceName?: IcalPlatformSource
): ClientIcalUrlDiagnosis {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      status: "empty",
      normalizedUrl: "",
      convertedWebcal: false,
      message: "",
    };
  }

  const { normalizedUrl, convertedWebcal } =
    normalizeExternalIcalUrlInput(trimmed);

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return {
      status: "error",
      normalizedUrl,
      convertedWebcal,
      message: "Falta el inicio https:// (o webcal://) en el enlace.",
      actionHint:
        "Copiá el enlace completo tal como te lo entrega la plataforma.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return {
      status: "error",
      normalizedUrl,
      convertedWebcal,
      message: "El formato de la URL no es válido.",
      actionHint: "Revisá que no falten caracteres ni haya espacios en medio.",
    };
  }

  const host = parsed.hostname.toLowerCase();
  const pathLower = parsed.pathname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    host === "169.254.169.254"
  ) {
    return {
      status: "error",
      normalizedUrl,
      convertedWebcal,
      message: "Ese enlace apunta a una red local o privada no permitida.",
      actionHint:
        "Pegá la dirección pública externa (https://) generada por tu calendario.",
    };
  }

  if (
    host.includes("airbnb.") &&
    (pathLower.includes("/rooms/") ||
      (pathLower.includes("/hosting/") && !pathLower.includes(".ics")))
  ) {
    return {
      status: "error",
      normalizedUrl,
      convertedWebcal,
      message:
        "Pegaste el enlace público o del panel de tu anuncio, no el calendario .ics.",
      actionHint:
        "En Airbnb entrá a Calendario → Disponibilidad → Conectar calendarios → Exportar calendario.",
    };
  }

  if (
    host === "calendar.google.com" &&
    (pathLower.startsWith("/calendar/u/") ||
      pathLower.startsWith("/calendar/r") ||
      pathLower.includes("/embed"))
  ) {
    return {
      status: "error",
      normalizedUrl,
      convertedWebcal,
      message:
        "Pegaste la vista web de Google Calendar, no la dirección secreta en formato iCal.",
      actionHint:
        "En Google Calendar abrí Configuración → [Tu calendario] → Integrar el calendario → Dirección secreta en formato iCal (.ics).",
    };
  }

  if (host.includes("admin.booking.com")) {
    return {
      status: "error",
      normalizedUrl,
      convertedWebcal,
      message:
        "Pegaste la URL de la Extranet de Booking, no el enlace .ics de exportación.",
      actionHint:
        "Dentro de la Extranet abrí Tarifas y disponibilidad → Calendario → Sincronizar calendarios → Exportar tu calendario.",
    };
  }

  if (
    sourceName === "Google Calendar" &&
    host === "calendar.google.com" &&
    !pathLower.includes("/ical/")
  ) {
    return {
      status: "warning",
      normalizedUrl,
      convertedWebcal,
      message:
        "Verificá que sea la 'Dirección secreta en formato iCal' (termina en basic.ics).",
    };
  }

  if (convertedWebcal) {
    return {
      status: "valid",
      normalizedUrl,
      convertedWebcal: true,
      message:
        "Convertimos automáticamente webcal:// a https:// para validarlo de forma segura.",
    };
  }

  return {
    status: "valid",
    normalizedUrl,
    convertedWebcal: false,
    message:
      "Formato de enlace válido. Podés probar la conexión ahora para verificar tus fechas.",
  };
}

export interface HostCalendarFeedPreference {
  sourceName: IcalPlatformSource;
  feedUrl: string;
  validatedAt?: string | null;
  detectedEventsCount?: number | null;
  nextBlockedRange?: { checkIn: string; checkOut: string } | null;
}

export interface HostCalendarSyncPreferences {
  mode: "ibita_only" | "external_sync";
  selectedSources: IcalPlatformSource[];
  feeds: HostCalendarFeedPreference[];
  updatedAt?: string | null;
}

export function createDefaultHostCalendarSyncPreferences(): HostCalendarSyncPreferences {
  return {
    mode: "ibita_only",
    selectedSources: [],
    feeds: [],
    updatedAt: null,
  };
}

export function normalizeHostCalendarSyncPreferences(
  raw: unknown
): HostCalendarSyncPreferences {
  const fallback = createDefaultHostCalendarSyncPreferences();
  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const obj = raw as Record<string, unknown>;
  const mode =
    obj.mode === "external_sync" ? "external_sync" : "ibita_only";

  const validSourceSet = new Set<string>(ICAL_PLATFORM_SOURCES);

  const selectedSources = Array.isArray(obj.selectedSources)
    ? Array.from(
        new Set(
          obj.selectedSources.filter(
            (s): s is IcalPlatformSource =>
              typeof s === "string" && validSourceSet.has(s)
          )
        )
      )
    : [];

  const feeds: HostCalendarFeedPreference[] = [];
  if (Array.isArray(obj.feeds)) {
    for (const item of obj.feeds) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const sourceName =
        typeof rec.sourceName === "string" && validSourceSet.has(rec.sourceName)
          ? (rec.sourceName as IcalPlatformSource)
          : null;
      const rawUrl = typeof rec.feedUrl === "string" ? rec.feedUrl.trim() : "";
      if (!sourceName || rawUrl.length < 8) continue;

      const { normalizedUrl } = normalizeExternalIcalUrlInput(rawUrl);
      const nextRangeRaw =
        rec.nextBlockedRange && typeof rec.nextBlockedRange === "object"
          ? (rec.nextBlockedRange as Record<string, unknown>)
          : null;
      const nextBlockedRange =
        nextRangeRaw &&
        typeof nextRangeRaw.checkIn === "string" &&
        typeof nextRangeRaw.checkOut === "string"
          ? {
              checkIn: nextRangeRaw.checkIn,
              checkOut: nextRangeRaw.checkOut,
            }
          : null;

      feeds.push({
        sourceName,
        feedUrl: normalizedUrl,
        validatedAt:
          typeof rec.validatedAt === "string" ? rec.validatedAt : null,
        detectedEventsCount:
          typeof rec.detectedEventsCount === "number"
            ? rec.detectedEventsCount
            : null,
        nextBlockedRange,
      });
    }
  }

  return {
    mode: mode === "external_sync" || feeds.length > 0 ? "external_sync" : "ibita_only",
    selectedSources:
      selectedSources.length > 0
        ? selectedSources
        : Array.from(new Set(feeds.map((f) => f.sourceName))),
    feeds,
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : null,
  };
}

import type { PropertyCorridor } from "@/modules/properties/validators";

export interface PropertyLocationMapData {
  query: string;
  embedUrl: string;
  expandedEmbedUrl: string;
  displayAddress: string;
  zoneLabel: string;
}

const KNOWN_ARGENTINE_ZONES: ReadonlyArray<{
  normalized: string;
  label: string;
}> = [
  { normalized: "palermo soho", label: "Palermo Soho" },
  { normalized: "palermo", label: "Palermo" },
  { normalized: "recoleta", label: "Recoleta" },
  { normalized: "belgrano", label: "Belgrano" },
  { normalized: "nunez", label: "Núñez" },
  { normalized: "puerto madero", label: "Puerto Madero" },
  { normalized: "san telmo", label: "San Telmo" },
  { normalized: "caballito", label: "Caballito" },
  { normalized: "pinamar", label: "Pinamar" },
  { normalized: "carilo", label: "Cariló" },
  { normalized: "mar del plata", label: "Mar del Plata" },
  { normalized: "anelo", label: "Añelo" },
  { normalized: "neuquen", label: "Neuquén" },
  { normalized: "cordoba", label: "Córdoba" },
];

const COASTAL_CITIES_NORMALIZED = [
  "mar del plata",
  "pinamar",
  "carilo",
  "villa gesell",
  "miramar",
  "necochea",
  "ostende",
  "valeria del mar",
] as const;

const CORRIDOR_FALLBACK_ZONES: Record<PropertyCorridor, string> = {
  CABA: "CABA",
  COSTA_ATLANTICA: "Costa Atlántica",
  CORDOBA: "Córdoba",
  VACA_MUERTA: "Neuquén",
};

function sanitizeLocationText(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveRegionSuffix(
  cleanAddress: string,
  corridor: PropertyCorridor
): string {
  const normalizedAddr = normalizeForMatch(cleanAddress);

  switch (corridor) {
    case "CABA":
      return "Ciudad Autónoma de Buenos Aires, Argentina";
    case "COSTA_ATLANTICA": {
      const hasCoastalCity = COASTAL_CITIES_NORMALIZED.some((city) =>
        normalizedAddr.includes(city)
      );
      return hasCoastalCity
        ? "Buenos Aires, Argentina"
        : "Mar del Plata, Buenos Aires, Argentina";
    }
    case "CORDOBA":
      return "Córdoba, Argentina";
    case "VACA_MUERTA":
      return normalizedAddr.includes("anelo")
        ? "Neuquén, Argentina"
        : "Neuquén, Argentina";
    default:
      return "Argentina";
  }
}

function resolveZoneLabel(
  cleanAddress: string,
  cleanTitle: string,
  corridor: PropertyCorridor
): string {
  const combinedNormalized = normalizeForMatch(`${cleanTitle} ${cleanAddress}`);
  for (const zone of KNOWN_ARGENTINE_ZONES) {
    if (combinedNormalized.includes(zone.normalized)) {
      return zone.label;
    }
  }
  return CORRIDOR_FALLBACK_ZONES[corridor] ?? "Argentina";
}

/**
 * Construye URLs seguras de mapa embebido y etiquetas limpias de ubicación
 * para un alojamiento a partir de su dirección y corredor geográfico.
 */
export function buildPropertyLocationMapData({
  addressLine,
  corridor,
  title = "",
}: {
  addressLine: string;
  corridor: PropertyCorridor;
  title?: string;
}): PropertyLocationMapData {
  const cleanAddress = sanitizeLocationText(addressLine);
  const cleanTitle = sanitizeLocationText(title);
  const displayAddress = cleanAddress || CORRIDOR_FALLBACK_ZONES[corridor] || "Argentina";
  const zoneLabel = resolveZoneLabel(cleanAddress, cleanTitle, corridor);
  const regionSuffix = resolveRegionSuffix(cleanAddress, corridor);

  const normalizedAddr = normalizeForMatch(displayAddress);
  const alreadyHasArgentina = normalizedAddr.includes("argentina");
  const query = alreadyHasArgentina
    ? displayAddress
    : `${displayAddress}, ${regionSuffix}`;

  const encodedQuery = encodeURIComponent(query);

  return {
    query,
    embedUrl: `https://www.google.com/maps?q=${encodedQuery}&z=15&hl=es-419&output=embed`,
    expandedEmbedUrl: `https://www.google.com/maps?q=${encodedQuery}&z=16&hl=es-419&output=embed`,
    displayAddress,
    zoneLabel,
  };
}

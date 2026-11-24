export const ARGENTINE_JURISDICTIONS = [
  "CABA",
  "PBA",
  "CORDOBA",
  "NEUQUEN",
  "MENDOZA",
  "SANTA_FE",
  "RIO_NEGRO",
  "OTRA",
] as const;

export type ArgentineJurisdiction = (typeof ARGENTINE_JURISDICTIONS)[number];

export const JURISDICTION_LABELS: Record<ArgentineJurisdiction, string> = {
  CABA: "Ciudad Autónoma de Buenos Aires (CABA · Ley 6255 RPATT)",
  PBA: "Provincia de Buenos Aires (Costa Atlántica / GBA / Interior)",
  CORDOBA: "Provincia de Córdoba",
  NEUQUEN: "Provincia de Neuquén",
  MENDOZA: "Provincia de Mendoza",
  SANTA_FE: "Provincia de Santa Fe",
  RIO_NEGRO: "Provincia de Río Negro",
  OTRA: "Otra jurisdicción de la República Argentina",
};

export const DDJJ_CONSORCIO_VERSION = "2026.1-AR" as const;

/**
 * Regla regulatoria PSAV (CNV - Ley 27.739 / RG 994, 1058, 1172):
 * Deshabilitado por defecto en producción hasta migrar a esquema estrictamente
 * no custodial (P2P billetera-a-billetera) o contar con inscripción PSAV vigente.
 */
export function isCryptoPaymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS === "true";
}

export function requiresRpattRegistration(
  jurisdiction: string | null | undefined
): boolean {
  return jurisdiction === "CABA";
}

export function defaultJurisdictionForCorridor(
  corridor: string | null | undefined
): ArgentineJurisdiction {
  switch (corridor) {
    case "CABA":
      return "CABA";
    case "COSTA_ATLANTICA":
      return "PBA";
    case "CORDOBA":
      return "CORDOBA";
    case "VACA_MUERTA":
      return "NEUQUEN";
    default:
      return "CABA";
  }
}

/**
 * Determina si una ficha o imagen corresponde a material ilustrativo / demo
 * (ej. imágenes de stock de images.unsplash.com o IDs/slugs de demostración),
 * para exhibir obligatoriamente la etiqueta "Propiedad de demostración · Imágenes ilustrativas".
 */
export function isDemoOrUnsplashProperty(params: {
  id?: string | null;
  slug?: string | null;
  images?: ReadonlyArray<{ url?: string | null }> | null;
  coverUrl?: string | null;
}): boolean {
  const id = (params.id ?? "").toLowerCase();
  const slug = (params.slug ?? "").toLowerCase();
  if (id.startsWith("demo-") || slug.startsWith("demo-")) {
    return true;
  }
  if (params.coverUrl && params.coverUrl.includes("images.unsplash.com")) {
    return true;
  }
  if (
    params.images &&
    params.images.some((img) => (img?.url ?? "").includes("images.unsplash.com"))
  ) {
    return true;
  }
  return false;
}

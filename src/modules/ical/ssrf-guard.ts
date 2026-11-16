import "server-only";
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import ssrfReqFilter from "ssrf-req-filter";
import { AppError } from "@/lib/errors/app-error";

export type DnsLookupRecord = {
  address: string;
  family: number;
};

export type DnsLookupAllFn = (
  hostname: string
) => Promise<DnsLookupRecord[]>;

const BLOCKED_EXACT_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "0.0.0.0",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
  ".lan",
  ".intranet",
  ".corp",
] as const;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Normaliza un hostname eliminando corchetes IPv6 (`[::1]` -> `::1`),
 * puntos finales de FQDN y convirtiendo a minúsculas.
 */
export function normalizeHostname(rawHostname: string): string {
  let clean = rawHostname.trim().toLowerCase();
  if (clean.startsWith("[") && clean.endsWith("]")) {
    clean = clean.slice(1, -1);
  }
  while (clean.endsWith(".")) {
    clean = clean.slice(0, -1);
  }
  return clean;
}

/**
 * Evalúa si un hostname pertenece a nombres internos, loopback o metadata cloud.
 */
export function isBlockedStaticHostname(hostname: string): boolean {
  const clean = normalizeHostname(hostname);
  if (!clean) return true;
  if (BLOCKED_EXACT_HOSTNAMES.has(clean)) {
    return true;
  }
  return BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => clean.endsWith(suffix));
}

/**
 * Valida una dirección IP literal (IPv4 o IPv6) utilizando `ipaddr.js`.
 * Bloquea cualquier dirección cuyo rango no sea estrictamente `'unicast'`,
 * incluyendo:
 * - Loopback (`127.0.0.0/8`, `::1`)
 * - Privadas RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
 * - Link-Local y Cloud Metadata (`169.254.0.0/16`, `169.254.169.254`, `fe80::/10`)
 * - Unique Local IPv6 (`fc00::/7`), Carrier-Grade NAT (`100.64.0.0/10`), Unspecified (`0.0.0.0`, `::`)
 */
export function assertPublicUnicastIp(
  rawIp: string,
  contextHost?: string
): { normalizedIp: string; range: string } {
  const cleanIp = normalizeHostname(rawIp).split("%")[0] ?? "";

  if (!cleanIp || !ipaddr.isValid(cleanIp)) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `Dirección IP inválida o malformada rechazada por escudo Anti-SSRF: "${rawIp}"`,
      422,
      { ip: rawIp, host: contextHost ?? rawIp }
    );
  }

  let parsedAddr: ipaddr.IPv4 | ipaddr.IPv6;
  let processedAddr: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    parsedAddr = ipaddr.parse(cleanIp);
    // `ipaddr.process` desenvuelve automáticamente direcciones IPv6 mapeadas a IPv4 (ej. ::ffff:127.0.0.1)
    processedAddr = ipaddr.process(cleanIp);
  } catch (err) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `Fallo al inspeccionar dirección IP en escudo Anti-SSRF: "${rawIp}"`,
      422,
      { ip: rawIp, host: contextHost ?? rawIp, cause: String(err) }
    );
  }

  const parsedRange = parsedAddr.range();
  const processedRange = processedAddr.range();

  if (parsedRange !== "unicast" || processedRange !== "unicast") {
    const detectedRange =
      processedRange !== "unicast" ? processedRange : parsedRange;
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `Bloqueo Anti-SSRF: la dirección IP ${processedAddr.toString()} (host: ${
        contextHost ?? cleanIp
      }) pertenece al rango restringido "${detectedRange}".`,
      422,
      {
        ip: processedAddr.toString(),
        rawIp,
        host: contextHost ?? cleanIp,
        range: detectedRange,
      }
    );
  }

  // Verificación adicional explícita de octetos IPv4 críticos (Defensa en Profundidad)
  if (processedAddr.kind() === "ipv4") {
    const octets = (processedAddr as ipaddr.IPv4).octets;
    const o0 = octets[0] ?? 0;
    const o1 = octets[1] ?? 0;

    const isLoopback = o0 === 127;
    const isZeroNet = o0 === 0;
    const isPrivate10 = o0 === 10;
    const isPrivate172 = o0 === 172 && o1 >= 16 && o1 <= 31;
    const isPrivate192 = o0 === 192 && o1 === 168;
    const isLinkLocalOrMetadata = o0 === 169 && o1 === 254;
    const isCgnat = o0 === 100 && o1 >= 64 && o1 <= 127;

    if (
      isLoopback ||
      isZeroNet ||
      isPrivate10 ||
      isPrivate172 ||
      isPrivate192 ||
      isLinkLocalOrMetadata ||
      isCgnat
    ) {
      throw new AppError(
        "SSRF_BLOCKED_ERROR",
        `Bloqueo Anti-SSRF: IPv4 interna/reservada detectada (${processedAddr.toString()}).`,
        422,
        {
          ip: processedAddr.toString(),
          host: contextHost ?? cleanIp,
          range: processedRange,
        }
      );
    }
  }

  return {
    normalizedIp: processedAddr.toString(),
    range: processedRange,
  };
}

const defaultDnsLookupAll: DnsLookupAllFn = async (hostname: string) => {
  return dns.lookup(hostname, { all: true, verbatim: true });
};

/**
 * Escudo Anti-SSRF Pre-Vuelo (`FR-5`, `AD-4`, `NFR-3`).
 * Evalúa cualquier URL externa antes de realizar una petición de red:
 * 1. Verifica protocolo `http:` o `https:` y ausencia de credenciales embebidas.
 * 2. Bloquea hostnames locales/internos (`localhost`, `*.local`, `*.internal`, metadata).
 * 3. Si el hostname es un literal IP (IPv4/IPv6), valida inmediatamente su rango con `ipaddr.js`.
 * 4. Si es un dominio, resuelve todos sus registros `A` y `AAAA` con `node:dns/promises`
 *    y verifica que cada IP resuelta sea estrictamente `'unicast'`.
 */
export async function assertSafeExternalUrl(
  rawUrl: string,
  lookupAllFn: DnsLookupAllFn = defaultDnsLookupAll
): Promise<URL> {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      "La URL del calendario iCal está vacía o es inválida.",
      422
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `URL de calendario iCal malformada: "${rawUrl}"`,
      422
    );
  }

  if (!ALLOWED_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `Protocolo "${parsedUrl.protocol}" bloqueado por escudo Anti-SSRF. Solo se admiten http: o https:.`,
      422,
      { protocol: parsedUrl.protocol, url: rawUrl }
    );
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      "No se admiten credenciales embebidas en la URL del calendario iCal.",
      422
    );
  }

  const cleanHostname = normalizeHostname(parsedUrl.hostname);

  if (isBlockedStaticHostname(cleanHostname)) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `Hostname local o interno bloqueado por escudo Anti-SSRF: "${cleanHostname}".`,
      422,
      { host: cleanHostname, url: rawUrl }
    );
  }

  // Si el hostname ya es un literal IPv4 o IPv6 (incluyendo hex/integer normalizado por WHATWG URL),
  // validarlo en memoria sin abrir ninguna consulta de red ni socket.
  if (ipaddr.isValid(cleanHostname)) {
    assertPublicUnicastIp(cleanHostname, cleanHostname);
    return parsedUrl;
  }

  // Si parece una IP IPv4 malformada o numérica parcial, bloquear antes de DNS
  if (/^[0-9.]+$/.test(cleanHostname)) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `Formato de dirección IPv4 inválido o sospechoso bloqueado: "${cleanHostname}".`,
      422,
      { host: cleanHostname }
    );
  }

  // Resolver todos los registros A / AAAA del dominio mediante node:dns/promises
  let records: DnsLookupRecord[];
  try {
    records = await lookupAllFn(cleanHostname);
  } catch (dnsErr) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `No se pudo resolver de forma segura el dominio "${cleanHostname}" mediante DNS.`,
      422,
      { host: cleanHostname, cause: String(dnsErr) }
    );
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new AppError(
      "SSRF_BLOCKED_ERROR",
      `El dominio "${cleanHostname}" no devolvió registros DNS A/AAAA válidos.`,
      422,
      { host: cleanHostname }
    );
  }

  for (const record of records) {
    assertPublicUnicastIp(record.address, cleanHostname);
  }

  return parsedUrl;
}

/**
 * Crea un agente HTTP/HTTPS protegido en capa de socket mediante `ssrf-req-filter`
 * como segunda línea de defensa adicional a `assertSafeExternalUrl`.
 */
export function createSsrfFilteredAgent(targetUrl: string) {
  return ssrfReqFilter(targetUrl);
}

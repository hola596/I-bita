import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import QRCode from "qrcode";
import { z } from "zod";
import { env } from "@/env";
import { AppError } from "@/lib/errors/app-error";

export const PORTERIA_JWS_ALGORITHM = "HS256" as const;
export const PORTERIA_JWS_ISSUER = "urn:ibita:consortium-zero-trust" as const;
export const PORTERIA_JWS_AUDIENCE = "urn:ibita:porteria-verifier" as const;

export const PorteriaVerifiedGuestClaimSchema = z.object({
  slotIndex: z.number().int().min(1),
  isPrimaryGuest: z.boolean(),
  fullName: z.string().trim().min(2),
  maskedDni: z.string().trim().min(4),
  documentType: z.string().trim().default("DNI_ARG"),
  confidenceScore: z.number().min(85).max(100),
  verifiedAt: z.string().trim().min(10),
});

export const PorteriaPassJwsClaimsSchema = z
  .object({
    bookingId: z.string().trim().uuid(),
    propertyId: z.string().trim().uuid(),
    propertySlug: z.string().trim().min(1),
    propertyTitle: z.string().trim().min(1),
    consortiumName: z.string().trim().min(1),
    addressLine: z.string().trim().min(1),
    unitIdentifier: z.string().trim().min(1),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    declaredAdultsCount: z.number().int().min(1),
    verifiedAdultsCount: z.number().int().min(1),
    vehiclePlate: z.string().trim().nullable(),
    verifiedGuests: z.array(PorteriaVerifiedGuestClaimSchema).min(1),
  })
  .refine(
    (data) =>
      data.verifiedAdultsCount === data.declaredAdultsCount &&
      data.verifiedGuests.length === data.declaredAdultsCount,
    {
      message:
        "El Pase Digital de Portería exige que el 100% de los adultos declarados estén verificados biométricamente.",
    }
  );

export type PorteriaVerifiedGuestClaim = z.infer<
  typeof PorteriaVerifiedGuestClaimSchema
>;
export type PorteriaPassJwsClaims = z.infer<typeof PorteriaPassJwsClaimsSchema>;

export interface SignedPorteriaPassArtifact {
  jwsToken: string;
  qrDataUrl: string;
  verificationUrl: string;
  jti: string;
  issuedAt: string;
  expiresAt: string;
  claims: PorteriaPassJwsClaims;
}

export interface VerifiedPorteriaJwsResult {
  claims: PorteriaPassJwsClaims;
  jti: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  algorithm: string;
  issuer: string;
  audience: string;
}

function getPorteriaSecretKeyBytes(): Uint8Array {
  const secret = env.PORTERIA_JWS_SECRET;
  if (!secret || secret.length < 32) {
    throw new AppError(
      "ENV_VALIDATION_ERROR",
      "PORTERIA_JWS_SECRET must be at least 32 characters long for HS256 JWS signing",
      500
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Construye la URL pública de verificación en vivo para guardia/portería (`/verify/[token]`).
 */
export function buildPorteriaVerificationUrl(jwsToken: string): string {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${baseUrl}/verify/${encodeURIComponent(jwsToken)}`;
}

/**
 * Calcula el timestamp UNIX (`exp`) de expiración del Pase Digital de Portería
 * cubriendo hasta el cierre del día de `checkOut` (zona horaria Argentina `-03:00`) + 24 horas.
 */
function resolveExpirationUnixSeconds(
  checkOutDate: string,
  issuedAtSeconds: number
): number {
  const parsedCheckoutEnd = Date.parse(`${checkOutDate}T23:59:59-03:00`);
  const minExpiry = issuedAtSeconds + 86400 * 7; // mínimo 7 días desde emisión para pases activos
  if (Number.isNaN(parsedCheckoutEnd)) {
    return minExpiry;
  }
  const checkoutPlus24h = Math.floor(parsedCheckoutEnd / 1000) + 86400;
  return Math.max(minExpiry, checkoutPlus24h);
}

/**
 * Firma un token JWS compacto (`HS256`) con `jose` (`SignJWT`) y `env.PORTERIA_JWS_SECRET`,
 * y genera el código QR en formato Data URL (`qrcode.toDataURL`) apuntando a
 * `${env.NEXT_PUBLIC_APP_URL}/verify/${jwsToken}`.
 */
export async function signAndGeneratePorteriaPassQr(
  rawClaims: PorteriaPassJwsClaims
): Promise<SignedPorteriaPassArtifact> {
  const parsed = PorteriaPassJwsClaimsSchema.safeParse(rawClaims);
  if (!parsed.success) {
    throw new AppError(
      "ZERO_TRUST_ACCESS_LOCKED",
      parsed.error.issues[0]?.message ??
        "Datos insuficientes o adultos pendientes de biometría para emitir el Pase Digital de Portería.",
      403,
      parsed.error.flatten()
    );
  }

  const claims = parsed.data;
  const secretKey = getPorteriaSecretKeyBytes();
  const jti = crypto.randomUUID();
  const issuedAtSec = Math.floor(Date.now() / 1000);
  const expiresAtSec = resolveExpirationUnixSeconds(
    claims.checkOut,
    issuedAtSec
  );

  const jwtPayload: JWTPayload = {
    bookingId: claims.bookingId,
    propertyId: claims.propertyId,
    propertySlug: claims.propertySlug,
    propertyTitle: claims.propertyTitle,
    consortiumName: claims.consortiumName,
    addressLine: claims.addressLine,
    unitIdentifier: claims.unitIdentifier,
    checkIn: claims.checkIn,
    checkOut: claims.checkOut,
    declaredAdultsCount: claims.declaredAdultsCount,
    verifiedAdultsCount: claims.verifiedAdultsCount,
    vehiclePlate: claims.vehiclePlate,
    verifiedGuests: claims.verifiedGuests,
  };

  const jwsToken = await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: PORTERIA_JWS_ALGORITHM, typ: "JWT" })
    .setIssuer(PORTERIA_JWS_ISSUER)
    .setAudience(PORTERIA_JWS_AUDIENCE)
    .setSubject(claims.bookingId)
    .setJti(jti)
    .setIssuedAt(issuedAtSec)
    .setExpirationTime(expiresAtSec)
    .sign(secretKey);

  const verificationUrl = buildPorteriaVerificationUrl(jwsToken);

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 360,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });

  return {
    jwsToken,
    qrDataUrl,
    verificationUrl,
    jti,
    issuedAt: new Date(issuedAtSec * 1000).toISOString(),
    expiresAt: new Date(expiresAtSec * 1000).toISOString(),
    claims,
  };
}

/**
 * Verifica criptográficamente la firma e integridad de un token JWS de Portería
 * utilizando `jwtVerify` (`jose`) con `env.PORTERIA_JWS_SECRET` (`HS256`) y valida
 * su estructura con `PorteriaPassJwsClaimsSchema`.
 */
export async function verifyPorteriaPassJws(
  rawToken: string
): Promise<VerifiedPorteriaJwsResult> {
  const cleanToken = decodeURIComponent(rawToken.trim());
  if (!cleanToken || cleanToken.split(".").length !== 3) {
    throw new AppError(
      "CRYPTO_INTEGRITY_ERROR",
      "El formato del token JWS del Pase de Portería no es válido.",
      401
    );
  }

  const secretKey = getPorteriaSecretKeyBytes();

  let verifiedPayload: JWTPayload;
  let protectedHeader: { alg?: string };

  try {
    const verification = await jwtVerify(cleanToken, secretKey, {
      issuer: PORTERIA_JWS_ISSUER,
      audience: PORTERIA_JWS_AUDIENCE,
      algorithms: [PORTERIA_JWS_ALGORITHM],
    });
    verifiedPayload = verification.payload;
    protectedHeader = verification.protectedHeader;
  } catch (err) {
    throw new AppError(
      "CRYPTO_INTEGRITY_ERROR",
      "Firma criptográfica JWS inválida, adulterada o credencial expirada.",
      401,
      err instanceof Error ? err.message : undefined
    );
  }

  const parsedClaims = PorteriaPassJwsClaimsSchema.safeParse({
    bookingId: verifiedPayload.bookingId,
    propertyId: verifiedPayload.propertyId,
    propertySlug: verifiedPayload.propertySlug,
    propertyTitle: verifiedPayload.propertyTitle,
    consortiumName: verifiedPayload.consortiumName,
    addressLine: verifiedPayload.addressLine,
    unitIdentifier: verifiedPayload.unitIdentifier,
    checkIn: verifiedPayload.checkIn,
    checkOut: verifiedPayload.checkOut,
    declaredAdultsCount: verifiedPayload.declaredAdultsCount,
    verifiedAdultsCount: verifiedPayload.verifiedAdultsCount,
    vehiclePlate:
      verifiedPayload.vehiclePlate === undefined
        ? null
        : verifiedPayload.vehiclePlate,
    verifiedGuests: verifiedPayload.verifiedGuests,
  });

  if (!parsedClaims.success) {
    throw new AppError(
      "CRYPTO_INTEGRITY_ERROR",
      "El payload del Pase Digital de Portería no cumple con el contrato Zero-Trust Consorcial.",
      422,
      parsedClaims.error.flatten()
    );
  }

  const aud = Array.isArray(verifiedPayload.aud)
    ? verifiedPayload.aud[0] ?? PORTERIA_JWS_AUDIENCE
    : verifiedPayload.aud ?? PORTERIA_JWS_AUDIENCE;

  return {
    claims: parsedClaims.data,
    jti: typeof verifiedPayload.jti === "string" ? verifiedPayload.jti : null,
    issuedAt:
      typeof verifiedPayload.iat === "number"
        ? new Date(verifiedPayload.iat * 1000).toISOString()
        : null,
    expiresAt:
      typeof verifiedPayload.exp === "number"
        ? new Date(verifiedPayload.exp * 1000).toISOString()
        : null,
    algorithm: protectedHeader.alg ?? PORTERIA_JWS_ALGORITHM,
    issuer: verifiedPayload.iss ?? PORTERIA_JWS_ISSUER,
    audience: aud,
  };
}

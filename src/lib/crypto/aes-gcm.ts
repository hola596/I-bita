import "server-only";
import crypto from "node:crypto";
import { env } from "@/env";
import { AppError } from "@/lib/errors/app-error";

export interface EncryptedAccessPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;

function getMasterKeyBuffer(): Buffer {
  const keyBuf = Buffer.from(env.ACCESS_CODE_ENCRYPTION_KEY, "hex");
  if (keyBuf.byteLength !== 32) {
    throw new AppError(
      "ENV_VALIDATION_ERROR",
      "ACCESS_CODE_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM",
      500
    );
  }
  return keyBuf;
}

/**
 * Cifra el PIN o instrucciones de cerradura vinculando `propertyId` como AAD
 * (Additional Authenticated Data) para impedir ataques de sustitución de texto cifrado entre propiedades.
 */
export function encryptAccessCode(
  plainText: string,
  propertyId: string
): EncryptedAccessPayload {
  if (!plainText || !propertyId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "plainText and propertyId are required for AES-256-GCM encryption",
      400
    );
  }
  const key = getMasterKeyBuffer();
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });

  cipher.setAAD(Buffer.from(propertyId, "utf8"));

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * Desencripta el PIN de cerradura verificando criptográficamente el AuthTag (16B) y el AAD (`propertyId`).
 * Si el texto cifrado fue copiado de otra propiedad (`propertyId` distinto), falla inmediatamente.
 */
export function decryptAccessCode(
  payload: EncryptedAccessPayload,
  propertyId: string
): string {
  const key = getMasterKeyBuffer();
  const iv = Buffer.from(payload.iv, "hex");
  const authTag = Buffer.from(payload.authTag, "hex");
  const encrypted = Buffer.from(payload.ciphertext, "hex");

  if (iv.byteLength !== IV_BYTE_LENGTH || authTag.byteLength !== AUTH_TAG_BYTE_LENGTH) {
    throw new AppError(
      "CRYPTO_INTEGRITY_ERROR",
      "Invalid IV or AuthTag length for AES-256-GCM decryption",
      422
    );
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    decipher.setAAD(Buffer.from(propertyId, "utf8"));
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (err) {
    throw new AppError(
      "CRYPTO_INTEGRITY_ERROR",
      "AES-256-GCM authentication or AAD propertyId binding check failed",
      403,
      err instanceof Error ? err.message : undefined
    );
  }
}

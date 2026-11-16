export type ErrorCode =
  | "ENV_VALIDATION_ERROR"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BOOKING_OVERLAP_CONFLICT"
  | "SSRF_BLOCKED_ERROR"
  | "ZERO_TRUST_ACCESS_LOCKED"
  | "CRYPTO_INTEGRITY_ERROR"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "ONCHAIN_RECEIPT_INVALID"
  | "LEDGER_IMMUTABILITY_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode = 400,
    details?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static fromPostgresError(pgError: { code?: string; message?: string }): AppError {
    if (pgError.code === "23P01") {
      return new AppError(
        "BOOKING_OVERLAP_CONFLICT",
        "Las fechas seleccionadas ya se encuentran ocupadas o bloqueadas (SQLSTATE 23P01 btree_gist).",
        409,
        pgError
      );
    }
    if (pgError.code === "42501") {
      return new AppError(
        "LEDGER_IMMUTABILITY_ERROR",
        "Operación rechazada por seguridad o inmutabilidad del Libro Mayor (SQLSTATE 42501).",
        403,
        pgError
      );
    }
    return new AppError(
      "INTERNAL_ERROR",
      pgError.message || "Error en la operación de base de datos",
      500,
      pgError
    );
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: unknown } };

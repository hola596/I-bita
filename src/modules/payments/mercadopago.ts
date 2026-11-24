/**
 * BLOCKER REGULATORIO DOCUMENTADO (PSP BCRA):
 * Si `MP_ACCESS_TOKEN` opera sobre una única cuenta centralizada de I-bita sin OAuth de Marketplace Split,
 * la plataforma recauda el 100% del alquiler de terceros para luego transferirlo, lo cual puede encuadrar
 * como Proveedor de Servicios de Pago (PSP) regulado por el BCRA o generar contingencia impositiva SIRCREB/IVA
 * sobre fondos ajenos.
 * Este módulo soporta Marketplace Split (`sellerAccessToken` + `marketplace_fee`) cuando el anfitrión
 * vincula su cuenta vía OAuth (`MP_MARKETPLACE_SPLIT_ENABLED=true`), acreditando el alquiler directo
 * al anfitrión y reteniendo únicamente el fee tecnológico de I-bita.
 */
import "server-only";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { env } from "@/env";
import { AppError } from "@/lib/errors/app-error";

/** Máximo de cuotas ofrecidas en el checkout (sujetas a condiciones del procesador). */
export const MP_MAX_INSTALLMENTS = 6 as const;

export interface ArsPreferenceInput {
  bookingId: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  /** Monto en ARS como string decimal (columna `bookings.total_amount`). */
  totalAmountArs: string;
  /** Token OAuth del Anfitrión vendedor en Mercado Pago Marketplace (split directo al locador). */
  sellerAccessToken?: string | null;
  /** Fee tecnológico neto que cobra I-bita en ARS (solo cuando se usa `marketplace_fee` con OAuth). */
  marketplaceFeeArs?: string | null;
}

export interface ArsPreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint: string | null;
  amountArs: string;
  maxInstallments: number;
  splitMode: "MARKETPLACE_SPLIT" | "CENTRALIZED_LEGACY";
}

export interface NormalizedMercadoPagoPayment {
  id: string;
  status: string;
  currencyId: string;
  /** Monto de la transacción como string decimal exacto (2 decimales). */
  amount: string;
  externalReference: string | null;
  paymentMethodId: string | null;
  installments: number | null;
}

let cachedClient: MercadoPagoConfig | null = null;

function getMercadoPagoClient(): MercadoPagoConfig {
  if (!cachedClient) {
    cachedClient = new MercadoPagoConfig({
      accessToken: env.MP_ACCESS_TOKEN,
      options: { timeout: 10000 },
    });
  }
  return cachedClient;
}

/** ARS siempre con 2 decimales, redondeo half-up, exclusivamente con `decimal.js`. */
export function normalizeArsAmount(raw: string | number): Decimal {
  const d = new Decimal(raw);
  if (!d.isFinite()) {
    throw new AppError("VALIDATION_ERROR", "Monto ARS inválido.", 422);
  }
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function isHttpsUrl(url: string): boolean {
  return url.startsWith("https://");
}

/**
 * Crea la preferencia de pago ARS (QR, MODO, saldo en cuenta, hasta 6 cuotas) con el SDK oficial.
 * `external_reference` = `bookingId` para conciliar en el webhook.
 */
export async function createArsPreference(
  input: ArsPreferenceInput
): Promise<ArsPreferenceResult> {
  const amount = normalizeArsAmount(input.totalAmountArs);
  if (amount.lte(0)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La reserva no tiene un monto ARS a cobrar.",
      422
    );
  }

  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  // Mercado Pago exige HTTPS para `auto_return` y `notification_url`; en localhost se omiten.
  const https = isHttpsUrl(baseUrl);
  const returnBase = `${baseUrl}/checkout/${input.bookingId}`;

  const useSellerSplit = Boolean(
    input.sellerAccessToken?.trim() && env.MP_MARKETPLACE_SPLIT_ENABLED === "true"
  );
  const mpClient = useSellerSplit
    ? new MercadoPagoConfig({
        accessToken: input.sellerAccessToken!.trim(),
        options: { timeout: 10000 },
      })
    : getMercadoPagoClient();

  const feeAmount =
    useSellerSplit && input.marketplaceFeeArs
      ? normalizeArsAmount(input.marketplaceFeeArs)
      : null;

  const preference = new Preference(mpClient);
  let created;
  try {
    created = await preference.create({
      body: {
        items: [
          {
            id: input.bookingId,
            title: `Estadía ${input.propertyTitle} (${input.checkIn} a ${input.checkOut})`.slice(
              0,
              250
            ),
            quantity: 1,
            currency_id: "ARS",
            unit_price: amount.toNumber(),
          },
        ],
        external_reference: input.bookingId,
        metadata: {
          booking_id: input.bookingId,
          split_mode: useSellerSplit ? "MARKETPLACE_SPLIT" : "CENTRALIZED_LEGACY",
        },
        ...(feeAmount && feeAmount.gt(0) && feeAmount.lt(amount)
          ? { marketplace_fee: feeAmount.toNumber() }
          : {}),
        statement_descriptor: "I-BITA",
        payment_methods: { installments: MP_MAX_INSTALLMENTS },
        back_urls: {
          success: `${returnBase}?status=success`,
          failure: `${returnBase}?status=failure`,
          pending: `${returnBase}?status=pending`,
        },
        ...(https
          ? {
              auto_return: "approved" as const,
              notification_url: `${baseUrl}/api/webhooks/payments`,
            }
          : {}),
      },
    });
  } catch (err) {
    throw new AppError(
      "INTERNAL_ERROR",
      "No se pudo crear la preferencia de pago en Mercado Pago.",
      502,
      describeSdkError(err)
    );
  }

  if (!created.id || !created.init_point) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Mercado Pago devolvió una preferencia incompleta.",
      502
    );
  }

  return {
    preferenceId: created.id,
    initPoint: created.init_point,
    sandboxInitPoint: created.sandbox_init_point ?? null,
    amountArs: amount.toFixed(2),
    maxInstallments: MP_MAX_INSTALLMENTS,
    splitMode: useSellerSplit ? "MARKETPLACE_SPLIT" : "CENTRALIZED_LEGACY",
  };
}

function describeSdkError(err: unknown): unknown {
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; status?: unknown; error?: unknown };
    return { message: e.message, status: e.status, error: e.error };
  }
  return String(err);
}

export interface ParsedMpSignature {
  ts: string;
  v1: string;
}

/** Extrae `ts` y `v1` del header `x-signature` (`ts=...,v1=...`). */
export function parseMercadoPagoSignatureHeader(
  header: string | null | undefined
): ParsedMpSignature | null {
  if (!header) return null;
  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === "ts") ts = value;
    if (key === "v1") v1 = value;
  }
  return ts && v1 ? { ts, v1 } : null;
}

/**
 * Valida `x-signature` de Mercado Pago: HMAC-SHA256 (`MP_WEBHOOK_SECRET`) sobre el manifest
 * `id:[data.id];request-id:[x-request-id];ts:[ts];` con comparación en tiempo constante.
 */
export function verifyMercadoPagoSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret?: string;
}): boolean {
  const parsed = parseMercadoPagoSignatureHeader(params.xSignature);
  if (!parsed) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(parsed.v1)) return false;

  // Los ids alfanuméricos se normalizan a minúsculas según la documentación de MP.
  let manifest = "";
  if (params.dataId) manifest += `id:${params.dataId.toLowerCase()};`;
  if (params.xRequestId) manifest += `request-id:${params.xRequestId};`;
  manifest += `ts:${parsed.ts};`;

  const expected = crypto
    .createHmac("sha256", params.secret ?? env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest();
  const received = Buffer.from(parsed.v1, "hex");
  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(received, expected)
  );
}

/** Consulta el estado REAL del pago en Mercado Pago (nunca se confía en el cuerpo del webhook). */
export async function fetchMercadoPagoPayment(
  paymentId: string
): Promise<NormalizedMercadoPagoPayment> {
  let res;
  try {
    res = await new Payment(getMercadoPagoClient()).get({ id: paymentId });
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404 || status === 400) {
      throw new AppError(
        "NOT_FOUND",
        "El pago informado no existe en Mercado Pago.",
        422,
        describeSdkError(err)
      );
    }
    throw new AppError(
      "INTERNAL_ERROR",
      "No se pudo consultar el pago en Mercado Pago.",
      502,
      describeSdkError(err)
    );
  }

  if (res.id === undefined || res.id === null) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Mercado Pago devolvió un pago sin identificador.",
      502
    );
  }

  return {
    id: String(res.id),
    status: String(res.status ?? "unknown"),
    currencyId: String(res.currency_id ?? ""),
    amount: normalizeArsAmount(res.transaction_amount ?? 0).toFixed(2),
    externalReference: res.external_reference ?? null,
    paymentMethodId: res.payment_method_id ?? null,
    installments: typeof res.installments === "number" ? res.installments : null,
  };
}

import "server-only";
import { AppError } from "@/lib/errors/app-error";
import {
  fetchMercadoPagoPayment,
  verifyMercadoPagoSignature,
} from "./mercadopago";
import { createPaymentsPgClient, settleApprovedArsPayment } from "./settlement";

export interface WebhookHttpResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Procesa `POST /api/webhooks/payments` (rama ARS / Mercado Pago):
 *  1. valida `x-signature` + `x-request-id` (HMAC-SHA256) → `401` si falta o no coincide;
 *  2. consulta el pago real con el SDK y recién entonces acredita en Supabase (idempotente).
 */
export async function handleMercadoPagoWebhook(
  req: Request
): Promise<WebhookHttpResult> {
  const url = new URL(req.url);
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    rawBody = "";
  }
  let parsedBody: { type?: unknown; topic?: unknown; data?: { id?: unknown } } =
    {};
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    parsedBody = {};
  }

  const queryDataId = url.searchParams.get("data.id");
  const bodyDataId = parsedBody?.data?.id;
  const dataId =
    queryDataId ??
    (bodyDataId !== undefined && bodyDataId !== null
      ? String(bodyDataId)
      : null);

  const signatureOk =
    Boolean(xSignature) &&
    verifyMercadoPagoSignature({ xSignature, xRequestId, dataId });

  if (!signatureOk) {
    return {
      status: 401,
      body: {
        ok: false,
        code: "WEBHOOK_SIGNATURE_INVALID",
        message: "Firma HMAC-SHA256 inválida o ausente.",
      },
    };
  }

  const type = String(
    url.searchParams.get("type") ??
      url.searchParams.get("topic") ??
      parsedBody.type ??
      parsedBody.topic ??
      ""
  );
  if (type !== "payment") {
    return { status: 200, body: { ok: true, ignored: true, reason: `type:${type}` } };
  }

  if (!dataId || !/^\d{1,20}$/.test(dataId)) {
    return {
      status: 422,
      body: { ok: false, code: "VALIDATION_ERROR", message: "data.id inválido." },
    };
  }

  const pgClient = createPaymentsPgClient();
  try {
    // Estado REAL en Mercado Pago (jamás se confía en el cuerpo del webhook).
    const payment = await fetchMercadoPagoPayment(dataId);

    await pgClient.connect();
    const result = await settleApprovedArsPayment(pgClient, payment);

    return {
      status: 200,
      body: {
        ok: true,
        outcome: result.outcome,
        ledgerEntryId: result.ledgerEntryId,
      },
    };
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError("INTERNAL_ERROR", "Error procesando el webhook.", 500);
    // 5xx → Mercado Pago reintenta; 4xx → error no reintentable.
    return {
      status: appErr.statusCode >= 400 ? appErr.statusCode : 500,
      body: { ok: false, code: appErr.code, message: appErr.message },
    };
  } finally {
    await pgClient.end().catch(() => undefined);
  }
}

import "server-only";
import { AppError } from "@/lib/errors/app-error";
import {
  fetchMercadoPagoPayment,
  verifyMercadoPagoSignature,
} from "./mercadopago";
import {
  createPaymentsPgClient,
  settleApprovedArsPayment,
  settleApprovedUsdtPayment,
} from "./settlement";
import { verifyUsdtPaymentReceipt } from "./usdt-onchain";

export interface WebhookHttpResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Procesa `POST /api/webhooks/payments` (rama ARS / Mercado Pago y rama USDT / Viem Polygon):
 *  - Rama ARS: valida `x-signature` + `x-request-id` (HMAC-SHA256) → `401` si falta o no coincide;
 *  - Rama USDT: recibe `{ provider: "POLYGON_USDT", bookingId, txHash }` y valida con Viem on-chain.
 */
export async function handlePaymentsWebhook(
  req: Request
): Promise<WebhookHttpResult> {
  const xSignature = req.headers.get("x-signature");

  // Si incluye x-signature, es el webhook de Mercado Pago
  if (xSignature) {
    return handleMercadoPagoWebhook(req);
  }

  // De lo contrario, verificar si es una notificación de pago USDT
  let bodyJson: Record<string, unknown> = {};
  try {
    bodyJson = await req.json();
  } catch {
    return {
      status: 400,
      body: { ok: false, code: "VALIDATION_ERROR", message: "Cuerpo JSON inválido." },
    };
  }

  const provider = String(bodyJson.provider ?? "");
  const bookingId = String(bodyJson.bookingId ?? "");
  const txHash = String(bodyJson.txHash ?? "");

  if (provider === "POLYGON_USDT" || txHash.startsWith("0x")) {
    if (!bookingId || !txHash) {
      return {
        status: 422,
        body: { ok: false, code: "VALIDATION_ERROR", message: "bookingId y txHash son requeridos para USDT." },
      };
    }

    const pgClient = createPaymentsPgClient();
    try {
      await pgClient.connect();

      // Consultar reserva para obtener monto esperado
      const bRes = await pgClient.query<{ total_amount: string; payment_currency: string; status: string }>(
        `SELECT total_amount::text, payment_currency::text, status::text FROM public.bookings WHERE id = $1`,
        [bookingId]
      );
      const b = bRes.rows[0];
      if (!b) {
        return {
          status: 404,
          body: { ok: false, code: "NOT_FOUND", message: "Reserva no encontrada." },
        };
      }

      // Verificación on-chain
      const verification = await verifyUsdtPaymentReceipt(txHash, b.total_amount);

      // Liquidación atómica
      const result = await settleApprovedUsdtPayment(
        pgClient,
        bookingId,
        verification.txHash,
        verification.transfer
      );

      return {
        status: 200,
        body: {
          ok: true,
          outcome: result.outcome,
          ledgerEntryId: result.ledgerEntryId,
          bookingStatus: result.bookingStatus,
        },
      };
    } catch (err) {
      const appErr =
        err instanceof AppError
          ? err
          : new AppError("INTERNAL_ERROR", "Error procesando el pago USDT.", 500);
      return {
        status: appErr.statusCode >= 400 ? appErr.statusCode : 500,
        body: { ok: false, code: appErr.code, message: appErr.message },
      };
    } finally {
      await pgClient.end().catch(() => undefined);
    }
  }

  return {
    status: 400,
    body: {
      ok: false,
      code: "VALIDATION_ERROR",
      message: "Encabezados o proveedor de pago no reconocidos.",
    },
  };
}

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

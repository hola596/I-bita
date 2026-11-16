import { NextResponse } from "next/server";
import {
  handleMercadoPagoWebhook,
  handlePaymentsWebhook,
} from "@/modules/payments/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook y receptor de pagos bi-monetarios:
 * - Rama ARS: Mercado Pago HMAC-SHA256 (`handleMercadoPagoWebhook`)
 * - Rama USDT: Viem on-chain Polygon PoS (`handlePaymentsWebhook`)
 */
export async function POST(req: Request) {
  // Si no se especifica proveedor USDT explícito, delegar a handleMercadoPagoWebhook
  const providerHeader = req.headers.get("x-payment-provider");
  if (providerHeader === "usdt" || providerHeader === "polygon") {
    const { status, body } = await handlePaymentsWebhook(req);
    return NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { status, body } = await handleMercadoPagoWebhook(req);
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

import { NextResponse } from "next/server";
import { handleMercadoPagoWebhook } from "@/modules/payments/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de pagos (rama ARS / Mercado Pago). La rama USDT (`viem`) se agrega en la Story 4.2.
 */
export async function POST(req: Request) {
  const { status, body } = await handleMercadoPagoWebhook(req);
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

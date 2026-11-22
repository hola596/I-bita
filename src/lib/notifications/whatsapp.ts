import "server-only";
import { env } from "@/env";

export function normalizeWhatsAppDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("54") ? digits : `54${digits}`;
}

export type WhatsAppAlertResult =
  | { ok: true; messageId: string }
  | { ok: false; skipped?: boolean; reason?: string };

/**
 * Envía una alerta por WhatsApp Cloud API al administrador si `ADMIN_WHATSAPP_ALERT_PHONE`
 * está configurado. Nunca interrumpe el flujo principal si falla o está sin configurar.
 */
export async function sendAdminWhatsAppAlert(
  bodyText: string
): Promise<WhatsAppAlertResult> {
  const rawAdminPhone = env.ADMIN_WHATSAPP_ALERT_PHONE?.trim();
  if (!rawAdminPhone) {
    return { ok: false, skipped: true };
  }

  const recipient = normalizeWhatsAppDigits(rawAdminPhone);
  if (recipient.length < 10) {
    return { ok: false, skipped: true };
  }

  const endpoint = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "text",
        text: {
          preview_url: false,
          body: bodyText.slice(0, 1500),
        },
      }),
      signal: AbortSignal.timeout(6000),
    });

    const txt = await res.text();
    if (!res.ok) {
      console.error(
        `[WHATSAPP] Error HTTP ${res.status} al enviar alerta admin: ${txt.slice(0, 200)}`
      );
      return { ok: false, reason: `HTTP_${res.status}` };
    }

    let messageId = "sent";
    try {
      const parsed = JSON.parse(txt) as { messages?: Array<{ id?: string }> };
      if (parsed.messages?.[0]?.id) {
        messageId = parsed.messages[0].id;
      }
    } catch {
      // Ignorar si no devuelve id
    }

    return { ok: true, messageId };
  } catch (err) {
    console.error(
      "[WHATSAPP] Fallo de red al enviar alerta admin:",
      err instanceof Error ? err.message : "unknown_error"
    );
    return { ok: false, reason: "NETWORK_OR_TIMEOUT" };
  }
}

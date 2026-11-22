import "server-only";
import { env } from "@/env";

const DEFAULT_ADMIN_NOTIFICATION_EMAIL = "hola@serviciodemarketingdigital.com";
const DEFAULT_RESEND_FROM = "I-bita <onboarding@resend.dev>";

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SendResendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResendEmailResult =
  | { ok: true; emailId: string }
  | { ok: false; reason: string };

async function postToResend(
  payload: Record<string, unknown>
): Promise<{ status: number; bodyText: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const bodyText = await res.text();
  return { status: res.status, bodyText };
}

export async function sendResendEmail(
  input: SendResendEmailInput
): Promise<SendResendEmailResult> {
  const primaryFrom = env.RESEND_FROM_EMAIL ?? DEFAULT_RESEND_FROM;
  const basePayload: Record<string, unknown> = {
    from: primaryFrom,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  try {
    let response = await postToResend(basePayload);

    // Fallback seguro si el remitente personalizado aún no está verificado en Resend
    if (
      (response.status === 403 || response.status === 422) &&
      primaryFrom !== DEFAULT_RESEND_FROM
    ) {
      response = await postToResend({
        ...basePayload,
        from: DEFAULT_RESEND_FROM,
      });
    }

    // Un reintento breve ante error transitorio 5xx
    if (response.status >= 500) {
      response = await postToResend(basePayload);
    }

    if (response.status < 200 || response.status >= 300) {
      console.error(
        `[RESEND] Error HTTP ${response.status} al enviar "${input.subject}": ${response.bodyText.slice(0, 240)}`
      );
      return {
        ok: false,
        reason: `HTTP_${response.status}`,
      };
    }

    let emailId = "sent";
    try {
      const parsed = JSON.parse(response.bodyText) as { id?: string };
      if (parsed.id) emailId = parsed.id;
    } catch {
      // Ignorar si no trae JSON con id
    }

    return { ok: true, emailId };
  } catch (err) {
    console.error(
      "[RESEND] Fallo de red enviando notificación:",
      err instanceof Error ? err.message : "unknown_error"
    );
    return { ok: false, reason: "NETWORK_OR_TIMEOUT" };
  }
}

export function buildContactInquiryEmailPayload(inquiry: {
  fullName: string;
  email: string;
  subject: string;
  message: string;
  conversationId?: string | null;
}): SendResendEmailInput {
  const to = env.ADMIN_NOTIFICATION_EMAIL ?? DEFAULT_ADMIN_NOTIFICATION_EMAIL;
  const platformUrl = inquiry.conversationId
    ? `${env.NEXT_PUBLIC_APP_URL}/mensajes?c=${encodeURIComponent(inquiry.conversationId)}`
    : `${env.NEXT_PUBLIC_APP_URL}/admin/consultas`;

  const safeName = escapeHtml(inquiry.fullName);
  const safeEmail = escapeHtml(inquiry.email);
  const safeSubject = escapeHtml(inquiry.subject);
  const safeMessage = escapeHtml(inquiry.message).replace(/\n/g, "<br />");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; max-width: 600px; margin: 0 auto; line-height: 1.6;">
      <h2 style="color: #d90b38; margin-bottom: 8px;">Nueva consulta en I-bita</h2>
      <p style="margin-top: 0; color: #4b5563;">Recibiste un mensaje desde el área de Ayuda (/contacto). Toda la conversación continúa dentro de la plataforma.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Nombre</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeName}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Cuenta asociada</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeEmail}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Asunto</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeSubject}</td></tr>
      </table>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; font-size: 14px;">
        <strong>Mensaje:</strong><br />
        ${safeMessage}
      </div>
      <p style="margin-top: 20px;">
        <a href="${escapeHtml(platformUrl)}" style="display: inline-block; background: #d90b38; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: bold;">
          Responder dentro de I-bita
        </a>
      </p>
    </div>
  `.trim();

  const text = [
    "Nueva consulta en I-bita",
    "",
    `Nombre: ${inquiry.fullName}`,
    `Cuenta asociada: ${inquiry.email}`,
    `Asunto: ${inquiry.subject}`,
    "",
    "Mensaje:",
    inquiry.message,
    "",
    `Responder dentro de I-bita: ${platformUrl}`,
  ].join("\n");

  return {
    to,
    subject: "Nueva consulta en I-bita",
    html,
    text,
  };
}

export async function sendNewContactInquiryEmail(inquiry: {
  fullName: string;
  email: string;
  subject: string;
  message: string;
  conversationId?: string | null;
}): Promise<SendResendEmailResult> {
  return sendResendEmail(buildContactInquiryEmailPayload(inquiry));
}

export function buildHostApprovalEmailPayload(host: {
  fullName: string;
  email: string;
  phoneWhatsapp: string;
  cuitCuil: string;
  payoutSplitArsPct: number;
  checksumWallet: string;
  existingPropertiesCount: number;
  responseScheduleSummary?: string;
}): SendResendEmailInput {
  const to = env.ADMIN_NOTIFICATION_EMAIL ?? DEFAULT_ADMIN_NOTIFICATION_EMAIL;
  const adminUrl = `${env.NEXT_PUBLIC_APP_URL}/admin/aprobaciones`;
  const usdtPct = Math.max(0, 100 - host.payoutSplitArsPct);

  const isUpdate = host.existingPropertiesCount > 0;
  const tipoLabel = isUpdate
    ? `Actualización de datos de anfitrión (${host.existingPropertiesCount} propiedades existentes)`
    : "Nueva solicitud de alta como anfitrión";

  const safeName = escapeHtml(host.fullName);
  const safeEmail = escapeHtml(host.email);
  const safePhone = escapeHtml(host.phoneWhatsapp);
  const safeCuit = escapeHtml(host.cuitCuil);
  const safeWallet = escapeHtml(host.checksumWallet);
  const safeSchedule = host.responseScheduleSummary
    ? escapeHtml(host.responseScheduleSummary)
    : null;

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; max-width: 600px; margin: 0 auto; line-height: 1.6;">
      <h2 style="color: #059669; margin-bottom: 8px;">Nueva solicitud de aprobación de anfitrión en I-bita</h2>
      <p style="margin-top: 0; color: #4b5563;"><strong>Tipo:</strong> ${escapeHtml(tipoLabel)}</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Nombre / Razón social</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeName}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Cuenta asociada</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeEmail}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Tel. de respaldo</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safePhone}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">CUIT / CUIL</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeCuit}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Reparto de cobros</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${host.payoutSplitArsPct}% ARS · ${usdtPct}% USDT (${safeWallet})</td></tr>
        ${safeSchedule ? `<tr><td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #e5e7eb;">Horario de respuesta</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${safeSchedule}</td></tr>` : ""}
      </table>
      <p style="margin-top: 20px;">
        <a href="${escapeHtml(adminUrl)}" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; font-weight: bold;">
          Responder dentro de I-bita
        </a>
      </p>
    </div>
  `.trim();

  const text = [
    "Nueva solicitud de aprobación de anfitrión en I-bita",
    `Tipo: ${tipoLabel}`,
    "",
    `Nombre / Razón social: ${host.fullName}`,
    `Cuenta asociada: ${host.email}`,
    `Tel. de respaldo: ${host.phoneWhatsapp}`,
    `CUIT / CUIL: ${host.cuitCuil}`,
    `Reparto de cobros: ${host.payoutSplitArsPct}% ARS / ${usdtPct}% USDT (${host.checksumWallet})`,
    ...(host.responseScheduleSummary
      ? [`Horario de respuesta: ${host.responseScheduleSummary}`]
      : []),
    "",
    `Responder dentro de I-bita: ${adminUrl}`,
  ].join("\n");

  return {
    to,
    subject: "Nueva solicitud de aprobación de anfitrión en I-bita",
    html,
    text,
  };
}

export async function sendNewHostApprovalEmail(host: {
  fullName: string;
  email: string;
  phoneWhatsapp: string;
  cuitCuil: string;
  payoutSplitArsPct: number;
  checksumWallet: string;
  existingPropertiesCount: number;
  responseScheduleSummary?: string;
}): Promise<SendResendEmailResult> {
  return sendResendEmail(buildHostApprovalEmailPayload(host));
}

import "server-only";
import webpush from "web-push";
import { env } from "@/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WebPushNotificationPayload } from "@/types/push";

let vapidConfigured = false;

function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim() || "mailto:soporte@i-bita.com";

  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim()
  );
}

/**
 * Envía una notificación Web Push W3C (VAPID) a todas las suscripciones activas
 * de un usuario. Elimina automáticamente endpoints expirados (HTTP 404 / 410)
 * y captura errores para jamás interrumpir el flujo principal de la app.
 */
export async function sendPushNotificationToUser(
  userId: string,
  payload: WebPushNotificationPayload
): Promise<{
  configured: boolean;
  sent: number;
  removed: number;
  failed: number;
}> {
  if (!userId || !ensureVapidConfigured()) {
    return { configured: false, sent: 0, removed: 0, failed: 0 };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: subscriptions, error } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (error || !subscriptions || subscriptions.length === 0) {
      return { configured: true, sent: 0, removed: 0, failed: 0 };
    }

    const bodyJson = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/",
      icon: payload.icon ?? "/icons/icon-192.png",
      badge: payload.badge ?? "/icons/badge-72.png",
      tag: payload.tag ?? "ibita-notification",
    });

    const staleEndpoints: string[] = [];
    let sent = 0;
    let failed = 0;

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          bodyJson,
          { TTL: 86_400 }
        )
      )
    );

    results.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        sent += 1;
        return;
      }
      failed += 1;
      const errObj = result.reason as { statusCode?: number } | undefined;
      if (errObj?.statusCode === 404 || errObj?.statusCode === 410) {
        const endpoint = subscriptions[idx]?.endpoint;
        if (endpoint) {
          staleEndpoints.push(endpoint);
        }
      }
    });

    if (staleEndpoints.length > 0) {
      await admin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", staleEndpoints);
    }

    return {
      configured: true,
      sent,
      removed: staleEndpoints.length,
      failed,
    };
  } catch {
    return { configured: true, sent: 0, removed: 0, failed: 1 };
  }
}

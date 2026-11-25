"use client";

import { useCallback, useEffect, useState } from "react";

export interface UsePushNotificationsResult {
  isSupported: boolean;
  isConfigured: boolean;
  isIosNonStandalone: boolean;
  permission: NotificationPermission | "unsupported";
  isSubscribed: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
}

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectIosSafariNonStandalone(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const isIos =
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos) return false;

  const isStandaloneMedia = window.matchMedia(
    "(display-mode: standalone)"
  ).matches;
  const isNavigatorStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone
  );
  return !isStandaloneMedia && !isNavigatorStandalone;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const [isSupported, setIsSupported] = useState(false);
  const [isIosNonStandalone, setIsIosNonStandalone] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isConfigured = VAPID_PUBLIC_KEY.length >= 20;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const iosNonStandalone = detectIosSafariNonStandalone();
    setIsIosNonStandalone(iosNonStandalone);

    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);

    if (!supported) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    let active = true;
    async function syncExistingSubscription() {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        const existingSub = await reg.pushManager.getSubscription();
        if (active) {
          setIsSubscribed(Boolean(existingSub));
        }
      } catch {
        // Ignorar si el navegador bloquea Service Workers en modo privado/iframe
      }
    }

    void syncExistingSubscription();
    return () => {
      active = false;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setErrorMessage(null);

    if (detectIosSafariNonStandalone()) {
      setIsIosNonStandalone(true);
      setErrorMessage(
        'En iPhone/iPad tocá el botón "Compartir" y luego "Agregar a pantalla de inicio" para activar notificaciones push.'
      );
      return false;
    }

    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setErrorMessage(
        "Este navegador no admite notificaciones Web Push nativas."
      );
      return false;
    }

    if (!isConfigured) {
      setErrorMessage(
        "Las claves VAPID de notificaciones aún no están configuradas en este entorno."
      );
      return false;
    }

    setIsLoading(true);
    try {
      const requestedPermission = await Notification.requestPermission();
      setPermission(requestedPermission);

      if (requestedPermission !== "granted") {
        setErrorMessage(
          requestedPermission === "denied"
            ? "Bloqueaste el permiso de notificaciones en tu navegador. Habilitalo desde el candado de la barra de direcciones."
            : "No se otorgó permiso para mostrar notificaciones."
        );
        return false;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const subJson = subscription.toJSON();
      const endpoint = subJson.endpoint ?? subscription.endpoint;
      const p256dh = subJson.keys?.p256dh ?? "";
      const auth = subJson.keys?.auth ?? "";

      if (!endpoint || !p256dh || !auth) {
        throw new Error("El navegador no devolvió las claves de cifrado Web Push.");
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint,
          keys: { p256dh, auth },
        }),
      });

      if (!res.ok) {
        const errPayload = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          errPayload?.error?.message ??
            "No pudimos guardar la suscripción en el servidor."
        );
      }

      setIsSubscribed(true);
      return true;
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No se pudieron activar las notificaciones push."
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setErrorMessage(null);
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return false;
    }

    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();

      if (existingSub) {
        await fetch("/api/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existingSub.endpoint }),
        });
        await existingSub.unsubscribe();
      }

      setIsSubscribed(false);
      return true;
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No se pudieron desactivar las notificaciones push."
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isSupported,
    isConfigured,
    isIosNonStandalone,
    permission,
    isSubscribed,
    isLoading,
    errorMessage,
    subscribe,
    unsubscribe,
  };
}

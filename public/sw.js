/* Service Worker W3C Web Push para I-bita */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "I-bita",
    body: "Tenés una nueva actualización en I-bita.",
    url: "/mensajes",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    tag: "ibita-notification",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        data = {
          title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : data.title,
          body: typeof parsed.body === "string" && parsed.body.trim() ? parsed.body : data.body,
          url: typeof parsed.url === "string" && parsed.url.trim() ? parsed.url : data.url,
          icon: typeof parsed.icon === "string" && parsed.icon.trim() ? parsed.icon : data.icon,
          badge: typeof parsed.badge === "string" && parsed.badge.trim() ? parsed.badge : data.badge,
          tag: typeof parsed.tag === "string" && parsed.tag.trim() ? parsed.tag : data.tag,
        };
      }
    } catch {
      const fallbackText = event.data.text();
      if (fallbackText && fallbackText.trim()) {
        data.body = fallbackText.trim();
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      renotify: true,
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl =
    (event.notification && event.notification.data && event.notification.data.url) ||
    "/";
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            if ("navigate" in client && client.url !== targetUrl) {
              return client.navigate(targetUrl).then((navClient) => {
                if (navClient && "focus" in navClient) {
                  return navClient.focus();
                }
                return client.focus();
              });
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

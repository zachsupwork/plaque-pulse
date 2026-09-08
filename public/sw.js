/* TapLocal service worker.
 * Its only job today is notifications: showing them and, when tapped, opening the
 * SmartLink so the visit is counted exactly once by /n/{slug}.
 * Displaying a notification is never treated as a visit.
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url;
  event.notification.close();
  if (!url) return;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});

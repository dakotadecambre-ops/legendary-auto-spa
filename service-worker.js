const CACHE_NAME = "legendary-auto-spa-v25";
const APP_SHELL = [
  "./",
  "./admin.html",
  "./index.html",
  "./member.html",
  "./member-portal.html",
  "./create-member.html",
  "./member-settings.html",
  "./confirmation.html",
  "./rebook-confirm.html",
  "./disclosures.html",
  "./styles.css",
  "./admin.css",
  "./app.js",
  "./admin.js",
  "./member.js",
  "./member-portal.js",
  "./create-member.js",
  "./member-settings.js",
  "./rebook-confirm.js",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/legendary-brand.svg",
  "./assets/detail-hero-luxury.svg",
  "./assets/detail-hero.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const shouldUseNetworkFirst =
    url.origin === self.location.origin &&
    (
      event.request.mode === "navigate" ||
      url.pathname.endsWith(".html") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".css") ||
      url.pathname.startsWith("/.netlify/functions/")
    );

  if (shouldUseNetworkFirst) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || "/admin";
  event.waitUntil(focusOrOpen(destination));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = {
      title: "Legendary Auto Spa",
      body: event.data?.text() || "A new update is available."
    };
  }

  const title = payload.title || "Legendary Auto Spa";
  const options = {
    body: payload.body || "A new update is available.",
    icon: payload.icon || "/assets/icon.svg",
    badge: payload.badge || "/assets/icon.svg",
    tag: payload.tag || "legendary-admin",
    data: payload.data || { url: payload.url || "/admin" },
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

async function focusOrOpen(url) {
  const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
  const targetPath = new URL(url, self.location.origin).pathname;

  for (const client of clientList) {
    const clientUrl = new URL(client.url);
    if (clientUrl.pathname === targetPath && "focus" in client) {
      return client.focus();
    }
  }

  if (clients.openWindow) {
    return clients.openWindow(url);
  }

  return undefined;
}

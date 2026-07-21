const CACHE_NAME = "legendary-auto-spa-v16";
const APP_SHELL = [
  "./",
  "./index.html",
  "./member.html",
  "./confirmation.html",
  "./rebook-confirm.html",
  "./styles.css",
  "./app.js",
  "./member.js",
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
  event.waitUntil(clients.openWindow("/admin"));
});

const CACHE_NAME = "buytune-v2";

const STATIC_EXTENSIONS = ['.woff', '.woff2', '.png', '.ico', '.svg'];

self.addEventListener("install", () => {
  self.skipWaiting();
});

// Allow the app to trigger an update
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clear ALL old caches on activate
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== "GET") return;

  // Only cache fonts and images from our own domain
  // NEVER cache HTML pages, API routes, or anything that needs auth
  const isStaticAsset =
    url.hostname === self.location.hostname &&
    STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
    )
  );
});

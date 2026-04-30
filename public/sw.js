const CACHE_NAME = "buytune-v1";

// Assets to cache on install
const PRECACHE_ASSETS = [
  "/",
  "/dashboard",
  "/offline",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Soft fail — don't block install if some assets fail
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, and API/auth requests
  if (
    request.method !== "GET" ||
    url.protocol === "chrome-extension:" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("finnhub") ||
    url.hostname.includes("x.ai") ||
    url.hostname.includes("googleapis")
  ) {
    return;
  }

  // Network first for HTML pages, cache first for static assets
  if (request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || caches.match("/offline")
          )
        )
    );
  } else {
    // Cache first for static assets (fonts, images, JS, CSS)
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
  }
});

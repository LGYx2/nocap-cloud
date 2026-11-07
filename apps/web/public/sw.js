// Nocap Cloud panel service worker. Deliberately small:
// - Built files (/assets/*, fonts, icons) are cached after the first load. Their names change on
//   every build, so a cached copy is never stale.
// - Pages always come from the network, so a new panel version shows up on the next load. When
//   the server cannot be reached, the offline page is shown instead.
// - /api/* is never touched: logs, variables and server data must always be fresh.
const VERSION = "__NOCAP_BUILD__";
const CACHE = `nocap-${VERSION}`;
const OFFLINE = "/offline.html";
const PRECACHE = [OFFLINE, "/favicon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/assets/") || /\.(png|svg|woff2?|webmanifest)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

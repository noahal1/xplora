/* Xplora Service Worker — v2 */

const CACHE_NAME = "xplora-v2";

// Assets to pre-cache on install (the app shell)
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
];

// ── Install: pre-cache the app shell ───────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches, take over clients ───────────────
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

// ── Fetch strategy ────────────────────────────────────────────────
//   API            → network-first  (fresh data always)
//   Static assets  → network-first  (always check for new build, fallback to cache)
//   Navigation     → network-first  (fresh HTML, fallback to cached shell)
//   Everything else → network-first
//
// Using network-first for everything means the app always loads the
// latest code when online, while still working offline thanks to the
// cache fallback.  Vite's content-based hashing ensures that new
// deployments always have unique filenames, so there's never a risk
// of serving the wrong cached chunk for a given HTML page.
// ──────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  event.respondWith(networkFirst(request));
});

// ── Network-first strategy ─────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response("Offline", { status: 503 });
  }
}

/* Tabula service worker — offline support for the installed PWA.
 *
 * Strategy:
 *   • Navigation (index.html): network-first, fall back to cache. So an online
 *     launch always gets the latest build, but an offline launch still opens.
 *   • Everything else (React/lamejs from CDN, fonts, drum samples, icon):
 *     cache-first, populated on first fetch. After you've used the app online
 *     once, those bytes are served from cache offline.
 *   • Best-effort precache on install of the app shell + the default 808 kit,
 *     so a fresh install works offline immediately (even before you hit play).
 *
 * Bump CACHE when the shell/precache list changes to force a clean re-cache.
 */
const CACHE = "tabula-v1";

// Must-have, small, same-origin. If any of these fail the install still
// proceeds (we catch) — the fetch handler will fill gaps on first online use.
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

// Best-effort: third-party libs + the default kit. Cached individually so one
// failure (e.g. a flaky CDN) doesn't abort the whole precache.
const WARM = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js",
  "samples/808-kit/BD.wav", "samples/808-kit/SD.wav", "samples/808-kit/CP.wav",
  "samples/808-kit/CL.wav", "samples/808-kit/CB.wav", "samples/808-kit/LT.wav",
  "samples/808-kit/MT.wav", "samples/808-kit/HT.wav", "samples/808-kit/CH.wav",
  "samples/808-kit/OH.wav", "samples/808-kit/CY.wav", "samples/808-kit/RM.wav",
  "samples/808-kit/SH.wav",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL).catch(() => {});
    await Promise.all(WARM.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const isNav = req.mode === "navigate" || req.destination === "document";
  if (isNav) {
    // Network-first so a new deploy lands as soon as you're online.
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE);
        c.put("./index.html", net.clone());
        return net;
      } catch (_) {
        return (await caches.match("./index.html")) ||
               (await caches.match("./")) ||
               new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  // Cache-first for static assets (libs, samples, fonts, icon).
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const net = await fetch(req);
      if (net && (net.ok || net.type === "opaque")) {
        const c = await caches.open(CACHE);
        c.put(req, net.clone());
      }
      return net;
    } catch (_) {
      return hit || new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});

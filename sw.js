/* Loud Light service worker — offline support for the installed PWA.
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
const CACHE = "loudlight-v1";

// Must-have, small, same-origin. If any of these fail the install still
// proceeds (we catch) — the fetch handler will fill gaps on first online use.
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.png", "./icon-mark.png", "./icon.svg"];

// Best-effort: third-party libs + both shipped kits. Cached individually so one
// failure (e.g. a flaky CDN) doesn't abort the whole precache. ~8MB total — a
// one-time cost on install of a PWA you deliberately added to the home screen.
const WARM = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js",
  // 808 kit
  "samples/808-kit/BD.wav", "samples/808-kit/SD.wav", "samples/808-kit/CP.wav",
  "samples/808-kit/CL.wav", "samples/808-kit/CB.wav", "samples/808-kit/LT.wav",
  "samples/808-kit/MT.wav", "samples/808-kit/HT.wav", "samples/808-kit/CH.wav",
  "samples/808-kit/OH.wav", "samples/808-kit/CY.wav", "samples/808-kit/RM.wav",
  "samples/808-kit/SH.wav",
  // VP kit (velocity layers + round-robins included)
  "samples/vp-kit/BDv1.wav", "samples/vp-kit/BDv2.wav",
  "samples/vp-kit/SDv1.wav", "samples/vp-kit/SDv2.wav", "samples/vp-kit/SDv3.wav",
  "samples/vp-kit/RM.wav", "samples/vp-kit/CP.wav", "samples/vp-kit/HT.wav",
  "samples/vp-kit/MT.wav", "samples/vp-kit/LT.wav", "samples/vp-kit/OH.wav",
  "samples/vp-kit/CY.wav", "samples/vp-kit/CL.wav", "samples/vp-kit/CB.aiff",
  "samples/vp-kit/CH1.wav", "samples/vp-kit/CH2.wav", "samples/vp-kit/CH3.wav",
  "samples/vp-kit/CH4.wav", "samples/vp-kit/CH5.wav", "samples/vp-kit/CH6.wav",
  "samples/vp-kit/SH1.wav", "samples/vp-kit/SH2.wav", "samples/vp-kit/SH3.wav",
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

  // Cloud-sync API traffic is never cached. These are cross-origin GETs, so
  // they'd otherwise fall into the cache-first branch below and a stale project
  // list would be served forever — and there is nothing useful to hand back
  // offline anyway. Let them go straight to the network and fail honestly.
  try {
    const u = new URL(req.url);
    if (u.pathname.startsWith("/rest/v1/") || u.pathname.startsWith("/auth/v1/")) return;
  } catch (_) {}

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

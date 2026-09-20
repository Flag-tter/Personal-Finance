/* ===========================================================
   LEDGER — SERVICE WORKER
   Purpose: let the app shell (this HTML/CSS/JS + icons) open even
   with no connection, instead of the browser's offline error page.
   It deliberately does NOT cache anything from Firebase (Auth,
   Firestore, gstatic, googleapis, etc.) — financial data must always
   come from the network or from Firestore's own IndexedDB offline
   cache, never from here, so numbers are never served stale.
   =========================================================== */

const CACHE_NAME = 'ledger-shell-v1';
const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {}) // best-effort — a failed precache shouldn't block install
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // never touch Firebase/CDN requests

  // Page navigations: try the network first (so signed-in users always see
  // live app code), fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./').then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Static shell assets (manifest, icons): cache-first, refresh in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

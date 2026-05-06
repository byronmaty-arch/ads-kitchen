// AD's Kitchen Service Worker
// Strategy:
//   - /api/*    → always network, never cached (live data)
//   - HTML      → network-first, fall back to cache (fresh when online)
//   - Static    → cache-first (instant load, background-updated)
const CACHE_NAME = 'ads-kitchen-v7';
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/manifest.json',
  '/icons/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API — always live
  if (url.pathname.startsWith('/api/')) return;

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  const isHTML = e.request.mode === 'navigate' ||
    (e.request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Network-first for HTML so deploys show up immediately
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return r;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    );
    return;
  }

  // Cache-first for static assets (CSS/JS/images)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        // Revalidate in background so the next load has fresh assets
        fetch(e.request).then(r => {
          if (r && r.ok) {
            const clone = r.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then(r => {
        if (r && r.ok) {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return r;
      });
    })
  );
});

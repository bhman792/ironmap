// ============================================================
//  IronMap — Service Worker
//  Caches the app shell for offline use.
//  API calls always go to network — no stale fitness data.
// ============================================================

const CACHE_NAME   = 'ironmap-v2';
const CACHE_STATIC = [
  '/app',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon_192.png',
  '/icons/icon_512.png',
];

// ── Install — cache the app shell ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_STATIC).catch(err => {
        console.warn('SW: some files failed to cache', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate — clean up old caches ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch — network first for API, cache first for assets ────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for API calls
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline — no network connection' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Cache first for everything else (HTML, CSS, icons)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Return cached index.html for navigation requests when offline
        if (event.request.mode === 'navigate') {
          return caches.match('/app');
        }
      });
    })
  );
});

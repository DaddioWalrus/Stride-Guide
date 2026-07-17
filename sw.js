// Stride Guide service worker — app-shell cache.
// Goal: the app always *opens*, even offline. Live data (routing, search,
// Supabase, map tiles) stays network-only.

const SHELL_CACHE = 'sg-shell-v1';

const SHELL = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/theme-init.js',
  '/js/map.js',
  '/js/route.js',
  '/js/ui.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.108.1/dist/umd/supabase.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-rotate@0.2.8/dist/leaflet-rotate-src.js',
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(
          keys.filter(function (k) { return k !== SHELL_CACHE; })
              .map(function (k) { return caches.delete(k); })
        );
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Live data — never intercept: routing proxy, geocoders, Supabase, tiles.
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname === 'nominatim.openstreetmap.org') return;
  if (url.hostname === 'photon.komoot.io') return;
  if (url.hostname.endsWith('.supabase.co')) return;
  if (url.hostname.endsWith('tile.openstreetmap.org')) return;
  if (url.hostname.endsWith('arcgis.com')) return;

  // App navigation: network first, cached shell as offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('/index.html').then(function (r) {
          return r || caches.match('/');
        });
      })
    );
    return;
  }

  // Shell assets: network first (fresh deploys win), cache fallback (offline).
  e.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () { return caches.match(req); })
  );
});

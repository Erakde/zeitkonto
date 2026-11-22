// Offline support. Each release gets its own cache; a new release waits until the
// user taps "Reload" in the app (or all app windows were closed), then replaces the old one.
const CACHE = 'zeitkonto-v2';            // raise together with APP_VERSION in app.js
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' bypasses the browser's HTTP cache so we really get the new files
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
    catch { return (await cache.match('index.html')) || Response.error(); }
  }));
});

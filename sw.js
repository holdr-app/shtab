const V = 'shtab-v14';
const FILES = ['./', './index.html', './app.css', './db.js', './lib.js', './registry.js', './finance.js', './habits.js', './diary.js', './vault.js', './plan.js', './today.js', './settings.js', './reports.js', './search.js', './lock.js', './ui.js', './viewer.js', './app.js', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // сначала из кэша (быстро и без сети), параллельно тихо обновляем кэш
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(V).then(c => c.match(e.request, { ignoreSearch: true }).then(hit => {
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  })));
});

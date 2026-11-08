/* Trad Center — service worker : jeu installable et jouable hors connexion.
 * Fichiers du jeu : réseau d'abord (toujours la dernière version), cache en secours.
 * Les API de prix et les photos ne sont jamais mises en cache ici. */
const CACHE = 'tradcenter-v4';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'js/catalog.js', 'js/util.js', 'js/data.js', 'js/images.js', 'js/game.js', 'js/chart.js', 'js/ui.js', 'js/app.js', 'js/vendor/lightweight-charts.standalone.production.js', 'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'js/config.js', 'js/net.js', 'js/social.js', 'js/images.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

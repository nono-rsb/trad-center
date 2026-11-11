/* Trad Center — service worker : jeu installable et jouable hors connexion.
 * Fichiers du jeu : réseau d'abord (toujours la dernière version), cache en secours.
 * Les API de prix et les photos ne sont jamais mises en cache ici. */
const CACHE = 'tradcenter-v48';
const FILES = [...new Set(['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'css/glass.css', 'js/config.js', 'js/catalog.js', 'js/util.js', 'js/data.js', 'js/images.js', 'js/game.js', 'js/tax.js', 'js/playtime.js', 'js/chart.js', 'js/ui.js', 'js/net.js', 'js/app.js', 'js/social.js', 'js/notify.js', 'js/xmas.js', 'js/weekly.js', 'js/cheats.js', 'js/chest.js', 'js/style.js', 'js/teddy.js', 'js/quiz.js', 'js/bot.js', 'js/admin.js', 'js/city.js', 'js/city3d.js', 'js/mayor.js', 'js/clan.js', 'js/card.js', 'icons/teddy.svg', 'js/vendor/lightweight-charts.standalone.production.js', 'icons/logo.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png', 'announce.json'])];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(f)))));
});
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});

/* ---------- Notifications push (envoyées par le serveur, appli fermée) ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (er) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Trad Center', {
      body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
      icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: d.url || './' },
    }),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => list.forEach(c => c.postMessage({ type: 'push', title: d.title, body: d.body }))),
  ]));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => { }); return c.focus(); } }
    return clients.openWindow(url);
  }));
});

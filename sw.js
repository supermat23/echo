/* Écho — service worker
   Cache hors ligne de l'application.
   IMPORTANT : après chaque modification de index.html, changez VERSION
   (ex. 'echo-v2') pour que les utilisateurs reçoivent la mise à jour. */
const VERSION = 'echo-v5';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    /* chaque fichier est mis en cache indépendamment : une icône manquante
       ne doit pas empêcher l'installation */
    await Promise.all(CORE.map(u => c.add(u).catch(() => {})));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* Polices Google : cache opportuniste pour l'usage hors ligne.
     Les APIs (Groq, etc.) sont cross-origin non listées → toujours réseau. */
  if (url.origin !== self.location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
      e.respondWith((async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })());
    }
    return;
  }

  e.respondWith((async () => {
    /* La page elle-même : réseau d'abord (dernière version disponible),
       cache en secours hors ligne. */
    if (req.mode === 'navigate') {
      try {
        const res = await fetch(req);
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        return res;
      } catch (err) {
        return (await caches.match(req, { ignoreSearch: true }))
            || (await caches.match('./index.html'))
            || (await caches.match('./'))
            || Response.error();
      }
    }
    /* Ressources locales : cache d'abord, puis mise à jour discrète. */
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      fetch(req).then(res => {
        if (res.ok) caches.open(VERSION).then(c => c.put(req, res.clone()));
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
const CACHE = 'luma-shell-v1';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const response = await fetch(new URL('precache-manifest.json', scope), { cache: 'no-store' });
    if (!response.ok) throw new Error('Precache manifest unavailable');
    const urls = await response.json();
    const cache = await caches.open(CACHE);
    await cache.addAll(
      urls.map(url => new Request(new URL(url, scope), { cache: 'reload' })),
    );
  })());
});
self.addEventListener('activate', event => event.waitUntil((async () => { const names = await caches.keys(); await Promise.all(names.filter(name => name.startsWith('luma-shell-') && name !== CACHE).map(name => caches.delete(name))); await self.clients.claim(); })()));
self.addEventListener('fetch', event => { const request = event.request; const url = new URL(request.url); const scope = new URL(self.registration.scope); if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return; if (request.mode === 'navigate') { event.respondWith(fetch(request).then(response => { if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(new URL('./', scope).toString(), copy)); } return response; }).catch(() => caches.match(new URL('./', scope).toString(), { ignoreVary: true }))); return; } if (!/\.(?:js|css|svg|png|webmanifest)$/.test(url.pathname)) return; event.respondWith(caches.match(request.url, { ignoreVary: true }).then(cached => cached || fetch(request))); });

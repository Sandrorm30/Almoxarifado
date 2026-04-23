const CACHE_NAME = 'pmrg-estoque-v6';
const ASSETS = [
  './',
  './index.html',
  './index.html?v=6',
  './style.css',
  './style.css?v=6',
  './app.js',
  './app.js?v=6',
  './manifest.webmanifest',
  './manifest.webmanifest?v=6',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
// Service Worker pour Maxence Rider (mode 100% hors-ligne sur mobile)

const CACHE_NAME = 'maxence-rider-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './dist/bundle.js',
  './assets/atlas.png',
  './assets/bg/theme1.png',
  './assets/bg/theme2.png',
  './assets/bg/theme3.png',
  './assets/bg/theme4.png',
  './assets/bg/theme5.png',
  './assets/bg/obstacles.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => response || fetch(event.request))
  );
});

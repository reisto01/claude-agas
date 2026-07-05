// Network First Service Worker
const CACHE_NAME = 'claude-cache-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/script.js',
  '/favicon.svg',
  '/firebase-app-compat.js',
  '/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // addAll ignores query strings, but handles basic paths
        return cache.addAll(ASSETS).catch(err => console.warn("Cache add error:", err));
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache the latest version if successful
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline mode)
        return caches.match(event.request, { ignoreSearch: true });
      })
  );
});

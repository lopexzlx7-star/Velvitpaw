const CACHE_VERSION = 'velvit-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function shouldBypass(url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.hostname.includes('firebaseio.com')) return true;
  if (url.hostname.includes('googleapis.com')) return true;
  if (url.hostname.includes('firebaseapp.com')) return true;
  if (url.hostname.includes('cloudfunctions.net')) return true;
  return false;
}

function isAssetRequest(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|eot)$/i.test(url.pathname);
}

function isImageRequest(url) {
  return /\.(?:png|jpg|jpeg|gif|webp|svg|ico|avif)$/i.test(url.pathname)
    || url.hostname.includes('res.cloudinary.com')
    || url.hostname.includes('ik.imagekit.io')
    || url.hostname.includes('storjshare.io');
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkPromise;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const fallback = (await caches.match('/index.html')) || (await cache.match('/index.html'));
    if (fallback) return fallback;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (shouldBypass(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.origin === self.location.origin && isAssetRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (isImageRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

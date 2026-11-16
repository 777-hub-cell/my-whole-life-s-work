const CACHE_NAME = 'aharane-local-studio-shell-v1'
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icon.svg'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('aharane-local-studio-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  event.respondWith((async () => {
    try {
      const response = await fetch(request)
      if (response && response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME)
        cache.put(request, response.clone()).catch(() => {})
      }
      return response
    } catch {
      const cached = await caches.match(request)
      if (cached) return cached
      if (request.mode === 'navigate') {
        return (await caches.match('/index.html')) || Response.error()
      }
      return Response.error()
    }
  })())
})
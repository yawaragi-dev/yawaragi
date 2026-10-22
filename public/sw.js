/*
 * Yawaragi's service worker (#480, slice 3). It does one thing: when a page
 * load fails because there is no network, it answers with a cached "You're
 * offline" page instead of the browser's own. Everything else — every other
 * request, and every page load that reaches the server — goes to the network
 * untouched, and nothing but the two offline pages is ever cached, so no
 * journal, cellar or other personal data can land in Cache Storage.
 *
 * Bump VERSION when the offline page changes, so installs fetch the new one.
 * To retire the worker, replace this file with one that calls
 * `self.registration.unregister()` on activate.
 */
const VERSION = 'v1'
const CACHE = `yawaragi-offline-${VERSION}`
const LOCALES = ['en', 'de']
const pageFor = (locale) => `/api/offline/${locale}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(LOCALES.map(pageFor)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name.startsWith('yawaragi-') && name !== CACHE).map((name) => caches.delete(name)))
      // Lets the page request start while the worker boots, so a page load
      // is not slowed by having a worker at all.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse
        return preloaded || (await fetch(event.request))
      } catch {
        const segment = new URL(event.request.url).pathname.split('/')[1]
        const locale = LOCALES.includes(segment) ? segment : 'en'
        const cached = await caches.match(pageFor(locale), { cacheName: CACHE })
        return cached || Response.error()
      }
    })(),
  )
})

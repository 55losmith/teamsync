const CACHE_NAME = 'huddleup-app-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/huddleup-icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  )
})

self.addEventListener('push', (event) => {
  let payload
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data?.text() }
  }

  const title = payload.title || 'HuddleUp'
  const options = {
    badge: '/icons/huddleup-icon.svg',
    body: payload.body || 'You have a new HuddleUp update.',
    data: { url: payload.url || '/' },
    icon: '/icons/huddleup-icon.svg',
    tag: payload.tag || 'huddleup-update',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
      const existingClient = clients.find((client) => new URL(client.url).pathname === new URL(url, self.location.origin).pathname)
      if (existingClient) return existingClient.focus()
      return self.clients.openWindow(url)
    }),
  )
})

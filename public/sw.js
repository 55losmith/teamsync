const CACHE_NAME = 'teamsync-app-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/teamsync-icon.svg']

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

  const title = payload.title || 'TeamSync'
  const options = {
    badge: '/icons/teamsync-icon.svg',
    body: payload.body || 'You have a new TeamSync update.',
    data: { url: payload.url || '/' },
    icon: '/icons/teamsync-icon.svg',
    tag: payload.tag || 'teamsync-update',
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

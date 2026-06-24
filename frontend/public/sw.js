// Минимальный Service Worker: только push-уведомления.
// Никакого кэширования fetch-запросов — это вызывало баги при деплое
// (старые JS-чанки в кэше → 404 → React hydration error → сломанный сайт).
// При первом заходе после обновления старые кэши очищаются.

const VERSION = 'croon-v4-nocache-2026-05-27'

self.addEventListener('install', () => {
  // Активируем новый SW сразу, не ждём закрытия вкладок
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Удаляем ВСЕ старые кэши, какие бы они ни были
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    // Берём контроль над открытыми вкладками сразу
    await self.clients.claim()
  })())
})

// Push notification received
self.addEventListener('push', (event) => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'ИП КРУН', {
      body: data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-96x96.png',
      data: { url: data.url || '/admin' },
      vibrate: [200, 100, 200],
    })
  )
})

// Click on notification — open the URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = event.notification.data?.url || '/admin'
  const fullUrl = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(fullUrl)
          return
        }
      }
      return self.clients.openWindow(fullUrl)
    })
  )
})

// НЕТ fetch-listener'а — браузер ходит в сеть напрямую, без нашего вмешательства

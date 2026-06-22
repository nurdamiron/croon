import webpush from 'web-push'
import { prisma } from './prisma'
import { getFlag, notifyFlagKey, type NotifyChannel } from './app-settings'

// Зеркалим уведомление в операционный мозг Biz через его существующий приёмник
// POST /api/internal/activity. Никаких новых эндпоинтов — только исходящий вызов.
// Если BIZ_INTERNAL_URL/KEY не заданы — тихо пропускаем (dev / не настроено).
async function forwardToBiz(type: string, title: string, body: string): Promise<void> {
  const base = process.env.BIZ_INTERNAL_URL
  const key = process.env.BIZ_INTERNAL_KEY
  if (!base || !key) return
  try {
    await fetch(`${base.replace(/\/$/, '')}/api/internal/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': key },
      body: JSON.stringify({ serviceId: 'alash-electronics', type, title, description: body }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    /* fire-and-forget: сбой форварда не должен ломать уведомления админам */
  }
}

export async function notifyAdmins(title: string, body: string, url?: string, channel?: NotifyChannel) {
  // Канальный тумблер. Если канал передан и выключен в админке — молча выходим.
  if (channel) {
    const enabled = await getFlag(notifyFlagKey(channel), true)
    if (!enabled) return
  }

  // Форвард в Biz идёт независимо от web-push конфигурации/подписок (до ранних return ниже).
  await forwardToBiz(channel || 'notification', title, body)

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    console.warn('VAPID keys not configured, skipping push')
    return
  }

  webpush.setVapidDetails('mailto:info@alash-electronics.kz', publicKey, privateKey)

  const subs = await prisma.pushSubscription.findMany({
    where: { user: { role: 'ADMIN' } },
  })

  if (subs.length === 0) {
    console.log('No admin push subscriptions found')
    return
  }

  const payload = JSON.stringify({ title, body, url: url || '/admin' })

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      ).catch(async (err) => {
        console.error('Push failed for', sub.endpoint.slice(0, 50), err.statusCode || err.message)
        if (err.statusCode === 404 || err.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        }
      })
    )
  )

  console.log('Push results:', results.map(r => r.status))
  return results
}

import webpush from 'web-push'
import { prisma } from './prisma'
import { getFlag, notifyFlagKey, type NotifyChannel } from './app-settings'

export async function notifyAdmins(title: string, body: string, url?: string, channel?: NotifyChannel) {
  if (channel) {
    const enabled = await getFlag(notifyFlagKey(channel), true)
    if (!enabled) return
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    console.warn('VAPID keys not configured, skipping push')
    return
  }

  webpush.setVapidDetails('mailto:info@croon.kz', publicKey, privateKey)

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

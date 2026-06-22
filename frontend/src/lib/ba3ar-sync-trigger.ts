// Мгновенный пуш остатков на витрину ba3ar.kz (единый склад с Alash).
// Витрина ba3ar читает остатки из своего products.json, который обновляет
// её роут /api/admin/sync-alash-stock (тянет /api/admin/catalog-export).
// Раньше это делал только cron (раз в 15 мин) → лаг. Теперь дёргаем сразу
// после изменения остатка (смена статуса заказа), чтобы было near-realtime.
//
// Env на Alash:
//   BA3AR_SYNC_URL    — напр. https://ba3ar.alashed.kz/api/admin/sync-alash-stock
//   BA3AR_SYNC_SECRET — = ALASH_SYNC_SECRET на стороне витрины ba3ar
//
// Fire-and-forget: ошибки глотаем (cron всё равно догонит). Не блокирует ответ.
export async function triggerBa3arStockSync(): Promise<void> {
  const url = process.env.BA3AR_SYNC_URL
  const secret = process.env.BA3AR_SYNC_SECRET
  if (!url || !secret) return
  try {
    await fetch(`${url}?secret=${encodeURIComponent(secret)}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    // витрина недоступна / таймаут — игнорируем, cron синкнёт позже
  }
}

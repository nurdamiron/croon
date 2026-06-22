#!/usr/bin/env node
/**
 * Cron-обёртка для синхронизации Kaspi-заказов.
 * Дёргает HTTP-эндпоинт /api/cron/kaspi-sync на работающем инстансе (PM2),
 * чтобы переиспользовать собранный код (lib/kaspi-sync.ts) без отдельной
 * TS-компиляции в скрипте.
 *
 * Переменные окружения:
 *   SYNC_URL     — базовый URL (по умолчанию http://localhost:5000)
 *   CRON_SECRET  — секрет, должен совпадать с CRON_SECRET в .env приложения
 *   SYNC_DAYS    — за сколько дней тянуть (по умолчанию 30)
 *
 * Пример cron (каждые 15 минут):
 *   *\/15 * * * * cd /home/ubuntu/alashed-shop/frontend && CRON_SECRET=xxx node scripts/kaspi-sync-orders.js >> ~/logs/kaspi-sync.log 2>&1
 */

const base = (process.env.SYNC_URL || 'http://localhost:5000').replace(/\/$/, '')
const secret = process.env.CRON_SECRET || ''
const days = Number(process.env.SYNC_DAYS) > 0 ? Number(process.env.SYNC_DAYS) : 30

async function main() {
  if (!secret) {
    console.error(`[${new Date().toISOString()}] CRON_SECRET не задан`)
    process.exit(1)
  }
  const url = `${base}/api/cron/kaspi-sync?days=${days}`
  const started = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await res.json().catch(() => ({}))
    const ms = Date.now() - started
    const stamp = new Date().toISOString()
    if (res.ok || res.status === 207) {
      console.log(`[${stamp}] ok=${res.status} fetched=${data.fetched} upserted=${data.upserted} reserved=${data.reserved} completed=${data.completed} released=${data.released} unmatched=${data.unmatchedItems} errors=${(data.errors || []).length} (${ms}ms)`)
      if (data.errors && data.errors.length) {
        for (const e of data.errors.slice(0, 10)) console.warn(`  ! ${e}`)
      }
    } else {
      console.error(`[${stamp}] HTTP ${res.status}: ${JSON.stringify(data)}`)
      process.exit(1)
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] fetch error: ${e.message}`)
    process.exit(1)
  }
}

main()

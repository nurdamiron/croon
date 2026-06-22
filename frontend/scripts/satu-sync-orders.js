#!/usr/bin/env node
/**
 * Cron-обёртка: импорт заказов Satu + бронь/списание.
 * Дёргает /api/cron/satu-sync-orders на работающем инстансе.
 * ENV: SYNC_URL (default http://localhost:5000), CRON_SECRET, SYNC_DAYS (default 30).
 * Пример cron (каждые 15 минут):
 *   *\/15 * * * * cd /home/ubuntu/alashed-shop/frontend && CRON_SECRET=xxx node scripts/satu-sync-orders.js >> ~/logs/satu-orders.log 2>&1
 */
const base = (process.env.SYNC_URL || 'http://localhost:5000').replace(/\/$/, '')
const secret = process.env.CRON_SECRET || ''
const days = Number(process.env.SYNC_DAYS) > 0 ? Number(process.env.SYNC_DAYS) : 30

async function main() {
  if (!secret) { console.error(`[${new Date().toISOString()}] CRON_SECRET не задан`); process.exit(1) }
  const started = Date.now()
  try {
    const res = await fetch(`${base}/api/cron/satu-sync-orders?days=${days}`, {
      method: 'POST', headers: { Authorization: `Bearer ${secret}` },
    })
    const d = await res.json().catch(() => ({}))
    const ms = Date.now() - started
    const stamp = new Date().toISOString()
    if (res.ok || res.status === 207) {
      console.log(`[${stamp}] fetched=${d.fetched} upserted=${d.upserted} reserved=${d.reserved} completed=${d.completed} released=${d.released} unmatched=${d.unmatchedItems} errors=${(d.errors || []).length} (${ms}ms)`)
      for (const e of (d.errors || []).slice(0, 5)) console.warn(`  ! ${e}`)
    } else {
      console.error(`[${stamp}] HTTP ${res.status}: ${JSON.stringify(d)}`); process.exit(1)
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] fetch error: ${e.message}`); process.exit(1)
  }
}
main()

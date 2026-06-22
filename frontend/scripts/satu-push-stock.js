#!/usr/bin/env node
/**
 * Cron-обёртка для воркера очереди остатков Satu.
 * Дёргает /api/cron/satu-push на работающем инстансе (переиспользует
 * собранный код lib/satu-sync.ts без TS-компиляции в скрипте).
 *
 * ENV: SYNC_URL (default http://localhost:5000), CRON_SECRET (как в .env приложения).
 *
 * Пример cron (каждую минуту):
 *   * * * * * cd /home/ubuntu/alashed-shop/frontend && CRON_SECRET=xxx node scripts/satu-push-stock.js >> ~/logs/satu-push.log 2>&1
 */
const base = (process.env.SYNC_URL || 'http://localhost:5000').replace(/\/$/, '')
const secret = process.env.CRON_SECRET || ''

async function main() {
  if (!secret) { console.error(`[${new Date().toISOString()}] CRON_SECRET не задан`); process.exit(1) }
  const started = Date.now()
  try {
    const res = await fetch(`${base}/api/cron/satu-push`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
    })
    const data = await res.json().catch(() => ({}))
    const ms = Date.now() - started
    const stamp = new Date().toISOString()
    if (res.ok || res.status === 207) {
      // лог только если было что отправлять (чтобы не засорять каждую минуту)
      if ((data.candidates || 0) > 0 || (data.errors || []).length) {
        console.log(`[${stamp}] candidates=${data.candidates} sent=${data.sent} processed=${data.processed} errors=${(data.errors || []).length} (${ms}ms)`)
        for (const e of (data.errors || []).slice(0, 5)) console.warn(`  ! ${e}`)
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

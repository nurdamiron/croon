#!/usr/bin/env node
// Внешний воркер демпинга Kaspi.
//
// ЗАЧЕМ: эндпоинт offer-view (цены конкурентов) блокируется Kaspi с дата-центр IP
// (наш EC2 → 405/429). Поэтому цены снимает ЭТОТ воркер на резидентном IP (твоя
// машина / локальный VPS в KZ), а серверу шлёт уже снятые офферы — сервер считает
// и применяет цену (он сам в Kaspi не ходит).
//
// КАК РАБОТАЕТ (один цикл):
//   1) GET  {SITE}/api/admin/kaspi-dumping/tasks?secret=...   → список {offerId, pid}
//   2) для каждого PID снимает offer-view (троттлинг ~700мс)
//   3) POST {SITE}/api/admin/kaspi-dumping/ingest?secret=...  → сервер применяет
//
// ЗАПУСК (с машины с резидентным KZ IP):
//   SITE=https://croon.kz DUMPING_SECRET=<CRON_SECRET> node kaspi-dumping-worker.mjs
//   --once   один прогон и выход (по умолчанию — цикл каждые LOOP_MIN минут)
//   --dry    разведка: снять цены, но сервер НЕ меняет цену (ingest dryRun)
//   --scan   ТОЛЬКО снять позицию/цену лидера по ВСЕМ активным офферам и записать
//            в БД (наполнить колонку «Поз.» в админке). Цену не меняет, тумблер
//            демпинга на сервере включать НЕ нужно. Идеально для первого осмотра:
//            «где я стою и почём первый» по всему каталогу.
//            Пример: SITE=... DUMPING_SECRET=... node kaspi-dumping-worker.mjs --once --scan
//
// Переменные:
//   SITE            базовый URL прода (по умолчанию https://croon.kz)
//   DUMPING_SECRET  = CRON_SECRET с сервера (обязателен)
//   CITY            cityId (по умолчанию приходит с сервера; запасной 750000000)
//   LOOP_MIN        интервал цикла, мин (по умолчанию 30 — фид Kaspi всё равно раз в ~60м)
//   THROTTLE_MS     пауза между запросами к Kaspi (по умолчанию 700)

const SITE = (process.env.SITE || 'https://croon.kz').replace(/\/$/, '')
const SECRET = process.env.DUMPING_SECRET || ''
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 700)
const LOOP_MIN = Number(process.env.LOOP_MIN || 30)
const ONCE = process.argv.includes('--once')
const DRY = process.argv.includes('--dry')
// --scan: только снять позицию/цену лидера по ВСЕМ активным офферам (наполнить
// колонку «Поз.» в админке), цену НЕ менять, глобальный тумблер демпинга не нужен.
const SCAN = process.argv.includes('--scan')
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

if (!SECRET) {
  console.error('❌ DUMPING_SECRET не задан (= CRON_SECRET с сервера). Пример:')
  console.error('   SITE=https://croon.kz DUMPING_SECRET=xxxx node kaspi-dumping-worker.mjs --once')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// Снять offer-view по PID (резидентный IP). Ретрай на 429/5xx.
async function fetchOffers(pid, cityId, attempt = 0) {
  try {
    const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${pid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/*',
        Referer: `https://kaspi.kz/shop/p/-${pid}/`,
        'User-Agent': UA,
        'Accept-Language': 'ru,en;q=0.9',
      },
      body: JSON.stringify({ cityId, id: pid, page: 0, limit: 64, sortOption: 'PRICE', installationId: '-1' }),
    })
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(Math.min(8000, 800 * 2 ** attempt) + Math.floor(Math.random() * 400))
      return fetchOffers(pid, cityId, attempt + 1)
    }
    if (!res.ok) return { error: `offer-view ${res.status}` }
    const d = await res.json()
    const offers = (Array.isArray(d.offers) ? d.offers : []).map((o) => ({
      price: Math.round(Number(o.price)),
      merchantId: String(o.merchantId ?? ''),
      merchantName: String(o.merchantName ?? ''),
      rating: o.merchantRating != null ? Number(o.merchantRating) : null,
      reviews: o.merchantReviewsQuantity != null ? Number(o.merchantReviewsQuantity) : null,
      kaspiDelivery: !!o.kaspiDelivery,
      deliveryDuration: o.deliveryDuration != null ? String(o.deliveryDuration) : null,
    })).filter((o) => Number.isFinite(o.price) && o.price > 0)
    return { offers }
  } catch (e) {
    return { error: e.message }
  }
}

async function runOnce() {
  // 1) задания (scan → все активные офферы; иначе — только с включённым демпингом)
  let taskResp
  try {
    const url = `${SITE}/api/admin/kaspi-dumping/tasks?secret=${encodeURIComponent(SECRET)}${SCAN ? '&scan=1' : ''}`
    const r = await fetch(url)
    taskResp = await r.json()
    if (!r.ok) throw new Error(taskResp.error || r.status)
  } catch (e) {
    log('❌ tasks error:', e.message)
    return
  }
  // В scan-режиме enabled не требуется (сервер отдаёт задания независимо от флага).
  if (!SCAN && !taskResp.enabled) { log('⏸ демпинг выключен на сервере (KASPI_DUMPING_ENABLED=false)'); return }
  const tasks = taskResp.tasks || []
  const city = process.env.CITY || taskResp.city || '750000000'
  if (!tasks.length) { log(SCAN ? 'нет активных офферов с PID для разведки' : 'нет товаров для демпинга (включи автоснижение/повышение в админке)'); return }

  log(`${SCAN ? 'разведка' : 'демпинг'} · заданий: ${tasks.length}, город ${city}${taskResp.noPid ? `, без PID: ${taskResp.noPid}` : ''}`)

  // 2) снимаем цены конкурентов
  const results = []
  for (let i = 0; i < tasks.length; i++) {
    const { offerId, pid } = tasks[i]
    const r = await fetchOffers(pid, city)
    results.push({ offerId, ...r })
    if ((i + 1) % 20 === 0) log(`  снято ${i + 1}/${tasks.length}`)
    if (i < tasks.length - 1) await sleep(THROTTLE_MS)
  }
  const okCount = results.filter((r) => !r.error).length
  const errCount = results.length - okCount
  log(`снято: ok ${okCount}, ошибок ${errCount}`)

  // 3) отправляем серверу — scan: только метрики; иначе считает и применяет цену
  try {
    const r = await fetch(`${SITE}/api/admin/kaspi-dumping/ingest?secret=${encodeURIComponent(SECRET)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: DRY, scan: SCAN, results }),
    })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || r.status)
    if (SCAN) {
      log(`✅ разведка: позиции сняты по ${d.checked} товарам, ошибок ${d.errors}. Смотри колонку «Поз.» в /admin/kaspi`)
    } else {
      log(`✅ применено: проверено ${d.checked}, изменено ${d.changed}, ошибок ${d.errors}${DRY ? ' (разведка, цена не менялась)' : ''}`)
      if (d.changes && d.changes.length) {
        d.changes.slice(0, 15).forEach((c) => log(`   ${c.offerId}: ${c.old}→${c.new}₸ [${c.status}] поз ${c.position ?? '?'}`))
      }
    }
  } catch (e) {
    log('❌ ingest error:', e.message)
  }
}

async function main() {
  log(`Kaspi демпинг-воркер · SITE=${SITE}${DRY ? ' · DRY-RUN' : ''}${ONCE ? ' · once' : ` · цикл каждые ${LOOP_MIN}м`}`)
  if (ONCE) { await runOnce(); return }
  for (;;) {
    await runOnce()
    await sleep(LOOP_MIN * 60 * 1000)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })

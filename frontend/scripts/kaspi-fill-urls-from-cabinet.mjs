// Подтянуть Kaspi PID/ссылки из КАБИНЕТА продавца и привязать офферы по артикулу.
//
// Кабинет (mc.shop.kaspi.kz/bff/offer-view/list) отдаёт по каждому офферу:
//   sku (наш артикул, напр. «1490») → masterSku (Kaspi product-id) + shopLink.
// Скрипт читает весь список (постранично) с залогиненной сессией (.kaspi-session.json)
// и шлёт маппинг на прод (/api/admin/kaspi-catalog/cabinet-urls), где сервер заполняет
// каталог и создаёт/привязывает офферы. Запускать НА МАКЕ (Kaspi блокирует прод-IP).
//
//   node scripts/kaspi-fill-urls-from-cabinet.mjs            # применить
//   node scripts/kaspi-fill-urls-from-cabinet.mjs --dry      # только показать маппинг
//
// Переменные (как у воркера): SITE, DUMPING_SECRET (=CRON_SECRET), MERCHANT_UID, KASPI_SESSION_FILE.

import fs from 'node:fs'

const SESSION_FILE = process.env.KASPI_SESSION_FILE || './.kaspi-session.json'
const SITE = (process.env.SITE || 'https://croon.kz').replace(/\/$/, '')
const SECRET = process.env.DUMPING_SECRET || process.env.CRON_SECRET || ''
const MERCHANT_UID = process.env.MERCHANT_UID || '8719005'
const MC = 'https://mc.shop.kaspi.kz'
const DRY = process.argv.includes('--dry')
const PAGE_SIZE = 100

function loadCookie() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).cookie || '' } catch { return '' }
}
function headers(cookie) {
  return {
    cookie,
    accept: 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    referer: 'https://kaspi.kz/mc/',
  }
}
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// pid из masterSku/shopLink
function pidFrom(o) {
  if (o.masterSku && /^\d{5,}$/.test(String(o.masterSku))) return String(o.masterSku)
  const link = o.shopLink || o.productLink || ''
  const m = String(link).match(/-(\d{5,})(?:[/?#]|$)/)
  return m ? m[1] : null
}

async function fetchPage(cookie, page, active) {
  const url = `${MC}/bff/offer-view/list?m=${MERCHANT_UID}&p=${page}&l=${PAGE_SIZE}&a=${active}`
  const r = await fetch(url, { headers: headers(cookie) })
  if (!r.ok) throw new Error(`offer-view/list HTTP ${r.status} (сессия протухла? перелогинься воркером)`)
  return r.json()
}

;(async () => {
  const cookie = loadCookie()
  if (!cookie) { console.error('нет сессии — запусти: node scripts/kaspi-cabinet-worker.mjs --login'); process.exit(1) }
  if (!SECRET) { console.error('нет DUMPING_SECRET/CRON_SECRET'); process.exit(1) }

  // Собираем все офферы постранично — И активные (a=true), И архивные (a=false):
  // часть карточек в кабинете деактивирована, но PID/ссылка у них есть.
  const items = []
  const seen = new Set()
  for (const active of [true, false]) {
    for (let page = 0; page < 200; page++) {
      const data = await fetchPage(cookie, page, active)
      const list = Array.isArray(data?.offers) ? data.offers : (Array.isArray(data) ? data : (data?.data || []))
      if (!list.length) break
      for (const o of list) {
        const sku = String(o.sku ?? o.merchantSku ?? '').trim()
        const pid = pidFrom(o)
        if (sku && pid && !seen.has(sku)) { seen.add(sku); items.push({ sku, pid, shopLink: o.shopLink || null }) }
      }
      log(`a=${active} стр ${page}: офферов ${list.length}, накоплено ${items.length}`)
      if (list.length < PAGE_SIZE) break
    }
  }

  log(`Всего маппингов артикул→PID: ${items.length}`)
  if (DRY) {
    console.log(JSON.stringify(items.slice(0, 40), null, 2))
    log('(--dry — на прод не отправляю)')
    return
  }

  // Шлём на прод батчами.
  const CHUNK = 300
  let catalogUpdated = 0, offersLinked = 0, noProduct = 0
  for (let i = 0; i < items.length; i += CHUNK) {
    const batch = items.slice(i, i + CHUNK)
    const r = await fetch(`${SITE}/api/admin/kaspi-catalog/cabinet-urls?secret=${encodeURIComponent(SECRET)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: batch }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { console.error('прод ответил ошибкой:', d.error || r.status); process.exit(1) }
    catalogUpdated += d.catalogUpdated || 0
    offersLinked += d.offersLinked || 0
    noProduct += d.skippedNoProduct || 0
    log(`батч ${i / CHUNK + 1}: каталог +${d.catalogUpdated}, офферов +${d.offersLinked}, без товара ${d.skippedNoProduct}`)
  }
  log(`✅ ГОТОВО. Каталог обновлён: ${catalogUpdated}, офферов привязано: ${offersLinked}, без товара на сайте: ${noProduct}`)
})().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1) })

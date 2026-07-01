/**
 * Полная автоматическая синхронизация из Kaspi кабинета.
 *
 * Делает ВСЁ за один запуск:
 * 1. Загружает все офферы из кабинета (SKU, имя, бренд, цена, остаток, PID, картинки)
 * 2. Отправляет на сервер → KaspiCatalogEntry + KaspiOffer + ProductImage
 *
 * Запускать НА МАКЕ (Kaspi блокирует прод-IP).
 *
 *   node scripts/kaspi-full-sync.mjs              # синхронизация
 *   node scripts/kaspi-full-sync.mjs --force       # перезаписать картинки
 *   node scripts/kaspi-full-sync.mjs --dry         # показать что будет
 *   node scripts/kaspi-full-sync.mjs --once        # один цикл (для cron)
 *
 * Автоматический запуск через launchd (macOS):
 *   cp scripts/com.croon.kaspi-sync.plist ~/Library/LaunchAgents/
 *   launchctl load ~/Library/LaunchAgents/com.croon.kaspi-sync.plist
 */

import fs from 'node:fs'

const SESSION_FILE = process.env.KASPI_SESSION_FILE || './.kaspi-session.json'
const SITE = (process.env.SITE || 'https://croon.kz').replace(/\/$/, '')
const SECRET = process.env.DUMPING_SECRET || process.env.CRON_SECRET || ''
const MERCHANT_UID = process.env.MERCHANT_UID || '8719005'
const MC = 'https://mc.shop.kaspi.kz'
const PAGE_SIZE = 100
const LOOP_MIN = Number(process.env.SYNC_LOOP_MIN || 60) // по умолчанию каждый час

const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry')
const ONCE = process.argv.includes('--once')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

function loadCookie() {
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')).cookie || '' } catch { return '' }
}

function mcHeaders(cookie) {
  return {
    cookie,
    accept: 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    referer: 'https://kaspi.kz/mc/',
  }
}

function pidFrom(o) {
  if (o.masterSku && /^\d{5,}$/.test(String(o.masterSku))) return String(o.masterSku)
  const m = String(o.shopLink || '').match(/-(\d{5,})(?:[/?#]|$)/)
  return m ? m[1] : null
}

function extractImages(o) {
  if (Array.isArray(o.imagesV2) && o.imagesV2.length > 0) {
    return o.imagesV2.map(img => img.large || img.medium || img.small).filter(Boolean)
  }
  if (Array.isArray(o.images) && o.images.length > 0) {
    return o.images.map(loc => `https://resources.cdn-kaspi.kz/img/m/p/${loc}?format=gallery-large`)
  }
  return []
}

async function fetchAllOffers(cookie) {
  const items = []
  const seen = new Set()
  for (const active of [true, false]) {
    for (let page = 0; page < 200; page++) {
      const url = `${MC}/bff/offer-view/list?m=${MERCHANT_UID}&p=${page}&l=${PAGE_SIZE}&a=${active}`
      const r = await fetch(url, { headers: mcHeaders(cookie) })
      if (!r.ok) { log(`HTTP ${r.status} на странице ${page}`); break }
      const data = await r.json()
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.offers) ? data.offers : [])
      if (!list.length) break
      for (const o of list) {
        const sku = String(o.sku ?? o.merchantSku ?? '').trim()
        if (!sku || seen.has(sku)) continue
        seen.add(sku)
        const stock = o.availabilities?.[0]?.stockCount ?? 0
        items.push({
          sku,
          name: o.model || o.title || '',
          brand: o.brand || o.brandName || null,
          pid: pidFrom(o),
          shopLink: o.shopLink ? `https://kaspi.kz${o.shopLink}` : null,
          price: o.cityPrices?.[0]?.value || 0,
          stock,
          images: extractImages(o),
          active: o.available !== false,
        })
      }
      log(`a=${active} стр ${page}: ${list.length}, собрано ${items.length}`)
      if (list.length < PAGE_SIZE) break
    }
  }
  return items
}

async function sendToServer(offers) {
  const r = await fetch(`${SITE}/api/admin/kaspi-sync-offers?secret=${encodeURIComponent(SECRET)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ offers, force: FORCE }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
  return d
}

async function doSync() {
  const cookie = loadCookie()
  if (!cookie) { log('нет сессии — запусти: node scripts/kaspi-cabinet-worker.mjs --login'); return false }
  if (!SECRET) { log('нет DUMPING_SECRET/CRON_SECRET'); return false }

  log('Загружаю офферы из кабинета...')
  const offers = await fetchAllOffers(cookie)
  log(`Офферов: ${offers.length}, с картинками: ${offers.filter(o => o.images.length > 0).length}`)

  if (DRY) {
    log('[DRY] Пример:', JSON.stringify(offers[0], null, 2))
    return true
  }

  // Отправляем батчами по 50
  const BATCH = 50
  let totalResult = { catalogUpserted: 0, offersLinked: 0, imagesSynced: 0, skipped: 0 }
  for (let i = 0; i < offers.length; i += BATCH) {
    const batch = offers.slice(i, i + BATCH)
    const result = await sendToServer(batch)
    totalResult.catalogUpserted += result.catalogUpserted || 0
    totalResult.offersLinked += result.offersLinked || 0
    totalResult.imagesSynced += result.imagesSynced || 0
    totalResult.skipped += result.skipped || 0
    log(`Батч ${Math.floor(i / BATCH) + 1}/${Math.ceil(offers.length / BATCH)}: каталог +${result.catalogUpserted}, офферы +${result.offersLinked}, картинки +${result.imagesSynced}`)
  }

  log(`✅ Готово. Каталог: ${totalResult.catalogUpserted}, Офферы: ${totalResult.offersLinked}, Картинки: ${totalResult.imagesSynced}, Пропущено: ${totalResult.skipped}`)
  return true
}

;(async () => {
  if (ONCE) {
    await doSync()
    return
  }

  // Циклический режим
  while (true) {
    try {
      await doSync()
    } catch (e) {
      log('ОШИБКА:', e.message)
    }
    log(`Следующий цикл через ${LOOP_MIN} мин...`)
    await sleep(LOOP_MIN * 60 * 1000)
  }
})()

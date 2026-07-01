/**
 * Синхронизация изображений товаров из Kaspi кабинета.
 *
 * Кабинет (mc.shop.kaspi.kz/bff/offer-view/list) отдаёт imagesV2 —
 * готовые CDN-ссылки resources.cdn-kaspi.kz для каждого оффера.
 * Скрипт берёт large-версию и сохраняет в ProductImage.
 *
 * Запускать НА МАКЕ (Kaspi блокирует прод-IP).
 *
 *   node scripts/kaspi-sync-images.mjs              # только товары без картинок
 *   node scripts/kaspi-sync-images.mjs --force       # перезаписать все
 *   node scripts/kaspi-sync-images.mjs --limit 10    # только 10 товаров
 *   node scripts/kaspi-sync-images.mjs --dry         # показать что будет
 */

import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SESSION_FILE = process.env.KASPI_SESSION_FILE || './.kaspi-session.json'
const MERCHANT_UID = process.env.MERCHANT_UID || '8719005'
const MC = 'https://mc.shop.kaspi.kz'
const PAGE_SIZE = 100

const FORCE = process.argv.includes('--force')
const DRY = process.argv.includes('--dry')
const limitIdx = process.argv.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : 0

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
  // imagesV2 — массив объектов с large/medium/small
  if (Array.isArray(o.imagesV2) && o.imagesV2.length > 0) {
    return o.imagesV2.map(img => img.large || img.medium || img.small).filter(Boolean)
  }
  // fallback: images — массив путей, собираем URL вручную
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
        const images = extractImages(o)
        const pid = pidFrom(o)
        const kaspiUrl = o.shopLink ? `https://kaspi.kz${o.shopLink}` : (pid ? `https://kaspi.kz/shop/p/-${pid}/` : null)
        items.push({ sku, pid, images, kaspiUrl, model: o.model || '' })
      }
      log(`a=${active} стр ${page}: ${list.length} офферов, собрано ${items.length}`)
      if (list.length < PAGE_SIZE) break
    }
  }
  return items
}

async function main() {
  const cookie = loadCookie()
  if (!cookie) { console.error('нет сессии — запусти: node scripts/kaspi-cabinet-worker.mjs --login'); process.exit(1) }

  log('Загружаю офферы из кабинета...')
  const offers = await fetchAllOffers(cookie)
  log(`Всего офферов: ${offers.length}`)

  const withImages = offers.filter(o => o.images.length > 0)
  log(`С изображениями: ${withImages.length}, без: ${offers.length - withImages.length}`)

  // Ищем продукты в нашей БД по SKU
  const allSkus = offers.map(o => o.sku)
  const products = await prisma.product.findMany({
    where: { sku: { in: allSkus } },
    include: { images: true },
  })
  const productBySku = new Map(products.map(p => [p.sku, p]))

  log(`Найдено товаров в БД по SKU: ${products.length}`)

  // Фильтруем: только товары с Kaspi-картинками
  const toProcess = []
  for (const offer of withImages) {
    const product = productBySku.get(offer.sku)
    if (!product) continue

    const hasOnlyPlaceholder = product.images.length === 0 ||
      product.images.every(img => img.url.includes('icon-192x192.png') || img.url.includes('placeholder.svg'))

    if (hasOnlyPlaceholder || FORCE) {
      toProcess.push({ product, offer })
    }
  }

  const batch = LIMIT > 0 ? toProcess.slice(0, LIMIT) : toProcess
  log(`К обработке: ${batch.length} товаров`)

  if (batch.length === 0) {
    log('Нечего обрабатывать. Используй --force для перезаписи.')
    await prisma.$disconnect()
    return
  }

  if (DRY) {
    for (const { product, offer } of batch.slice(0, 20)) {
      log(`[DRY] "${product.name}" (SKU: ${product.sku}) → ${offer.images.length} картинок`)
      offer.images.slice(0, 2).forEach(url => log(`  ${url}`))
    }
    log(`[DRY] Показано 20 из ${batch.length}`)
    await prisma.$disconnect()
    return
  }

  let ok = 0, fail = 0
  for (let i = 0; i < batch.length; i++) {
    const { product, offer } = batch[i]
    log(`[${i + 1}/${batch.length}] "${product.name}" (SKU: ${product.sku}) → ${offer.images.length} img`)

    try {
      await prisma.$transaction([
        prisma.productImage.deleteMany({ where: { productId: product.id } }),
        prisma.productImage.createMany({
          data: offer.images.map((url, idx) => ({
            productId: product.id,
            url,
            alt: product.name,
            sortOrder: idx,
          })),
        }),
      ])
      // Также заполняем kaspiUrl на KaspiOffer если есть
      if (offer.kaspiUrl) {
        await prisma.kaspiOffer.updateMany({
          where: { kaspiSku: offer.sku },
          data: { kaspiUrl: offer.kaspiUrl },
        })
      }
      ok++
    } catch (e) {
      log(`  ОШИБКА: ${e.message}`)
      fail++
    }
  }

  log(`\n✅ Готово. Успешно: ${ok}, ошибок: ${fail}`)
  await prisma.$disconnect()
}

main().catch(e => { console.error('ФАТАЛЬНАЯ ОШИБКА:', e.message); process.exit(1) })

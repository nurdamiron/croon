import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'

const SESSION_FILE = process.env.KASPI_SESSION_FILE || './.kaspi-session.json'
const MERCHANT_UID = process.env.MERCHANT_UID || '8719005'
const MC = 'https://mc.shop.kaspi.kz'
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

function pidFrom(o) {
  if (o.masterSku && /^\d{5,}$/.test(String(o.masterSku))) return String(o.masterSku)
  const link = o.shopLink || o.productLink || ''
  const m = String(link).match(/-(\d{5,})(?:[/?#]|$)/)
  return m ? m[1] : null
}

async function fetchPage(cookie, page, active) {
  const url = `${MC}/bff/offer-view/list?m=${MERCHANT_UID}&p=${page}&l=${PAGE_SIZE}&a=${active}`
  const r = await fetch(url, { headers: headers(cookie) })
  if (!r.ok) throw new Error(`offer-view/list HTTP ${r.status}`)
  return r.json()
}

function urlFromPid(pid) {
  return `https://kaspi.kz/shop/p/-${pid}/?c=750000000`
}

;(async () => {
  const cookie = loadCookie()
  if (!cookie) { console.error('No cookie'); process.exit(1) }

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
      if (list.length < PAGE_SIZE) break
    }
  }

  console.log(`Extracted ${items.length} items from Kaspi. Updating DB...`)

  const prisma = new PrismaClient()
  try {
    let updatedCatalog = 0
    let updatedOffers = 0

    // Fetch all catalog entries and products in bulk
    const skus = items.map(i => i.sku)
    const existingCat = await prisma.kaspiCatalogEntry.findMany({ where: { kaspiSku: { in: skus } } })
    const existingProd = await prisma.product.findMany({ where: { sku: { in: skus }, archived: false } })
    
    const catMap = new Map(existingCat.map(c => [c.kaspiSku, c]))
    const prodMap = new Map(existingProd.map(p => [p.sku, p]))

    // Fast bulk processing
    for (const it of items) {
      const url = (it.shopLink && /^https?:\/\//.test(it.shopLink)) ? it.shopLink : urlFromPid(it.pid)
      
      const cat = catMap.get(it.sku)
      if (cat) {
        await prisma.kaspiCatalogEntry.update({
          where: { id: cat.id },
          data: { kaspiProductId: it.pid, kaspiUrl: url }
        })
        updatedCatalog++
      }

      const prod = prodMap.get(it.sku)
      if (prod) {
        const price = cat?.priceTenge && cat.priceTenge > 0 ? cat.priceTenge : (prod.price || 1)
        await prisma.kaspiOffer.upsert({
          where: { kaspiSku: it.sku },
          create: {
            kaspiSku: it.sku,
            productId: prod.id,
            priceTenge: Math.max(1, price),
            kaspiUrl: url,
            kaspiStoreId: cat?.storeId || '30383258_PP1',
            cityId: cat?.cityId || '750000000',
            kaspiName: cat?.name || prod.name || null,
            kaspiBrand: cat?.brand ?? null,
            active: cat?.available ?? true,
          },
          update: {
            productId: prod.id,
            kaspiUrl: url,
          }
        })
        updatedOffers++
      }
    }
    
    console.log(`✅ Finished. Updated Catalog: ${updatedCatalog}, Updated Offers: ${updatedOffers}`)
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
})()

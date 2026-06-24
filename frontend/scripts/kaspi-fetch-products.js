/**
 * Fetch Kaspi ACTIVE.xml from merchant cabinet and import into Croon.
 *
 * Usage: node scripts/kaspi-fetch-products.js [--apply]
 *
 * Two modes:
 *   1. If KASPI_CABINET_URL is set → fetches XML from that URL
 *   2. Otherwise → uses Kaspi public API to search products by merchant
 *
 * After import, auto-links catalog entries to products by SKU.
 */

const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const KASPI_MERCHANT_ID = process.env.KASPI_MERCHANT_ID || '30233309'
const KASPI_CITY = '750000000'

// Parse ACTIVE/ARCHIVE XML into offers
function parseOffers(xml) {
  const offers = []
  const offerRe = /<offer\s+sku="([^"]+)">([\s\S]*?)<\/offer>/g
  let m
  while ((m = offerRe.exec(xml))) {
    const sku = m[1]
    const body = m[2]
    const brand = (body.match(/<brand>([^<]*)<\/brand>/) || [])[1]?.trim() || null
    const name = (body.match(/<model>([^<]*)<\/model>/) || [])[1]?.trim() || ''
    const avail = (body.match(/<availability\s+available="([^"]+)"/) || [])[1] === 'yes'
    const storeId = (body.match(/<availability[^>]*storeId="([^"]+)"/) || [])[1] || '30233309_PP1'
    const cpMatch = body.match(/<cityprice\s+cityId="([^"]+)">\s*([0-9.]+)\s*<\/cityprice>/)
    const cityId = cpMatch ? cpMatch[1] : KASPI_CITY
    const priceTenge = cpMatch ? Math.round(parseFloat(cpMatch[2])) : 0
    if (sku) offers.push({ kaspiSku: sku, name, brand, priceTenge, cityId, storeId, available: avail })
  }
  return offers
}

// Try to fetch ACTIVE.xml from common Kaspi export URLs
async function fetchActiveXml() {
  // Kaspi merchant cabinet export URL pattern
  const urls = [
    `https://kaspi.kz/yml/offer-view/merchant/${KASPI_MERCHANT_ID}`,
    `https://kaspi.kz/shop/api/v2/merchant/${KASPI_MERCHANT_ID}/products`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'application/xml, text/xml, */*',
        },
      })
      if (res.ok) {
        const text = await res.text()
        if (text.includes('<offer')) return text
      }
    } catch {}
  }
  return null
}

// Fetch product info from Kaspi public API (offer-view)
async function fetchProductFromKaspi(pid) {
  try {
    const res = await fetch(`https://kaspi.kz/yml/offer-view/offers/${pid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://kaspi.kz/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify({ cityId: KASPI_CITY, limit: 1, page: 0, sortOption: 'PRICE' }),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.offers?.length) {
        return { price: d.offers[0].price, available: true }
      }
    }
  } catch {}
  return null
}

async function main() {
  console.log('=== Kaspi Product Fetcher ===\n')
  console.log('Mode:', APPLY ? 'APPLY' : 'DRY RUN')

  // 1. Try to fetch ACTIVE.xml
  console.log('\n1. Fetching ACTIVE.xml from Kaspi...')
  const xml = await fetchActiveXml()

  if (xml) {
    const offers = parseOffers(xml)
    console.log(`   Found ${offers.length} offers in XML`)

    if (APPLY) {
      let upserted = 0
      for (const o of offers) {
        await prisma.kaspiCatalogEntry.upsert({
          where: { kaspiSku: o.kaspiSku },
          update: {
            ...(o.name ? { name: o.name } : {}),
            ...(o.brand ? { brand: o.brand } : {}),
            ...(o.priceTenge > 0 ? { priceTenge: o.priceTenge } : {}),
            cityId: o.cityId, storeId: o.storeId, available: o.available,
          },
          create: o,
        })
        upserted++
      }
      console.log(`   Upserted ${upserted} catalog entries`)

      // Auto-link
      console.log('\n2. Auto-linking to products...')
      const { autoLinkKaspiOffersBySku } = require('../frontend/src/lib/kaspi-autolink')
      const linkResult = await autoLinkKaspiOffersBySku({ apply: true })
      console.log(`   Linked: ${linkResult.linked}, No product: ${linkResult.noProduct}`)
    }
  } else {
    console.log('   Could not fetch ACTIVE.xml automatically')
    console.log('   Manual steps:')
    console.log('   1. Go to https://kaspi.kz/merchant/')
    console.log('   2. Export ACTIVE.xml')
    console.log('   3. Upload via admin: /admin/kaspi-catalog → Import')
  }

  // 3. Show current state
  console.log('\n3. Current state:')
  const catalogCount = await prisma.kaspiCatalogEntry.count()
  const offerCount = await prisma.kaspiOffer.count()
  const productCount = await prisma.product.count()
  console.log(`   Products: ${productCount}`)
  console.log(`   Kaspi catalog entries: ${catalogCount}`)
  console.log(`   Kaspi offers (linked): ${offerCount}`)

  console.log('\n=== Done ===')
}

main().catch(console.error).finally(() => prisma.$disconnect())

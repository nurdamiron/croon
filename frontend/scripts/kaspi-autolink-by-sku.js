// Автопривязка KaspiCatalogEntry → KaspiOffer по совпадению артикула с Product.sku.
// Берём карточки где kaspiSku = чистый артикул и есть Product с таким sku →
// создаём/обновляем KaspiOffer. Цена: из каталога, иначе из Product.price (фолбэк).
// Имя/ссылка на сайт подтянутся (KaspiOffer.productId → Product). Защита от дублей:
// одну Kaspi-карточку (pid до "_") нельзя привязать к разным товарам.
//
//   node scripts/kaspi-autolink-by-sku.js          # dry-run
//   node scripts/kaspi-autolink-by-sku.js --apply   # применить
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  const entries = await prisma.kaspiCatalogEntry.findMany({
    select: { kaspiSku: true, name: true, brand: true, priceTenge: true, storeId: true, cityId: true, kaspiUrl: true, available: true },
  })
  // чистый числовой артикул (короткий SKU нашего диапазона)
  const candidates = entries.filter(e => /^\d+(\.\d+)?$/.test(e.kaspiSku))
  const skus = candidates.map(e => e.kaspiSku)

  // резолв по Product.sku (ProductVariant удалён)
  const products = await prisma.product.findMany({
    where: { sku: { in: skus } }, select: { sku: true, id: true, price: true, name: true },
  })
  const bySku = new Map()
  for (const p of products) if (p.sku) bySku.set(p.sku, p)

  let willLink = 0, skipNoProduct = 0, conflicts = 0, created = 0, updated = 0
  const conflictList = []
  for (const e of candidates) {
    const prod = bySku.get(e.kaspiSku)
    if (!prod) { skipNoProduct++; continue }
    // цена: каталог, иначе цена товара Alash (для офферов без цены в XML)
    const price = e.priceTenge > 0 ? e.priceTenge : (prod.price || 0)

    const kaspiPid = e.kaspiSku.split('_')[0]
    const conflict = await prisma.kaspiOffer.findFirst({
      where: { productId: { not: prod.id }, OR: [{ kaspiSku: kaspiPid }, { kaspiSku: { startsWith: kaspiPid + '_' } }] },
      select: { kaspiSku: true, productId: true },
    })
    if (conflict) { conflicts++; conflictList.push(`${e.kaspiSku} → занят товаром ${conflict.productId}`); continue }

    willLink++
    if (!APPLY) continue

    const existing = await prisma.kaspiOffer.findUnique({ where: { kaspiSku: e.kaspiSku } })
    await prisma.kaspiOffer.upsert({
      where: { kaspiSku: e.kaspiSku },
      create: {
        kaspiSku: e.kaspiSku, productId: prod.id, priceTenge: Math.max(1, price),
        kaspiStoreId: e.storeId || '30383258_PP1', cityId: e.cityId || '750000000',
        kaspiName: e.name || prod.name || null, kaspiBrand: e.brand ?? null, kaspiUrl: e.kaspiUrl ?? null,
        active: e.available,
      },
      update: {
        productId: prod.id,
        ...(price > 0 ? { priceTenge: Math.max(1, price) } : {}),
        ...(e.name ? { kaspiName: e.name } : {}),
        ...(e.brand ? { kaspiBrand: e.brand } : {}),
      },
    })
    if (existing) updated++; else created++
  }

  console.log('=== Автопривязка Kaspi по артикулу (Product.sku) ===')
  console.log('кандидатов (артикул-карточек):', candidates.length)
  console.log('будет привязано:', willLink, '| без товара Alash:', skipNoProduct, '| конфликтов:', conflicts)
  if (conflictList.length) { console.log('--- конфликты (первые 15) ---'); conflictList.slice(0, 15).forEach(c => console.log('  ', c)) }
  if (APPLY) {
    const total = await prisma.kaspiOffer.count()
    console.log(`\n✅ создано ${created}, обновлено ${updated}. Всего KaspiOffer: ${total}`)
  } else {
    console.log('\n(dry-run — добавь --apply)')
  }
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

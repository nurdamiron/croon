// Аудит после импорта Kaspi XML: что в KaspiCatalogEntry, сколько матчится с
// товарами Alash по артикулу, сколько уже привязано (KaspiOffer), проблемные.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const total = await prisma.kaspiCatalogEntry.count()
  const avail = await prisma.kaspiCatalogEntry.count({ where: { available: true } })
  const entries = await prisma.kaspiCatalogEntry.findMany({
    select: { kaspiSku: true, name: true, available: true },
  })

  // классификация SKU
  let shortArtikul = 0, longUnderscore = 0, bigNumeric = 0
  const shortSkus = []
  for (const e of entries) {
    const s = e.kaspiSku
    if (/^\d+_\d+$/.test(s)) longUnderscore++
    else if (/^\d+$/.test(s)) {
      const n = Number(s)
      if (n <= 2500) { shortArtikul++; shortSkus.push(s) }
      else bigNumeric++
    } else bigNumeric++
  }

  // сколько коротких реально совпадают с ProductVariant.sku
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: shortSkus } }, select: { sku: true, productId: true },
  })
  const matched = new Set(variants.map(v => v.sku))

  // сколько уже есть KaspiOffer (привязка к товару)
  const offers = await prisma.kaspiOffer.count()
  const activeOffers = await prisma.kaspiOffer.count({ where: { active: true } })

  console.log('=== KaspiCatalogEntry (реестр) ===')
  console.log('  всего:', total, '| available=yes:', avail)
  console.log('  SKU = наш артикул (<=2500):', shortArtikul, '— из них реально есть товар Alash:', matched.size)
  console.log('  SKU длинный цифры_цифры:', longUnderscore)
  console.log('  SKU большой/непонятный:', bigNumeric)
  console.log('\n=== KaspiOffer (привязка к товару → фид/склад) ===')
  console.log('  всего офферов:', offers, '| активных:', activeOffers)
  console.log('\nИТОГ: автопривязать по артикулу можно', matched.size, 'карточек.')
  console.log('Остальные', total - matched.size, '(длинные/непонятные/без товара) — вручную или по названию.')
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

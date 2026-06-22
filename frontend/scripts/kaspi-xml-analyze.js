// Анализ совпадений Kaspi XML (ACTIVE/ARCHIVE) с товарами Alash по артикулу.
// Запуск на сервере (DATABASE_URL = прод). Читает /tmp/kaspi_skus.json {active,archive}.
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const prisma = new PrismaClient()

async function resolveSku(skus) {
  const variants = await prisma.productVariant.findMany({
    where: { sku: { in: skus } },
    select: { sku: true, productId: true },
  })
  const m = new Map()
  for (const v of variants) if (v.sku) m.set(v.sku, v.productId)
  return m
}

async function stockFor(pids) {
  const rows = await prisma.product.findMany({
    where: { id: { in: pids } },
    select: { id: true, name: true, inStock: true, totalStock: true, reservedStock: true },
  })
  return new Map(rows.map(r => [r.id, r]))
}

async function main() {
  const { active, archive } = JSON.parse(fs.readFileSync('/tmp/kaspi_skus.json', 'utf8'))

  const actMap = await resolveSku(active)
  const arcMap = await resolveSku(archive)
  const actStock = await stockFor([...actMap.values()])
  const arcStock = await stockFor([...arcMap.values()])

  // ACTIVE: выложено на Kaspi. Проблема — нет на складе Alash (нечем торговать).
  let actMatched = 0, actNoStock = 0
  const actProblem = []
  for (const sku of active) {
    const pid = actMap.get(sku)
    if (!pid) continue
    actMatched++
    const s = actStock.get(pid)
    const avail = s && s.inStock && (s.totalStock - s.reservedStock) > 0
    if (!avail) { actNoStock++; actProblem.push({ sku, name: (s?.name || '').slice(0, 45), inStock: s?.inStock, total: s?.totalStock, reserved: s?.reservedStock }) }
  }

  // ARCHIVE: снято с Kaspi. Интересны те, что ЕСТЬ в наличии на Alash (можно вернуть на Kaspi).
  let arcMatched = 0, arcInStock = 0
  const arcReturnable = []
  for (const sku of archive) {
    const pid = arcMap.get(sku)
    if (!pid) continue
    arcMatched++
    const s = arcStock.get(pid)
    const avail = s && s.inStock && (s.totalStock - s.reservedStock) > 0
    if (avail) { arcInStock++; arcReturnable.push({ sku, name: (s?.name || '').slice(0, 45), total: s?.totalStock }) }
  }

  console.log('=== ACTIVE (' + active.length + ' коротких SKU) ===')
  console.log('  совпало с товаром Alash:', actMatched, '/ не найдено:', active.length - actMatched)
  console.log('  ⚠ выложено на Kaspi, но НЕТ на складе Alash:', actNoStock)
  actProblem.slice(0, 40).forEach(p => console.log(`     SKU ${p.sku}  inStock=${p.inStock} total=${p.total} rsv=${p.reserved}  ${p.name}`))

  console.log('\n=== ARCHIVE (' + archive.length + ' коротких SKU) ===')
  console.log('  совпало с товаром Alash:', arcMatched, '/ не найдено:', archive.length - arcMatched)
  console.log('  ✓ снято с Kaspi, но ЕСТЬ на складе Alash (можно вернуть):', arcInStock)
  arcReturnable.slice(0, 40).forEach(p => console.log(`     SKU ${p.sku}  total=${p.total}  ${p.name}`))
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

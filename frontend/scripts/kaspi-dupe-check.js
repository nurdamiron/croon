// Проверка дублей в KaspiCatalogEntry: один товар записан под разными kaspiSku?
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

function norm(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim() }

async function main() {
  const total = await prisma.kaspiCatalogEntry.count()
  const entries = await prisma.kaspiCatalogEntry.findMany({
    select: { kaspiSku: true, name: true, storeId: true, available: true, importedAt: true },
  })

  // 1) дублей по kaspiSku быть НЕ может (unique). Проверим store id (тест vs прод).
  const byStore = {}
  for (const e of entries) { byStore[e.storeId] = (byStore[e.storeId] || 0) + 1 }

  // 2) дубли по НАЗВАНИЮ (один товар под разными SKU = тест + прод не объединились)
  const byName = new Map()
  for (const e of entries) {
    const k = norm(e.name)
    if (!k) continue
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(e)
  }
  const dupeNames = [...byName.entries()].filter(([, arr]) => arr.length > 1)

  console.log('=== KaspiCatalogEntry ===')
  console.log('всего:', total)
  console.log('\nпо storeId (магазин):')
  for (const [s, c] of Object.entries(byStore)) console.log('  ', s, '→', c)
  console.log('\nдублей по НАЗВАНИЮ (один товар под разными SKU):', dupeNames.length)
  dupeNames.slice(0, 25).forEach(([name, arr]) => {
    console.log(`  «${name.slice(0, 45)}»`)
    arr.forEach(e => console.log(`      sku=${e.kaspiSku}  store=${e.storeId}  avail=${e.available}`))
  })
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

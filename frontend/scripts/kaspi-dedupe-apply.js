// Дедупликация Kaspi (приоритет ПРОД):
//  - для PID, где есть и прод, и тест: ПЕРЕНЕСТИ kaspiUrl/kaspiProductId с теста
//    на прод (если у прода пусто), затем удалить тестовый дубль (+ его оффер).
//  - проставить kaspiProductId (PID) всем ПРОД-карточкам.
//  ВАЖНО: URL, привязанные на тестовых карточках, не теряются — переносятся на прод.
//
//   node scripts/kaspi-dedupe-apply.js          # dry-run
//   node scripts/kaspi-dedupe-apply.js --apply   # применить
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const TEST_STORE = '30233309_PP1'
const PROD_STORE = '30383258_PP1'
const pidOf = sku => String(sku).split('_')[0]

async function main() {
  const entries = await prisma.kaspiCatalogEntry.findMany({
    select: { id: true, kaspiSku: true, kaspiProductId: true, storeId: true, kaspiUrl: true },
  })
  const byPid = new Map()
  for (const e of entries) {
    const pid = pidOf(e.kaspiSku)
    if (!byPid.has(pid)) byPid.set(pid, { prod: [], test: [] })
    const g = byPid.get(pid)
    if (e.storeId === PROD_STORE) g.prod.push(e)
    else if (e.storeId === TEST_STORE) g.test.push(e)
  }

  const transfers = []  // перенос URL тест→прод карточки
  const toDelete = []   // тестовые карточки на удаление
  const prodByPid = new Map()
  for (const [pid, g] of byPid) {
    if (g.prod.length === 0 || g.test.length === 0) continue
    const prod = g.prod[0]
    prodByPid.set(pid, prod)
    for (const t of g.test) {
      if (t.kaspiUrl && !prod.kaspiUrl) transfers.push({ testSku: t.kaspiSku, prodId: prod.id, prodSku: prod.kaspiSku, url: t.kaspiUrl, pid })
      toDelete.push(t)
    }
  }
  const delSkus = toDelete.map(e => e.kaspiSku)
  const delWithUrl = toDelete.filter(e => e.kaspiUrl).length

  // офферы на удаляемых тестовых карточках — НЕ удаляем, а перепривязываем на
  // прод-SKU того же PID (чтобы товар остался привязан к Kaspi, уже к проду).
  const affectedOffers = await prisma.kaspiOffer.findMany({
    where: { kaspiSku: { in: delSkus } }, select: { id: true, kaspiSku: true, kaspiUrl: true, productId: true },
  })
  const offerMoves = []   // оффер → новый прод-SKU
  const offerDeletes = [] // если прод-оффер уже есть (конфликт unique) — удаляем тестовый
  const existingProdSkus = new Set((await prisma.kaspiOffer.findMany({
    where: { kaspiSku: { in: [...prodByPid.values()].map(p => p.kaspiSku) } }, select: { kaspiSku: true },
  })).map(o => o.kaspiSku))
  for (const o of affectedOffers) {
    const prod = prodByPid.get(pidOf(o.kaspiSku))
    if (prod && !existingProdSkus.has(prod.kaspiSku)) {
      offerMoves.push({ id: o.id, from: o.kaspiSku, to: prod.kaspiSku })
      existingProdSkus.add(prod.kaspiSku) // зарезервировали
    } else {
      offerDeletes.push(o.id) // прод-оффер уже есть → тестовый дубль-оффер не нужен
    }
  }

  const prodNeedPid = entries.filter(e => e.storeId === PROD_STORE && !e.kaspiProductId)

  console.log('=== ПЛАН (приоритет ПРОД, перенос URL + офферов) ===')
  console.log('тестовых-дублей на удаление:', toDelete.length, '| из них с URL:', delWithUrl)
  console.log('переносов URL тест→прод:', transfers.length)
  transfers.forEach(t => console.log(`   URL ${t.testSku} → прод ${t.prodSku}`))
  console.log('офферов перепривязать тест→прод:', offerMoves.length, '| офферов удалить (прод уже есть):', offerDeletes.length)
  console.log('прод-карточек получат PID:', prodNeedPid.length)

  if (!APPLY) { console.log('\n(dry-run — добавь --apply)'); return }

  let moved = 0
  for (const t of transfers) {
    await prisma.kaspiCatalogEntry.update({ where: { id: t.prodId }, data: { kaspiUrl: t.url, kaspiProductId: t.pid } })
    moved++
  }
  // перепривязать офферы на прод-SKU
  let offMoved = 0
  for (const m of offerMoves) {
    await prisma.kaspiOffer.update({ where: { id: m.id }, data: { kaspiSku: m.to } })
    offMoved++
  }
  // удалить лишние тест-офферы (дубль прод-оффера)
  let offDeleted = 0
  if (offerDeletes.length) {
    const r = await prisma.kaspiOffer.deleteMany({ where: { id: { in: offerDeletes } } })
    offDeleted = r.count
  }
  // удалить тестовые карточки-дубли
  let delCards = 0
  if (delSkus.length) {
    const r = await prisma.kaspiCatalogEntry.deleteMany({ where: { kaspiSku: { in: delSkus } } })
    delCards = r.count
  }
  // PID всем прод-карточкам
  let pidSet = 0
  for (const e of prodNeedPid) {
    await prisma.kaspiCatalogEntry.update({ where: { id: e.id }, data: { kaspiProductId: pidOf(e.kaspiSku) } })
    pidSet++
  }

  const total = await prisma.kaspiCatalogEntry.count()
  console.log(`\n✅ URL перенесено: ${moved}, офферов перепривязано: ${offMoved}, офферов удалено: ${offDeleted}, карточек удалено: ${delCards}, PID: ${pidSet}. Всего карточек: ${total}`)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

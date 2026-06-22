// Анализ дублей KaspiCatalogEntry по PID (первая часть SKU до "_").
// Тест-аккаунт storeId = 30233309_PP1, прод = 30383258_PP1.
// Цель (только анализ, без удаления): сколько дублей, что удалится, что
// останется, сколько привязок (KaspiOffer) затронуто.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const TEST_STORE = '30233309_PP1'
const PROD_STORE = '30383258_PP1'

function pidOf(sku) { return String(sku).split('_')[0] }

async function main() {
  const entries = await prisma.kaspiCatalogEntry.findMany({
    select: { id: true, kaspiSku: true, kaspiProductId: true, storeId: true, name: true, kaspiUrl: true, available: true },
  })
  const byStore = {}
  for (const e of entries) byStore[e.storeId] = (byStore[e.storeId] || 0) + 1

  // группируем по PID (первая часть SKU)
  const byPid = new Map()
  for (const e of entries) {
    const pid = pidOf(e.kaspiSku)
    if (!byPid.has(pid)) byPid.set(pid, [])
    byPid.get(pid).push(e)
  }

  let dupGroups = 0, willDelete = 0, prodKept = 0, testOnly = 0, withUrlDeleted = 0
  const samples = []
  for (const [pid, arr] of byPid) {
    if (arr.length < 2) continue
    dupGroups++
    const prod = arr.filter(e => e.storeId === PROD_STORE)
    const test = arr.filter(e => e.storeId === TEST_STORE)
    // приоритет прод: если есть прод-запись, тестовые с тем же PID удаляем
    if (prod.length > 0) {
      prodKept += prod.length
      willDelete += test.length
      if (test.some(e => e.kaspiUrl)) withUrlDeleted += test.filter(e => e.kaspiUrl).length
      if (samples.length < 10) samples.push({ pid, keep: prod.map(e => e.kaspiSku), drop: test.map(e => e.kaspiSku) })
    } else {
      testOnly++ // дубль только из тестовых — оставляем как есть (нет прода)
    }
  }

  // отдельно: ВСЕ тестовые карточки (можно удалить целиком по решению юзера)
  const allTest = entries.filter(e => e.storeId === TEST_STORE)

  console.log('=== По магазинам ===')
  for (const [s, c] of Object.entries(byStore)) console.log('  ', s, c, s === TEST_STORE ? '(ТЕСТ)' : s === PROD_STORE ? '(ПРОД)' : '')
  console.log('\n=== Дубли по PID (тест+прод, один товар) ===')
  console.log('  групп-дублей:', dupGroups)
  console.log('  останется прод-записей:', prodKept)
  console.log('  УДАЛИТСЯ тестовых (есть прод-аналог):', willDelete, '| из них с URL:', withUrlDeleted)
  console.log('  групп только из тестовых (нет прода, НЕ трогаем при dedupe):', testOnly)
  console.log('\n  примеры (keep прод / drop тест):')
  samples.forEach(s => console.log(`    PID ${s.pid}: keep ${s.keep.join(',')} | drop ${s.drop.join(',')}`))
  console.log('\n=== ВСЕ тестовые карточки (вариант: удалить целиком) ===')
  console.log('  всего тестовых:', allTest.length, '| из них с URL:', allTest.filter(e => e.kaspiUrl).length)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

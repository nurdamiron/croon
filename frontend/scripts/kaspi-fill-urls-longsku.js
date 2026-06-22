// Простановка PID + kaspiUrl для ВСЕХ карточек с длинным SKU (цифры_цифры),
// у которых PID или URL ещё не заполнен — включая тестовые (их раньше пропустили).
// PID = часть до "_" (реальный Kaspi product-id). Ссылка вида
// kaspi.kz/shop/p/-<PID>/?c=750000000 — проверено, ведёт на правильный товар.
//
//   node scripts/kaspi-fill-urls-longsku.js          # dry-run
//   node scripts/kaspi-fill-urls-longsku.js --apply   # применить
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const mkUrl = pid => `https://kaspi.kz/shop/p/-${pid}/?c=750000000`

async function main() {
  const all = await prisma.kaspiCatalogEntry.findMany({
    select: { id: true, kaspiSku: true, kaspiProductId: true, kaspiUrl: true, storeId: true, name: true },
  })
  // длинный SKU цифры_цифры, и (нет PID ИЛИ нет URL)
  const targets = all.filter(e => /^\d+_\d+$/.test(e.kaspiSku) && (!e.kaspiProductId || !e.kaspiUrl))
  const byStore = {}
  for (const t of targets) byStore[t.storeId] = (byStore[t.storeId] || 0) + 1

  console.log('=== Простановка PID+URL для длинных SKU (вкл. тестовые) ===')
  console.log('к обработке:', targets.length)
  console.log('по магазинам:', JSON.stringify(byStore))
  console.log('пример:', targets[0] ? `${targets[0].kaspiSku} → ${mkUrl(targets[0].kaspiSku.split('_')[0])}` : '—')

  if (!APPLY) { console.log('\n(dry-run — добавь --apply)'); return }

  let cards = 0
  for (const t of targets) {
    const pid = t.kaspiSku.split('_')[0]
    await prisma.kaspiCatalogEntry.update({
      where: { id: t.id },
      data: { kaspiProductId: t.kaspiProductId || pid, kaspiUrl: t.kaspiUrl || mkUrl(pid) },
    })
    cards++
  }
  // офферы с длинным SKU без URL
  const offers = await prisma.kaspiOffer.findMany({ where: { kaspiUrl: null }, select: { id: true, kaspiSku: true } })
  let off = 0
  for (const o of offers) {
    if (!/^\d+_\d+$/.test(o.kaspiSku)) continue
    await prisma.kaspiOffer.update({ where: { id: o.id }, data: { kaspiUrl: mkUrl(o.kaspiSku.split('_')[0]) } })
    off++
  }
  const withUrl = await prisma.kaspiCatalogEntry.count({ where: { kaspiUrl: { not: null } } })
  console.log(`\n✅ карточкам: ${cards}, офферам: ${off}. Всего с URL: ${withUrl}`)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

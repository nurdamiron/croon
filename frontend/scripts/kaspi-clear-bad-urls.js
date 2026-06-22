// Очистка нерабочих kaspiUrl: случай, когда PID == сам SKU (короткий артикул
// оказался большим числом, ошибочно взят как Kaspi product-id) и SKU без "_".
// Проверено: такие ссылки → 404. Также сбрасываем ошибочно проставленный
// kaspiProductId (он был = артикулу, не настоящий Kaspi-id).
//
//   node scripts/kaspi-clear-bad-urls.js          # dry-run
//   node scripts/kaspi-clear-bad-urls.js --apply   # очистить
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function isBad(sku, pid) {
  if (String(sku).includes('_')) return false           // из длинного SKU — надёжный
  if (!pid || !/^\d+$/.test(pid)) return false
  if (String(pid) !== String(sku)) return false         // pid найден по названию — рабочий
  return Number(pid) >= 10000000                         // pid == sku и большое число → мусор
}

async function main() {
  const rows = await prisma.kaspiCatalogEntry.findMany({
    where: { kaspiUrl: { not: null } },
    select: { id: true, kaspiSku: true, kaspiProductId: true, name: true },
  })
  const bad = rows.filter(e => isBad(e.kaspiSku, e.kaspiProductId))
  console.log('=== Очистка нерабочих URL (pid==sku, 404) ===')
  console.log('с URL всего:', rows.length, '| нерабочих к очистке:', bad.length)
  bad.slice(0, 15).forEach(e => console.log(`  sku=${e.kaspiSku} pid=${e.kaspiProductId}  ${(e.name||'').slice(0,40)}`))

  if (!APPLY) { console.log('\n(dry-run — добавь --apply)'); return }

  let cards = 0, offers = 0
  for (const e of bad) {
    // сбрасываем и URL, и ошибочный PID (он не настоящий Kaspi-id)
    await prisma.kaspiCatalogEntry.update({ where: { id: e.id }, data: { kaspiUrl: null, kaspiProductId: null } })
    cards++
    const r = await prisma.kaspiOffer.updateMany({ where: { kaspiSku: e.kaspiSku }, data: { kaspiUrl: null } })
    offers += r.count
  }
  const left = await prisma.kaspiCatalogEntry.count({ where: { kaspiUrl: { not: null } } })
  console.log(`\n✅ очищено карточек: ${cards}, офферов: ${offers}. Осталось с URL: ${left}`)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

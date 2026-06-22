// Массовая простановка kaspiUrl на базе PID (kaspiProductId).
// Формат проверен: https://kaspi.kz/shop/p/-<PID>/?c=750000000 → Kaspi сам
// редиректит на карточку товара (slug не нужен). Ведёт на правильный товар.
// Трогаем только карточки с PID и ПУСТЫМ kaspiUrl (ручные URL не перезаписываем).
//
//   node scripts/kaspi-fill-urls.js          # dry-run
//   node scripts/kaspi-fill-urls.js --apply   # применить
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const mkUrl = pid => `https://kaspi.kz/shop/p/-${pid}/?c=750000000`

// PID валиден для ссылки только если это РЕАЛЬНЫЙ Kaspi product-id:
//  - SKU был вида цифры_цифры (PID = первая часть), ИЛИ
//  - PID — большое отдельное число (>=10 млн).
// Короткий артикул (напр. 685) — НЕ Kaspi-id, ссылка по нему не работает.
function validPid(sku, pid) {
  if (!pid || !/^\d+$/.test(pid)) return false
  if (String(sku).includes('_')) return true
  return Number(pid) >= 10000000
}

async function main() {
  const rows = await prisma.kaspiCatalogEntry.findMany({
    where: { kaspiProductId: { not: null }, kaspiUrl: null },
    select: { id: true, kaspiProductId: true, kaspiSku: true, name: true },
  })
  const targets = rows.filter(r => validPid(r.kaspiSku, r.kaspiProductId))
  console.log('=== Простановка kaspiUrl по PID ===')
  console.log('карточек с PID без URL:', rows.length, '| из них валидный Kaspi-id (ставим ссылку):', targets.length)
  console.log('пропущено (короткий артикул, не Kaspi-id):', rows.length - targets.length)
  console.log('пример:', targets[0] ? mkUrl(targets[0].kaspiProductId) : '—')

  if (!APPLY) { console.log('\n(dry-run — добавь --apply)'); return }

  let done = 0
  for (const t of targets) {
    await prisma.kaspiCatalogEntry.update({ where: { id: t.id }, data: { kaspiUrl: mkUrl(t.kaspiProductId) } })
    done++
  }
  // офферы без URL: ставим ссылку только если PID оффера — валидный Kaspi-id.
  const offers = await prisma.kaspiOffer.findMany({ where: { kaspiUrl: null }, select: { id: true, kaspiSku: true } })
  let offDone = 0
  for (const o of offers) {
    const pid = String(o.kaspiSku).split('_')[0]
    if (!validPid(o.kaspiSku, pid)) continue
    await prisma.kaspiOffer.update({ where: { id: o.id }, data: { kaspiUrl: mkUrl(pid) } })
    offDone++
  }
  const withUrl = await prisma.kaspiCatalogEntry.count({ where: { kaspiUrl: { not: null } } })
  console.log(`\n✅ карточкам проставлено URL: ${done}, офферам: ${offDone}. Всего карточек с URL: ${withUrl}`)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

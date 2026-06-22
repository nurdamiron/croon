// Добивка kaspiUrl для карточек без ссылки (короткий артикул): ищем PID по
// ТОЧНОМУ совпадению нормализованного названия с карточкой, у которой есть
// валидный Kaspi-id. Проверено выборочно — совпадения корректные.
//
//   node scripts/kaspi-fill-urls-byname.js          # dry-run
//   node scripts/kaspi-fill-urls-byname.js --apply   # применить
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

const norm = s => (s || '').toLowerCase().replace(/[«»"'(),.\-–—]/g, ' ').replace(/\s+/g, ' ').trim()
const validPid = (sku, pid) => pid && /^\d+$/.test(pid) && (String(sku).includes('_') || Number(pid) >= 10000000)
const mkUrl = pid => `https://kaspi.kz/shop/p/-${pid}/?c=750000000`

async function main() {
  const all = await prisma.kaspiCatalogEntry.findMany({ select: { id: true, kaspiSku: true, kaspiProductId: true, kaspiUrl: true, name: true } })
  const noUrl = all.filter(e => !e.kaspiUrl)
  const withPid = all.filter(e => validPid(e.kaspiSku, e.kaspiProductId))
  const byName = new Map()
  for (const e of withPid) { const k = norm(e.name); if (k && !byName.has(k)) byName.set(k, e.kaspiProductId) }

  const fills = []
  for (const e of noUrl) {
    const pid = byName.get(norm(e.name))
    if (pid) fills.push({ id: e.id, sku: e.kaspiSku, pid, name: e.name })
  }
  console.log('=== Добивка URL по названию ===')
  console.log('карточек без URL:', noUrl.length, '| нашли PID по названию:', fills.length)

  if (!APPLY) { console.log('\n(dry-run — добавь --apply)'); return }

  let cards = 0
  const skuToPid = new Map()
  for (const f of fills) {
    await prisma.kaspiCatalogEntry.update({ where: { id: f.id }, data: { kaspiUrl: mkUrl(f.pid), kaspiProductId: f.pid } })
    skuToPid.set(f.sku, f.pid)
    cards++
  }
  // офферы тех же карточек (по kaspiSku) без URL
  let offers = 0
  for (const [sku, pid] of skuToPid) {
    const r = await prisma.kaspiOffer.updateMany({ where: { kaspiSku: sku, kaspiUrl: null }, data: { kaspiUrl: mkUrl(pid) } })
    offers += r.count
  }
  const withUrl = await prisma.kaspiCatalogEntry.count({ where: { kaspiUrl: { not: null } } })
  console.log(`\n✅ карточкам проставлено: ${cards}, офферам: ${offers}. Всего карточек с URL: ${withUrl}`)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

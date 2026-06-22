// Проверка проставленных kaspiUrl запросом к Kaspi и очистка нерабочих.
// Проверяем только "под вопросом": PID большой отдельный (SKU без "_"), т.к.
// PID из длинного SKU надёжны. Нерабочие (404 / пустой title) — чистим
// kaspiUrl у карточки и связанных офферов.
//
//   node scripts/kaspi-verify-urls.js          # dry-run (только проверка)
//   node scripts/kaspi-verify-urls.js --apply   # очистить нерабочие
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function isValidKaspi(pid) {
  const url = `https://kaspi.kz/shop/p/-${pid}/?c=750000000`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
    if (r.status === 404) return false
    if (!r.ok) return false
    const html = await r.text()
    const m = html.match(/<title>([^<]*)<\/title>/i)
    const title = (m ? m[1] : '').toLowerCase()
    // валидная карточка товара: есть «купить ... на kaspi» в title
    return title.includes('купить') && title.includes('kaspi')
  } catch { return false }
}

async function main() {
  const rows = await prisma.kaspiCatalogEntry.findMany({
    where: { kaspiUrl: { not: null } },
    select: { id: true, kaspiSku: true, kaspiProductId: true, name: true },
  })
  // под вопросом: SKU без "_" и большой отдельный PID
  const suspect = rows.filter(e => !String(e.kaspiSku).includes('_') && /^\d+$/.test(e.kaspiProductId || '') && Number(e.kaspiProductId) >= 10000000)
  console.log('=== Проверка ссылок (под вопросом) ===')
  console.log('к проверке:', suspect.length)

  const bad = []
  let checked = 0
  for (const e of suspect) {
    const ok = await isValidKaspi(e.kaspiProductId)
    checked++
    if (!ok) bad.push(e)
    if (checked % 20 === 0) console.log(`  ...${checked}/${suspect.length}, нерабочих ${bad.length}`)
    await sleep(400) // троттлинг, чтобы не словить блок
  }
  console.log(`\nпроверено: ${checked}, НЕРАБОЧИХ (очистим): ${bad.length}`)
  bad.slice(0, 20).forEach(e => console.log(`  sku=${e.kaspiSku} pid=${e.kaspiProductId}  ${(e.name||'').slice(0,40)}`))

  if (!APPLY) { console.log('\n(dry-run — добавь --apply чтобы очистить нерабочие)'); return }

  let clearedCards = 0, clearedOffers = 0
  for (const e of bad) {
    await prisma.kaspiCatalogEntry.update({ where: { id: e.id }, data: { kaspiUrl: null } })
    clearedCards++
    const r = await prisma.kaspiOffer.updateMany({ where: { kaspiSku: e.kaspiSku }, data: { kaspiUrl: null } })
    clearedOffers += r.count
  }
  console.log(`\n✅ очищено карточек: ${clearedCards}, офферов: ${clearedOffers}`)
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

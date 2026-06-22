// Диагностика: где и сколько сохранённых Kaspi URL после импорта.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const catUrl = await prisma.kaspiCatalogEntry.count({ where: { kaspiUrl: { not: null } } })
  const catPid = await prisma.kaspiCatalogEntry.count({ where: { kaspiProductId: { not: null } } })
  const offUrl = await prisma.kaspiOffer.count({ where: { kaspiUrl: { not: null } } })
  const offTotal = await prisma.kaspiOffer.count()
  console.log('KaspiCatalogEntry с kaspiUrl:', catUrl)
  console.log('KaspiCatalogEntry с kaspiProductId:', catPid)
  console.log('KaspiOffer с kaspiUrl:', offUrl, 'из', offTotal)

  // примеры офферов: есть ли url
  const sample = await prisma.kaspiOffer.findMany({
    select: { kaspiSku: true, kaspiUrl: true, kaspiName: true },
    take: 8, orderBy: { updatedAt: 'desc' },
  })
  console.log('\nпоследние офферы:')
  sample.forEach(o => console.log(`  sku=${o.kaspiSku}  url=${o.kaspiUrl ? 'ЕСТЬ' : '—'}  ${(o.kaspiName||'').slice(0,30)}`))
}
main().then(() => prisma.$disconnect()).catch(e => { console.error('ERR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

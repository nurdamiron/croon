// Переход модели склада Satu: reserved → completed (списание сразу при заказе),
// чтобы было как у Alash/Ba3ar. Активные заказы со stockApplied='reserved'
// держат остаток в reservedStock; конвертируем в списание totalStock.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.satuOrder.findMany({
    where: { stockApplied: 'reserved' },
    include: { items: true },
  })
  console.log('[migrate] заказов Satu в reserved:', orders.length)

  let touched = 0
  for (const o of orders) {
    for (const it of o.items) {
      if (!it.productId) continue
      await prisma.$executeRaw`UPDATE "Product" SET "reservedStock" = GREATEST(0, "reservedStock" - ${it.quantity}) WHERE id = ${it.productId}`
      await prisma.$executeRaw`UPDATE "Product" SET "totalStock" = GREATEST(0, "totalStock" - ${it.quantity}) WHERE id = ${it.productId}`
      touched++
    }
    await prisma.satuOrder.update({ where: { id: o.id }, data: { stockApplied: 'completed' } })
    console.log(`[migrate] Satu ${o.satuOrderId}: reserved → completed (${o.items.length} поз.)`)
  }
  console.log('[migrate] позиций обработано:', touched)
}

main().then(() => prisma.$disconnect()).catch(e => { console.error('[migrate] ERROR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

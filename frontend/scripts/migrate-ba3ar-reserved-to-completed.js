// Переход модели склада Ba3ar: reserved → completed (списание сразу при заказе).
// Существующие активные заказы со stockApplied='reserved' держат остаток в
// reservedStock. Новая модель списывает totalStock сразу. Этот скрипт для таких
// заказов: снимает бронь (reservedStock -= qty) и списывает (totalStock -= qty),
// ставит stockApplied='completed'. Идемпотентно (повторно не тронет, т.к.
// reserved уже не будет).
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.ba3arOrder.findMany({
    where: { stockApplied: 'reserved' },
    include: { items: true },
  })
  console.log('[migrate] заказов в reserved:', orders.length)

  let touchedItems = 0
  for (const o of orders) {
    for (const it of o.items) {
      if (!it.productId) continue
      // reserved → completed: снять бронь и списать со склада
      await prisma.$executeRaw`UPDATE "Product" SET "reservedStock" = GREATEST(0, "reservedStock" - ${it.quantity}) WHERE id = ${it.productId}`
      await prisma.$executeRaw`UPDATE "Product" SET "totalStock" = GREATEST(0, "totalStock" - ${it.quantity}) WHERE id = ${it.productId}`
      touchedItems++
    }
    await prisma.ba3arOrder.update({ where: { id: o.id }, data: { stockApplied: 'completed' } })
    console.log(`[migrate] заказ ${o.orderNumber || o.ba3arOrderId}: reserved → completed (${o.items.length} поз.)`)
  }
  console.log('[migrate] позиций обработано:', touchedItems)
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error('[migrate] ERROR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

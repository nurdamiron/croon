// Перенумерация Ba3arOrder.orderNumber: существующие заказы → с 10000 по дате
// создания, затем сдвигаем sequence чтобы новые продолжали с следующего номера.
// Запуск на сервере (DATABASE_URL → прод). Идемпотентно для повторного запуска
// в том смысле, что просто пере-проставит подряд от 10000.
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const START = 10000

async function main() {
  const orders = await prisma.ba3arOrder.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, orderNumber: true, ba3arOrderId: true },
  })
  console.log('[renumber] orders:', orders.length)

  let n = START
  for (const o of orders) {
    await prisma.ba3arOrder.update({ where: { id: o.id }, data: { orderNumber: n } })
    n++
  }
  const next = n // следующий свободный номер

  // Сдвигаем sequence у колонки orderNumber, чтобы автоинкремент продолжил с next.
  // Имя sequence в Postgres по умолчанию: "Ba3arOrder_orderNumber_seq".
  const seqRow = await prisma.$queryRawUnsafe(
    `SELECT pg_get_serial_sequence('"Ba3arOrder"', 'orderNumber') AS seq`
  )
  const seq = seqRow?.[0]?.seq
  console.log('[renumber] sequence:', seq, 'set to', next - 1, '(next =', next, ')')
  if (seq) {
    // setval(seq, next-1, true) → следующий nextval вернёт next
    await prisma.$executeRawUnsafe(`SELECT setval('${seq}', ${next - 1}, true)`)
  }

  const after = await prisma.ba3arOrder.findMany({
    orderBy: { orderNumber: 'asc' }, select: { orderNumber: true, ba3arOrderId: true },
  })
  console.log('[renumber] after:', JSON.stringify(after.map(x => x.orderNumber)))
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error('[renumber] ERROR', e.message); return prisma.$disconnect().then(() => process.exit(1)) })

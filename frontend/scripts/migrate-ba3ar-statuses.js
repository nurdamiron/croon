// Разовая миграция статусов Ba3arOrder на новую схему (как у Alash).
// Запускается на сервере, где DATABASE_URL указывает на прод RDS.
//   node scripts/migrate-ba3ar-statuses.js
// Идемпотентна: повторный запуск ничего не сломает (старых значений уже нет).
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const before = await prisma.$queryRawUnsafe(
    'SELECT status, count(*)::int AS n FROM "Ba3arOrder" GROUP BY status ORDER BY status'
  )
  console.log('[migrate] before:', JSON.stringify(before))

  const n1 = await prisma.$executeRawUnsafe(`UPDATE "Ba3arOrder" SET status = 'new' WHERE status = 'pending'`)
  const n2 = await prisma.$executeRawUnsafe(`UPDATE "Ba3arOrder" SET status = 'delivered' WHERE status = 'completed'`)
  console.log(`[migrate] pending->new: ${n1}, completed->delivered: ${n2}`)

  const after = await prisma.$queryRawUnsafe(
    'SELECT status, count(*)::int AS n FROM "Ba3arOrder" GROUP BY status ORDER BY status'
  )
  console.log('[migrate] after:', JSON.stringify(after))
}

main()
  .then(() => prisma.$disconnect())
  .catch(e => { console.error('[migrate] ERROR', e); return prisma.$disconnect().then(() => process.exit(1)) })

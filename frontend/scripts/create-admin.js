const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2] || 'admin@croon.kz'
  const password = process.argv[3] || 'admin123'

  const hash = await bcrypt.hash(password, 10)

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', passwordHash: hash },
    create: {
      email,
      passwordHash: hash,
      name: 'Администратор',
      role: 'ADMIN',
    },
  })

  console.log(`Admin user created/updated:`)
  console.log(`  Email: ${email}`)
  console.log(`  Password: ${password}`)
  console.log(`  ID: ${user.id}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

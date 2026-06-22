const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.page.count();
  console.log('Total pages in DB:', count);
  const pages = await prisma.page.findMany({ select: { slug: true, title: true } });
  console.log('Pages list:', pages);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

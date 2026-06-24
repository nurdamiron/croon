const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const productCount = await prisma.product.count();
  const imageCount = await prisma.productImage.count();
  console.log('Database Counts:');
  console.log(`  Products: ${productCount}`);
  console.log(`  Product Images: ${imageCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

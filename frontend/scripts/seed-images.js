const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Bulk seeding sample images for all products in DB...');
  
  // 1. Delete all existing product images
  await prisma.productImage.deleteMany({});
  
  // 2. Fetch all products
  const products = await prisma.product.findMany({
    select: { id: true, name: true }
  });
  
  // 3. Create bulk image data
  const data = products.map(p => ({
    productId: p.id,
    url: '/icons/icon-192x192.png',
    alt: p.name,
    sortOrder: 0
  }));
  
  // 4. Insert in bulk
  if (data.length > 0) {
    const result = await prisma.productImage.createMany({ data });
    console.log(`Successfully added ${result.count} mock images in bulk!`);
  } else {
    console.log('No products found to seed images for.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

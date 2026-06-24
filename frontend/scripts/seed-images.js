const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding sample images for test products...');
  
  const products = await prisma.product.findMany();
  
  for (const p of products) {
    // Delete existing images for the product to prevent duplicates
    await prisma.productImage.deleteMany({
      where: { productId: p.id }
    });
    
    // Create a mock image record with a relative URL (which passes CSP)
    await prisma.productImage.create({
      data: {
        productId: p.id,
        url: '/icons/icon-192x192.png',
        alt: p.name,
        sortOrder: 0
      }
    });
    
    console.log(`Added mock image for product: ${p.name} (${p.id})`);
  }
  
  console.log('Mock images seeded successfully!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

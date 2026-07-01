const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const productCount = await prisma.product.count();
  const imageCount = await prisma.productImage.count();
  console.log('Database Counts:');
  console.log(`  Products: ${productCount}`);
  console.log(`  Product Images: ${imageCount}`);

  // Fetch some products with images
  const productsWithImages = await prisma.product.findMany({
    take: 30,
    include: {
      images: {
        orderBy: { sortOrder: 'asc' }
      }
    }
  });

  console.log('\nSample Product Images:');
  for (const p of productsWithImages) {
    console.log(`Product: "${p.name}" (ID: ${p.id}, Slug: ${p.slug})`);
    if (p.images.length === 0) {
      console.log('  No images');
    } else {
      p.images.forEach(img => {
        console.log(`  - URL: ${img.url}`);
      });
    }
  }

  // Count how many images contain favicon or alash/logo
  const faviconImages = await prisma.productImage.findMany({
    where: {
      url: {
        contains: 'favicon',
        mode: 'insensitive'
      }
    }
  });
  console.log(`\nImages with 'favicon' in URL: ${faviconImages.length}`);
  if (faviconImages.length > 0) {
    console.log('Examples:');
    faviconImages.slice(0, 5).forEach(img => console.log(`  ProductId: ${img.productId}, URL: ${img.url}`));
  }

  const logoImages = await prisma.productImage.findMany({
    where: {
      url: {
        contains: 'logo',
        mode: 'insensitive'
      }
    }
  });
  console.log(`\nImages with 'logo' in URL: ${logoImages.length}`);
  if (logoImages.length > 0) {
    console.log('Examples:');
    logoImages.slice(0, 5).forEach(img => console.log(`  ProductId: ${img.productId}, URL: ${img.url}`));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());


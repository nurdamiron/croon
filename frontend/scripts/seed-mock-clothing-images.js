/**
 * Seed high-quality mock clothing images from Unsplash for staging/development.
 * This avoids needing the client's Kaspi cabinet credentials to show a fully working demo site.
 * 
 * Usage:
 *    node scripts/seed-mock-clothing-images.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// High-quality, clean product-focused fashion images from Unsplash
const images = {
  white: [
    'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1554568218-0f1715e72254?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=600&auto=format&fit=crop&q=80'
  ],
  black: [
    'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=600&auto=format&fit=crop&q=80&blend=000000&blend-mode=difference', // black blend
    'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&auto=format&fit=crop&q=80&sat=-100', // grayscale black
    'https://images.unsplash.com/photo-1618220179428-22790b461013?w=600&auto=format&fit=crop&q=80'
  ],
  grey: [
    'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&auto=format&fit=crop&q=80&sat=-50',
    'https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=600&auto=format&fit=crop&q=80&sat=-50'
  ],
  beige: [
    'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&auto=format&fit=crop&q=80'
  ],
  pink: [
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&auto=format&fit=crop&q=80&hue=300', // pinkish hue
    'https://images.unsplash.com/photo-1554568218-0f1715e72254?w=600&auto=format&fit=crop&q=80&hue=280'
  ],
  generic: [
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1618220179428-22790b461013?w=600&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=600&auto=format&fit=crop&q=80'
  ]
};

async function main() {
  console.log('Seeding beautiful mock clothing images for all products in DB...');

  const products = await prisma.product.findMany({
    select: { id: true, name: true }
  });

  console.log(`Found ${products.length} products to update.`);

  let updatedCount = 0;

  for (const p of products) {
    const nameLower = p.name.toLowerCase();
    let colorType = 'generic';

    if (nameLower.includes('белый') || nameLower.includes('белая') || nameLower.includes('белое')) {
      colorType = 'white';
    } else if (nameLower.includes('черный') || nameLower.includes('чёрный') || nameLower.includes('черная') || nameLower.includes('чёрная') || nameLower.includes('черное') || nameLower.includes('чёрное')) {
      colorType = 'black';
    } else if (nameLower.includes('серый') || nameLower.includes('серая') || nameLower.includes('серое')) {
      colorType = 'grey';
    } else if (nameLower.includes('бежевый') || nameLower.includes('бежевая') || nameLower.includes('бежевое')) {
      colorType = 'beige';
    } else if (nameLower.includes('розовый') || nameLower.includes('розовая') || nameLower.includes('розовое')) {
      colorType = 'pink';
    }

    const availableImages = images[colorType];
    
    // Pick 2 different images for hover gallery effect
    const idx1 = Math.floor(Math.random() * availableImages.length);
    let idx2 = Math.floor(Math.random() * availableImages.length);
    if (idx1 === idx2 && availableImages.length > 1) {
      idx2 = (idx1 + 1) % availableImages.length;
    }

    const imgUrl1 = availableImages[idx1];
    const imgUrl2 = availableImages[idx2];

    // Update in database: delete old images and add mock ones
    await prisma.$transaction([
      prisma.productImage.deleteMany({ where: { productId: p.id } }),
      prisma.productImage.createMany({
        data: [
          {
            productId: p.id,
            url: imgUrl1,
            alt: p.name,
            sortOrder: 0
          },
          {
            productId: p.id,
            url: imgUrl2,
            alt: p.name,
            sortOrder: 1
          }
        ]
      })
    ]);

    updatedCount++;
    if (updatedCount % 50 === 0) {
      console.log(`  Updated ${updatedCount}/${products.length} products...`);
    }
  }

  console.log(`\nSuccessfully seeded high-quality mock clothing images for ${updatedCount} products!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

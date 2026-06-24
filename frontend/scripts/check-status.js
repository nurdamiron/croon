const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- DIAGNOSTICS START ---');
  
  // 1. Products and Images
  const productCount = await prisma.product.count();
  const imageCount = await prisma.productImage.count();
  const productWithNoImages = await prisma.product.count({
    where: {
      images: {
        none: {}
      }
    }
  });
  console.log(`Products: ${productCount}`);
  console.log(`Images: ${imageCount}`);
  console.log(`Products with no images: ${productWithNoImages}`);

  // 2. Categories
  const categoryCount = await prisma.category.count();
  console.log(`Categories: ${categoryCount}`);

  // 3. Kaspi Offers
  const offerCount = await prisma.kaspiOffer.count();
  const activeOfferCount = await prisma.kaspiOffer.count({ where: { active: true } });
  console.log(`Kaspi Offers: ${offerCount} (Active: ${activeOfferCount})`);

  // 4. Kaspi Orders
  const orderCount = await prisma.kaspiOrder.count();
  console.log(`Kaspi Orders: ${orderCount}`);
  
  if (orderCount > 0) {
    const minMaxDates = await prisma.$queryRaw`
      SELECT 
        MIN("creationDate") as min_date,
        MAX("creationDate") as max_date,
        COUNT(CASE WHEN "creationDate" IS NULL THEN 1 END) as null_dates
      FROM "KaspiOrder"
    `;
    console.log('Orders creation dates range:', minMaxDates);

    const statuses = await prisma.$queryRaw`
      SELECT status, COUNT(*) as count
      FROM "KaspiOrder"
      GROUP BY status
    `;
    console.log('Orders by status:', statuses);
  }

  // 5. App settings
  const settings = await prisma.appSetting.findMany();
  console.log('App Settings:', settings);

  console.log('--- DIAGNOSTICS END ---');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const totalProducts = await prisma.product.count();
  const totalOffers = await prisma.kaspiOffer.count();
  const totalCatalog = await prisma.kaspiCatalogEntry.count();

  console.log(`Products: ${totalProducts}`);
  console.log(`Kaspi Offers: ${totalOffers}`);
  console.log(`Kaspi Catalog Entries: ${totalCatalog}`);

  const offersWithUrl = await prisma.kaspiOffer.findMany({
    where: {
      kaspiUrl: { not: null }
    },
    take: 10
  });

  const catalogWithUrl = await prisma.kaspiCatalogEntry.findMany({
    where: {
      kaspiUrl: { not: null }
    },
    take: 10
  });

  console.log(`\nOffers with URL: ${offersWithUrl.length} (out of ${totalOffers})`);
  offersWithUrl.forEach(o => {
    console.log(`  Offer SKU: ${o.kaspiSku} -> URL: ${o.kaspiUrl}`);
  });

  console.log(`\nCatalog Entries with URL: ${catalogWithUrl.length} (out of ${totalCatalog})`);
  catalogWithUrl.forEach(c => {
    console.log(`  Catalog SKU: ${c.kaspiSku} -> URL: ${c.kaspiUrl}`);
  });

  // Check how many product SKUs are valid numbers or contain underscores
  const products = await prisma.product.findMany({
    select: { id: true, name: true, sku: true }
  });
  let withNumSku = 0;
  products.forEach(p => {
    if (p.sku && /^\d+$/.test(p.sku)) withNumSku++;
  });
  console.log(`\nProducts with numeric SKUs (could be Kaspi PIDs): ${withNumSku}`);
  products.slice(0, 10).forEach(p => {
    console.log(`  Product: "${p.name}" | SKU: ${p.sku}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());



const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const [noDescCats, allCats, noDescProds, totalProds, withDescProds] = await Promise.all([
    prisma.category.findMany({ where: { isHidden: false, description: null }, select: { id:true, name:true, slug:true, parentId:true }, orderBy: { sortOrder: 'asc' } }),
    prisma.category.findMany({ where: { isHidden: false }, select: { id:true, name:true, slug:true, parentId:true } }),
    prisma.product.count({ where: { OR: [{ description: null }, { description: '' }] } }),
    prisma.product.count(),
    prisma.product.count({ where: { description: { not: null }, NOT: { description: '' } } }),
  ]);
  console.log('=== CATEGORIES ===');
  console.log('Total visible:', allCats.length);
  console.log('Without description:', noDescCats.length);
  console.log('\nFirst 30 without description:');
  noDescCats.slice(0, 30).forEach(c => console.log(' ', c.slug, '-', c.name));

  console.log('\n=== PRODUCTS ===');
  console.log('Total:', totalProds);
  console.log('Without description:', noDescProds);
  console.log('With description:', withDescProds);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });

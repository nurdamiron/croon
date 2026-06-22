const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const slugs = ['mikroskop-micron-g-1200-1-1200x', 'radiopriemnik-flysky-fs-i6-i6-24-ggts-kanalov-peredatchik-afhds'];
  for (const slug of slugs) {
    const prod = await p.product.findUnique({ where: { slug }, select: { name: true, slug: true, description: true, price: true } });
    if (prod) {
      console.log('=== ' + prod.slug + ' ===');
      console.log('Name:', prod.name);
      console.log('Price:', prod.price);
      console.log('Desc length:', (prod.description||'').length, 'chars');
      console.log('Desc preview:', (prod.description||'').slice(0, 500));
      console.log();
    }
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });

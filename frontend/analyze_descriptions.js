const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const products = await prisma.product.findMany({
    select: { slug: true, name: true, description: true }
  });

  // Strip HTML tags to get text length
  const stripHtml = s => s ? s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';

  const lengths = products.map(p => ({
    slug: p.slug,
    name: p.name,
    textLen: stripHtml(p.description).length,
    htmlLen: (p.description || '').length,
  }));

  lengths.sort((a, b) => a.textLen - b.textLen);

  const avg = lengths.reduce((s, x) => s + x.textLen, 0) / lengths.length;
  const under50 = lengths.filter(x => x.textLen < 50).length;
  const under200 = lengths.filter(x => x.textLen < 200).length;
  const under500 = lengths.filter(x => x.textLen < 500).length;
  const over500 = lengths.filter(x => x.textLen >= 500).length;

  console.log('=== PRODUCT DESCRIPTION ANALYSIS ===');
  console.log('Total products:', products.length);
  console.log('Avg text length:', Math.round(avg), 'chars');
  console.log('< 50 chars (nearly empty):', under50);
  console.log('< 200 chars (very short):', under200);
  console.log('< 500 chars (short):', under500);
  console.log('>= 500 chars (decent):', over500);

  console.log('\n--- 20 shortest descriptions ---');
  lengths.slice(0, 20).forEach(p => console.log(`  ${p.textLen}c  ${p.slug}`));

  // Category descriptions
  const cats = await prisma.category.findMany({
    where: { isHidden: false, description: { not: null } },
    select: { slug: true, name: true, description: true }
  });
  const catLengths = cats.map(c => ({ slug: c.slug, textLen: (c.description || '').length }));
  catLengths.sort((a, b) => a.textLen - b.textLen);
  const catAvg = catLengths.reduce((s, x) => s + x.textLen, 0) / catLengths.length;
  console.log('\n=== CATEGORY DESCRIPTION ANALYSIS ===');
  console.log('Avg length:', Math.round(catAvg), 'chars');
  console.log('< 50 chars:', catLengths.filter(x => x.textLen < 50).length);
  console.log('< 100 chars:', catLengths.filter(x => x.textLen < 100).length);
  console.log('\n--- 20 shortest category descriptions ---');
  catLengths.slice(0, 20).forEach(c => console.log(`  ${c.textLen}c  ${c.slug}`));

  await prisma.$disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });

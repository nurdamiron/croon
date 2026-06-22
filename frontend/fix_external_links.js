/**
 * Strips all external <a href="http..."> links from product descriptions.
 * Keeps the link text, removes the href. Internal links (/...) are preserved.
 *
 * Fixes: "Broken external links" SEO issue (2076 pages in Semrush report).
 * Run: node fix_external_links.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function stripExternalLinks(html) {
  if (!html) return html;
  // Replace <a href="http://..."> or <a href='https://...'> with their inner text
  // Handles multiline and attributes in any order
  return html.replace(
    /<a\s+[^>]*href=["']https?:\/\/[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    '$1'
  );
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { description: { contains: 'href="http' } },
        { description: { contains: "href='http" } },
      ],
    },
    select: { id: true, slug: true, description: true },
  });

  console.log(`Found ${products.length} products with external links in descriptions`);

  let updated = 0;
  for (const product of products) {
    if (!product.description) continue;
    const cleaned = stripExternalLinks(product.description);
    if (cleaned !== product.description) {
      await prisma.product.update({
        where: { id: product.id },
        data: { description: cleaned },
      });
      updated++;
      if (updated % 50 === 0) console.log(`  Updated ${updated}...`);
    }
  }

  console.log(`Done. Updated ${updated} product descriptions.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });

/**
 * Cleans leftover HTML entities (&nbsp;, &amp;, etc.) from Markdown descriptions.
 * These remain after the HTML→Markdown migration when entities weren't in tags.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&mdash;': '—', '&ndash;': '–',
  '&laquo;': '«', '&raquo;': '»', '&hellip;': '…', '&times;': '×',
  '&deg;': '°', '&plusmn;': '±', '&copy;': '©', '&reg;': '®',
};

function decodeEntities(str) {
  let result = str;
  for (const [entity, char] of Object.entries(ENTITIES)) {
    result = result.replaceAll(entity, char);
  }
  // Also handle numeric entities like &#160;
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  // Clean up multiple spaces left from &nbsp; chains
  result = result.replace(/ {3,}/g, '  ');
  return result;
}

async function main() {
  const products = await prisma.product.findMany({
    where: { description: { contains: '&' } },
    select: { id: true, slug: true, description: true },
  });

  console.log(`Found ${products.length} products with HTML entities`);
  let updated = 0;

  for (const p of products) {
    if (!p.description) continue;
    const cleaned = decodeEntities(p.description);
    if (cleaned !== p.description) {
      await prisma.product.update({ where: { id: p.id }, data: { description: cleaned } });
      updated++;
    }
  }

  console.log(`Updated: ${updated} products`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });

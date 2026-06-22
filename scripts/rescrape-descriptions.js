/**
 * Re-scrape product descriptions from live InSales site to get HTML versions
 * (XML export strips HTML, leaving plain text without links/tables/images)
 *
 * Usage: node scripts/rescrape-descriptions.js [--dry-run] [--limit N] [--all]
 *   --dry-run: Don't update DB, just show what would change
 *   --limit N: Only process first N products
 *   --all: Re-scrape all products (not just plain-text ones)
 */

const https = require('https');
const path = require('path');
// Prisma client is in frontend/node_modules
const { PrismaClient } = require(path.join(__dirname, '..', 'frontend', 'node_modules', '@prisma', 'client'));

const prisma = new PrismaClient();
const CONCURRENCY = 3;
const DELAY = 800; // ms between batches

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 0;

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function extractDescription(html) {
  // Primary: InSales uses <div class="content-description static-text">...</div>
  // This contains the actual rich HTML content
  const contentMatch = html.match(/<div[^>]*class="content-description[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/i);
  if (contentMatch && contentMatch[1].trim().length > 10) {
    return cleanHtml(contentMatch[1].trim());
  }

  // Fallback patterns
  const patterns = [
    /<div[^>]*class="[^"]*product__description[^"]*static-text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*data-product-description[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1].trim().length > 10) {
      return cleanHtml(match[1].trim());
    }
  }

  return '';
}

function cleanHtml(html) {
  return html
    // Remove InSales-specific wrapper divs
    .replace(/<div[^>]*class="[^"]*static-text[^"]*"[^>]*>/gi, '')
    // Remove empty spans
    .replace(/<span>\s*<\/span>/gi, '')
    // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hasHtmlTags(text) {
  return /<[a-z][\s\S]*>/i.test(text);
}

async function main() {
  // Get products to process
  const where = ALL ? {} : {
    description: { not: null },
    NOT: { description: { contains: '<p>' } },
  };

  let products = await prisma.product.findMany({
    where,
    select: { id: true, slug: true, name: true, description: true },
    orderBy: { createdAt: 'asc' },
  });

  // Filter to only plain-text descriptions (no HTML tags) unless --all
  if (!ALL) {
    products = products.filter(p => p.description && !hasHtmlTags(p.description));
  }

  if (LIMIT > 0) {
    products = products.slice(0, LIMIT);
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Processing ${products.length} products...`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let noDesc = 0;
  let done = 0;

  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);

    const promises = batch.map(async (product) => {
      if (!product.slug) {
        skipped++;
        done++;
        return;
      }

      const url = `https://alash-electronics.kz/product/${product.slug}`;

      try {
        const html = await fetchPage(url);
        const desc = extractDescription(html);

        if (desc && desc.length > 10) {
          // Check if description actually has HTML tags (worth updating)
          if (hasHtmlTags(desc)) {
            if (!DRY_RUN) {
              await prisma.product.update({
                where: { id: product.id },
                data: { description: desc },
              });
            }
            updated++;
            if (done < 5 || done % 100 === 0) {
              console.log(`  ✓ ${product.name} — ${desc.length} chars (HTML)`);
            }
          } else {
            skipped++;
          }
        } else {
          noDesc++;
        }
      } catch (err) {
        failed++;
        if (failed <= 5) {
          console.log(`  ✗ ${product.name}: ${err.message}`);
        }
      }
      done++;
    });

    await Promise.all(promises);

    if (done % 50 === 0 || done === products.length) {
      console.log(`  Progress: ${done}/${products.length} (updated: ${updated}, skipped: ${skipped}, no-desc: ${noDesc}, failed: ${failed})`);
    }

    await sleep(DELAY);
  }

  console.log(`\nDone! Updated: ${updated}, Skipped: ${skipped}, No description found: ${noDesc}, Failed: ${failed}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

/**
 * Sync product images from Kaspi.kz directly using the numeric SKU as a Kaspi Product ID (PID),
 * without needing to log in to the Seller Cabinet.
 * 
 * It performs a title-matching safety check to ensure it doesn't download the wrong image.
 * 
 * Usage:
 *    node scripts/sync-images-by-sku.js [--limit N] [--force]
 *    --limit N: Only process first N eligible products
 *    --force: Overwrite existing images even if they are not placeholders
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIMIT = process.argv.includes('--limit') ? parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : 0;
const FORCE = process.argv.includes('--force');

const DELAY_MS = 1500; // delay between requests to be nice to Kaspi CDN
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanImageUrl(url) {
  if (!url) return '';
  return url.replace(/\\u0026/g, '&');
}

// Check if names are similar enough
function areNamesSimilar(dbName, kaspiName) {
  const dbWords = dbName.toLowerCase().replace(/[^a-z0-9а-яё]+/g, ' ').split(' ').filter(w => w.length > 2);
  const kaspiWords = kaspiName.toLowerCase().replace(/[^a-z0-9а-яё]+/g, ' ').split(' ').filter(w => w.length > 2);
  
  // Look for signature brand or unique identifiers (e.g. Limark, Homies, etc.)
  const shared = dbWords.filter(w => kaspiWords.includes(w));
  
  // If they share at least 2 words or a brand name like "limark" / "homies"
  if (shared.includes('limark') || shared.includes('homies')) {
    return true;
  }
  
  return shared.length >= 2;
}

async function scrapeKaspiProduct(sku) {
  // Strip leading zero if present and check both formats
  const cleanSku = sku.replace(/^0+/, '');
  const urls = [
    `https://kaspi.kz/shop/p/-${cleanSku}/`,
    `https://kaspi.kz/shop/p/-${sku}/`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ru,en;q=0.9',
          'Referer': 'https://kaspi.kz/',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const html = await res.text();
      
      // Parse Title
      const tMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (!tMatch) continue;
      const title = tMatch[1].replace(/\s*[-—]\s*Kaspi\.kz.*$/i, '').replace(/\s*купить\s+в\s+.*$/i, '').trim();

      const images = [];
      // Approach 1: Parse BACKEND.components.item JSON structure
      const itemBlockMatch = html.match(/BACKEND\.components\.item\s*=\s*(\{[\s\S]*?\});/);
      if (itemBlockMatch) {
        try {
          const itemData = JSON.parse(itemBlockMatch[1]);
          const gallery = itemData.galleryImages || [];
          gallery.forEach(img => {
            const imgUrl = img.large || img.medium || img.small;
            if (imgUrl) images.push(cleanImageUrl(imgUrl));
          });
        } catch (e) {}
      }

      // Approach 2: Parse window.digitalData.product structure (primary image)
      if (images.length === 0) {
        const primaryMatch = html.match(/primaryImage["']\s*:\s*\{[^}]*large["']\s*:\s*["']([^"']+)["']/);
        if (primaryMatch) {
          images.push(cleanImageUrl(primaryMatch[1]));
        }
      }

      // Approach 3: Open Graph Image
      if (images.length === 0) {
        const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (ogImageMatch) {
          images.push(cleanImageUrl(ogImageMatch[1]));
        }
      }

      return {
        success: true,
        title,
        images: Array.from(new Set(images)).filter(Boolean)
      };

    } catch (err) {
      // try next url
    }
  }

  return { success: false };
}

async function main() {
  console.log('=== Direct SKU Image Sync Script ===');
  console.log(`Options: Limit=${LIMIT || 'None'}, Force=${FORCE}`);

  const products = await prisma.product.findMany({
    include: { images: true }
  });

  const eligible = products.filter(p => {
    const hasPlaceholder = p.images.length === 0 || p.images.every(img => img.url.includes('icon-192x192.png') || img.url.includes('placeholder.svg'));
    return (hasPlaceholder || FORCE) && p.sku && /^\d+$/.test(p.sku);
  });

  console.log(`Found ${eligible.length} products with numeric SKUs needing images.`);

  if (eligible.length === 0) {
    console.log('No products to sync.');
    return;
  }

  const batch = LIMIT > 0 ? eligible.slice(0, LIMIT) : eligible;
  console.log(`Processing ${batch.length} products...\n`);

  let succeeded = 0;
  let skippedMismatch = 0;
  let failedFetch = 0;

  for (let i = 0; i < batch.length; i++) {
    const p = batch[i];
    console.log(`[${i + 1}/${batch.length}] DB Product: "${p.name}" (SKU: ${p.sku})`);

    const result = await scrapeKaspiProduct(p.sku);

    if (result.success) {
      const match = areNamesSimilar(p.name, result.title);
      
      if (match) {
        console.log(`  ✅ Match! Kaspi Product: "${result.title}"`);
        console.log(`  Found ${result.images.length} images:`);
        result.images.forEach(img => console.log(`    - ${img}`));

        // Update database: delete old mock images and insert new ones
        await prisma.$transaction([
          prisma.productImage.deleteMany({ where: { productId: p.id } }),
          prisma.productImage.createMany({
            data: result.images.map((url, index) => ({
              productId: p.id,
              url,
              alt: p.name,
              sortOrder: index
            }))
          })
        ]);
        
        console.log('  Successfully saved to database.');
        succeeded++;
      } else {
        console.log(`  ❌ Mismatch! Title on Kaspi is "${result.title}". Skipping to avoid wrong images.`);
        skippedMismatch++;
      }
    } else {
      console.log('  ❌ Page returned 404 or request failed.');
      failedFetch++;
    }

    if (i < batch.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n=== Sync completed ===');
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Skipped (mismatch): ${skippedMismatch}`);
  console.log(`Failed (404/network): ${failedFetch}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

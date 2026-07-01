/**
 * Sync product images from Kaspi.kz by fetching the product pages and parsing their image galleries.
 * 
 * Pre-requisite:
 * 1. Run cabinet sync to populate real Kaspi URLs in the database:
 *    node scripts/kaspi-fill-urls-from-cabinet.mjs
 * 
 * Usage:
 *    node scripts/sync-images-from-kaspi.js [--force] [--limit N]
 *    --force: Re-fetch and overwrite images even if the product already has images (other than the favicon placeholder)
 *    --limit N: Stop after processing N products
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FORCE = process.argv.includes('--force');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : 0;

const DELAY_MS = 1500; // Delay between requests to prevent rate-limiting/blocks

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanImageUrl(url) {
  if (!url) return '';
  // Normalize formatting if needed
  return url.replace(/\\u0026/g, '&');
}

async function fetchProductImages(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru,en;q=0.9',
        'Referer': 'https://kaspi.kz/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.log(`  HTTP Error ${res.status}`);
      return null;
    }

    const html = await res.text();
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
      } catch (e) {
        // parsing failed, fallback
      }
    }

    // Approach 2: Parse window.digitalData.product structure (primary image)
    if (images.length === 0) {
      const primaryMatch = html.match(/primaryImage["']\s*:\s*\{[^}]*large["']\s*:\s*["']([^"']+)["']/);
      if (primaryMatch) {
        images.push(cleanImageUrl(primaryMatch[1]));
      }
    }

    // Approach 3: Open Graph Image fallback
    if (images.length === 0) {
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
      if (ogImageMatch) {
        images.push(cleanImageUrl(ogImageMatch[1]));
      }
    }

    // Deduplicate and filter empty
    return Array.from(new Set(images)).filter(Boolean);
  } catch (err) {
    console.log(`  Request failed: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Kaspi Image Synchronizer ===');
  console.log(`Options: Force=${FORCE}, Limit=${LIMIT || 'None'}`);

  // Fetch products with their Kaspi urls
  // We can look up URLs in both KaspiOffer and KaspiCatalogEntry
  const products = await prisma.product.findMany({
    include: {
      images: true,
      kaspiOffers: {
        where: { kaspiUrl: { not: null } }
      }
    }
  });

  console.log(`Loaded ${products.length} products from database.`);

  const toProcess = [];

  for (const p of products) {
    // Check if the product has only favicon mock images, or has no images at all
    const hasOnlyPlaceholder = p.images.length === 0 || p.images.every(img => img.url.includes('icon-192x192.png') || img.url.includes('placeholder.svg'));
    
    if (hasOnlyPlaceholder || FORCE) {
      // Find URL from KaspiOffer
      let kaspiUrl = p.kaspiOffers[0]?.kaspiUrl;
      
      // If not in offer, try to find in KaspiCatalogEntry by SKU
      if (!kaspiUrl && p.sku) {
        const catEntry = await prisma.kaspiCatalogEntry.findUnique({
          where: { kaspiSku: p.sku },
          select: { kaspiUrl: true }
        });
        kaspiUrl = catEntry?.kaspiUrl;
      }

      if (kaspiUrl) {
        toProcess.push({ product: p, kaspiUrl });
      }
    }
  }

  console.log(`Found ${toProcess.length} products eligible for image sync (have Kaspi URL, need images).`);

  if (toProcess.length === 0) {
    console.log('\nNo products to sync. Please make sure to run the cabinet URL sync first:');
    console.log('  node scripts/kaspi-fill-urls-from-cabinet.mjs');
    return;
  }

  const batch = LIMIT > 0 ? toProcess.slice(0, LIMIT) : toProcess;
  console.log(`Processing ${batch.length} products...\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i++) {
    const { product, kaspiUrl } = batch[i];
    console.log(`[${i + 1}/${batch.length}] Product: "${product.name}" (SKU: ${product.sku})`);
    console.log(`  Fetching images from: ${kaspiUrl}`);

    const imageUrls = await fetchProductImages(kaspiUrl);

    if (imageUrls && imageUrls.length > 0) {
      console.log(`  Found ${imageUrls.length} images:`);
      imageUrls.forEach(url => console.log(`    - ${url}`));

      // Update database inside transaction
      await prisma.$transaction([
        // Delete all old images for this product
        prisma.productImage.deleteMany({ where: { productId: product.id } }),
        // Create new ones
        prisma.productImage.createMany({
          data: imageUrls.map((url, index) => ({
            productId: product.id,
            url,
            alt: product.name,
            sortOrder: index
          }))
        })
      ]);

      console.log('  Successfully saved to database.');
      succeeded++;
    } else {
      console.log('  Failed to retrieve images.');
      failed++;
    }

    // Delay to respect rate limits
    if (i < batch.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log('\n=== Synchronization completed ===');
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

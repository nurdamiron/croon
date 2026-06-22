const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const CONCURRENCY = 5;
const DELAY = 500;

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractDescription(html) {
  // Try to find product description in InSales page
  const patterns = [
    /<div[^>]*class="[^"]*product-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*product__description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*data-product-description[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1].trim().length > 10) {
      return match[1].trim();
    }
  }
  return '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const products = JSON.parse(fs.readFileSync(path.join(DATA, 'products.json'), 'utf-8'));

  const missing = products.filter(p => !p.description || !p.description.trim());
  console.log(`Found ${missing.length} products without description`);

  if (missing.length === 0) {
    console.log('Nothing to do!');
    return;
  }

  let found = 0;
  let failed = 0;
  let done = 0;

  const descMap = {};

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const batch = missing.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (product) => {
      // Build URL from slug
      const url = `https://croon.kz/product/${product.slug}`;
      if (!product.slug) {
        failed++;
        done++;
        return;
      }

      try {
        const html = await fetchPage(url);
        const desc = extractDescription(html);
        if (desc) {
          descMap[product.groupId] = desc;
          found++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
      }
      done++;
    });

    await Promise.all(promises);

    if (done % 20 === 0 || done === missing.length) {
      console.log(`  Progress: ${done}/${missing.length} (found: ${found}, failed: ${failed})`);
    }

    await sleep(DELAY);
  }

  // Update products
  for (const product of products) {
    if (descMap[product.groupId]) {
      product.description = descMap[product.groupId];
    }
  }

  fs.writeFileSync(path.join(DATA, 'products.json'), JSON.stringify(products, null, 2));
  console.log(`\nUpdated products.json with ${found} new descriptions`);
}

main().catch(console.error);

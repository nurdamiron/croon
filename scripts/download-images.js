const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'public', 'images', 'products');
const DATA = path.join(ROOT, 'data');

const CONCURRENCY = 20;
const RETRY_COUNT = 3;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadFile(url, destPath, retries = RETRY_COUNT) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, destPath, retries).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => { fileStream.close(); resolve(); });
      fileStream.on('error', reject);
    });
    request.on('error', (err) => {
      if (retries > 0) {
        setTimeout(() => {
          downloadFile(url, destPath, retries - 1).then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });
    request.on('timeout', () => {
      request.destroy();
      if (retries > 0) {
        setTimeout(() => {
          downloadFile(url, destPath, retries - 1).then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(new Error(`Timeout for ${url}`));
      }
    });
  });
}

function urlToLocalPath(url) {
  // https://static.insales-cdn.com/images/products/1/6295/570546327/34.png
  // -> images/products/570546327/34.png
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    // Use last 2 meaningful path segments as folder/file
    const filename = parts[parts.length - 1];
    const folder = parts[parts.length - 2];
    return { folder, filename };
  } catch {
    const hash = Buffer.from(url).toString('base64url').slice(0, 20);
    return { folder: 'misc', filename: hash + '.png' };
  }
}

async function processQueue(urls, progressCallback) {
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const urlMap = {}; // original URL -> local path

  async function processOne(url) {
    const { folder, filename } = urlToLocalPath(url);
    const dir = path.join(IMAGES_DIR, folder);
    const destPath = path.join(dir, filename);
    const localRelPath = `/images/products/${folder}/${filename}`;

    urlMap[url] = localRelPath;

    if (fs.existsSync(destPath)) {
      skipped++;
      completed++;
      return;
    }

    ensureDir(dir);
    try {
      await downloadFile(url, destPath);
      completed++;
    } catch (err) {
      failed++;
      completed++;
      console.error(`  FAIL: ${filename} - ${err.message}`);
    }

    if (completed % 100 === 0) {
      progressCallback(completed, urls.length, failed, skipped);
    }
  }

  // Process in batches
  const queue = [...urls];
  const active = new Set();

  while (queue.length > 0 || active.size > 0) {
    while (active.size < CONCURRENCY && queue.length > 0) {
      const url = queue.shift();
      const promise = processOne(url).then(() => active.delete(promise));
      active.add(promise);
    }
    if (active.size > 0) {
      await Promise.race(active);
    }
  }

  return { urlMap, completed, failed, skipped };
}

async function main() {
  ensureDir(IMAGES_DIR);

  const imageUrls = JSON.parse(fs.readFileSync(path.join(DATA, 'image-urls.json'), 'utf-8'));
  console.log(`Downloading ${imageUrls.length} images (concurrency: ${CONCURRENCY})...\n`);

  const startTime = Date.now();

  const { urlMap, completed, failed, skipped } = await processQueue(imageUrls, (done, total, fail, skip) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`  Progress: ${done}/${total} (failed: ${fail}, skipped: ${skip}) - ${elapsed}s`);
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\nDone in ${elapsed}s!`);
  console.log(`  Total: ${completed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Skipped (already exists): ${skipped}`);

  // Save URL mapping for later use
  fs.writeFileSync(path.join(DATA, 'image-url-map.json'), JSON.stringify(urlMap, null, 2));
  console.log('\nSaved image-url-map.json');

  // Update products.json with local image paths
  const products = JSON.parse(fs.readFileSync(path.join(DATA, 'products.json'), 'utf-8'));
  for (const product of products) {
    product.localImages = product.pictures.map(url => urlMap[url] || url);
  }
  fs.writeFileSync(path.join(DATA, 'products-local.json'), JSON.stringify(products, null, 2));
  console.log('Saved products-local.json with local image paths');
}

main().catch(console.error);

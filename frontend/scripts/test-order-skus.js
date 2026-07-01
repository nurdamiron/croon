const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSku(sku) {
  const url = `https://kaspi.kz/shop/p/-${sku}/`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return `HTTP Error ${res.status}`;
    const html = await res.text();
    const t = html.match(/<title>([^<]+)<\/title>/i);
    if (t) {
      return t[1].replace(/\s*[-—]\s*Kaspi\.kz.*$/i, '').replace(/\s*купить\s+в\s+.*$/i, '').trim();
    }
    return 'Title not found';
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function main() {
  const skus = ['123116018', '123211741', '123116155'];

  console.log('Testing actual order SKUs against Kaspi.kz product pages:');
  for (const sku of skus) {
    const title = await checkSku(sku);
    console.log(`- SKU: ${sku} -> Title on Kaspi: "${title}"`);
    await new Promise(r => setTimeout(r, 1000));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

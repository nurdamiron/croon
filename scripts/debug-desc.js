const https = require('https');

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

(async () => {
  const slug = process.argv[2] || 'arduino-starter-kit-krasnyy-nabor';
  const html = await fetchPage(`https://alash-electronics.kz/product/${slug}`);

  // Find all divs with description-related classes
  const matches = html.matchAll(/<div[^>]*class="([^"]*(?:description|static)[^"]*)"[^>]*>/gi);
  for (const m of matches) {
    const idx = m.index;
    console.log(`\nClass: "${m[1]}"`);
    console.log('Context:', html.substring(idx, idx + 500).replace(/\n/g, '\\n'));
    console.log('---');
  }

  // Also try to find the actual product description content
  // InSales often uses: <div class="product__description static-text">...</div>
  const fullMatch = html.match(/<div[^>]*class="[^"]*product__description[^"]*"[^>]*>([\s\S]*?)(?=<\/div>\s*<(?:div[^>]*class="(?!product__description)|\/section|section))/i);
  if (fullMatch) {
    console.log('\n=== FULL DESCRIPTION MATCH ===');
    console.log('Length:', fullMatch[1].length);
    console.log(fullMatch[1].substring(0, 1000));
  }
})();

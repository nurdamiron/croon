const fs = require('fs');

async function main() {
  const query = 'Топ Homies 2039749236010 белый 44';
  const url = `https://kaspi.kz/shop/search/?text=${encodeURIComponent(query)}`;
  
  console.log(`Searching Kaspi for: "${query}"...`);
  console.log(`URL: ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru,en;q=0.9',
        'Referer': 'https://kaspi.kz/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    console.log(`Status: ${res.status}`);
    if (!res.ok) {
      console.log('Search request failed');
      return;
    }

    const html = await res.text();
    fs.writeFileSync('kaspi-search-result.html', html);
    console.log('Search page HTML saved to kaspi-search-result.html');

    // Look for product card URLs or images in the search HTML
    const productUrlMatch = html.match(/"productUrl"\s*:\s*"([^"]+)"/);
    if (productUrlMatch) {
      console.log('Found product URL from search JSON:', productUrlMatch[1]);
    }

    // Try regex matching standard product card structures in Kaspi search
    const hrefs = [];
    const hrefRe = /href=["'](\/shop\/p\/[^"']+)["']/g;
    let m;
    while ((m = hrefRe.exec(html))) {
      hrefs.push(m[1]);
    }
    console.log(`\nFound ${hrefs.length} product links:`);
    console.log(Array.from(new Set(hrefs)).slice(0, 5));

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();

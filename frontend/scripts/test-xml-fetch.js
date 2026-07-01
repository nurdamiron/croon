const fs = require('fs');

async function main() {
  const merchantId = '8719005';
  const url = `https://kaspi.kz/yml/offer-view/merchant/${merchantId}`;
  
  console.log(`Fetching public XML feed from: ${url}`);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*',
        'Referer': 'https://kaspi.kz/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    console.log(`Status: ${res.status}`);
    if (!res.ok) {
      console.log('Failed to fetch XML feed');
      return;
    }

    const text = await res.text();
    fs.writeFileSync('merchant-feed.xml', text);
    console.log('Saved XML feed to merchant-feed.xml');
    console.log('Length:', text.length);

    // Print first 1000 characters
    console.log('\nSample Content (first 1000 chars):');
    console.log(text.slice(0, 1000));

    // Try to parse some URLs or model names
    const urls = [];
    const urlRe = /<url>([\s\S]*?)<\/url>/g;
    let m;
    while ((m = urlRe.exec(text))) {
      urls.push(m[1].trim());
    }
    console.log(`\nFound ${urls.length} URLs in the XML.`);
    if (urls.length > 0) {
      console.log('Example URLs:');
      console.log(urls.slice(0, 5));
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();

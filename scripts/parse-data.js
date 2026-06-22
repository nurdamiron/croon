const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const iconv = require('iconv-lite');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

async function parseXML() {
  console.log('Parsing XML...');
  const xmlContent = fs.readFileSync(path.join(ROOT, '4234813.xml'), 'utf-8');
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xmlContent);

  const shop = result.yml_catalog.shop;

  // --- Categories ---
  const rawCategories = Array.isArray(shop.categories.category)
    ? shop.categories.category
    : [shop.categories.category];

  const categories = rawCategories.map(cat => ({
    id: cat.$.id,
    parentId: cat.$.parentId || null,
    name: cat._,
  }));

  console.log(`  Categories from XML: ${categories.length}`);

  // --- Products ---
  const rawOffers = Array.isArray(shop.offers.offer)
    ? shop.offers.offer
    : [shop.offers.offer];

  // Group by group_id to merge variants
  const groupMap = new Map();

  for (const offer of rawOffers) {
    const groupId = offer.$.group_id || offer.$.id;
    const available = offer.$.available === 'true';

    // Collect pictures
    let pictures = [];
    if (offer.picture) {
      pictures = Array.isArray(offer.picture) ? offer.picture : [offer.picture];
    }

    // Extract slug from URL
    let slug = '';
    if (offer.url) {
      const urlMatch = offer.url.match(/\/product\/([^?]+)/);
      if (urlMatch) slug = urlMatch[1];
    }

    // Extract collection slug from URL
    let collectionSlug = '';
    if (offer.url) {
      const colMatch = offer.url.match(/\/collection\/([^/]+)/);
      if (colMatch) collectionSlug = colMatch[1];
    }

    const variant = {
      variantId: offer.$.id,
      price: parseFloat(offer.price) || 0,
      oldPrice: offer.oldprice ? parseFloat(offer.oldprice) : null,
      available,
    };

    if (groupMap.has(groupId)) {
      const existing = groupMap.get(groupId);
      existing.variants.push(variant);
      // Merge pictures (avoid duplicates)
      for (const pic of pictures) {
        if (!existing.pictures.includes(pic)) {
          existing.pictures.push(pic);
        }
      }
      // Use available = true if any variant is available
      if (available) existing.available = true;
    } else {
      groupMap.set(groupId, {
        groupId,
        name: offer.name || '',
        slug,
        collectionSlug,
        description: offer.description || '',
        categoryId: offer.categoryId || '',
        pictures,
        available,
        disabled: offer.disabled === 'true',
        weight: offer.weight ? parseFloat(offer.weight) : null,
        variants: [variant],
      });
    }
  }

  const products = Array.from(groupMap.values()).filter(p => !p.disabled);

  // Calculate main price (min price among variants)
  for (const product of products) {
    const prices = product.variants.map(v => v.price).filter(p => p > 0);
    product.price = prices.length > 0 ? Math.min(...prices) : 0;

    const oldPrices = product.variants.map(v => v.oldPrice).filter(p => p !== null && p > 0);
    product.oldPrice = oldPrices.length > 0 ? Math.max(...oldPrices) : null;

    product.inStock = product.variants.some(v => v.available);
  }

  console.log(`  Products from XML: ${products.length} (from ${rawOffers.length} offers/variants)`);

  return { categories, products };
}

function parseCollectionsCSV() {
  console.log('Parsing collections CSV...');
  const raw = fs.readFileSync(path.join(ROOT, 'collections-05.03.2026.csv'));

  // Detect encoding - likely UTF-16 LE (BOM: FF FE)
  let content;
  if (raw[0] === 0xFF && raw[1] === 0xFE) {
    content = iconv.decode(raw, 'utf-16le');
  } else if (raw[0] === 0xFE && raw[1] === 0xFF) {
    content = iconv.decode(raw, 'utf-16be');
  } else {
    content = raw.toString('utf-8');
  }

  const lines = content.split('\n').filter(l => l.trim());
  const header = lines[0].split('\t');
  console.log(`  Collections CSV headers: ${header.join(', ')}`);

  const collections = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 5) continue;

    collections.push({
      id: cols[0].trim(),
      name: cols[1].trim(),
      url: cols[3].trim(),
      slug: cols[4].trim(),
      parentId: cols[5] ? cols[5].trim() : null,
      isHidden: cols[6] ? cols[6].trim() === 'true' : false,
      sortOrder: parseInt(cols[7]) || 0,
      description: cols[10] ? cols[10].trim() : '',
      seoDescription: cols[11] ? cols[11].trim() : '',
      imageUrl: cols[15] ? cols[15].trim() : '',
      productCount: parseInt(cols[16]) || 0,
    });
  }

  console.log(`  Collections from CSV: ${collections.length}`);
  return collections;
}

function parseProductsCSV() {
  console.log('Parsing products/prices CSV...');
  const raw = fs.readFileSync(path.join(ROOT, 'shop_products_prices_and_stocks-05.03.2026.csv'));

  let content;
  if (raw[0] === 0xFF && raw[1] === 0xFE) {
    content = iconv.decode(raw, 'utf-16le');
  } else if (raw[0] === 0xFE && raw[1] === 0xFF) {
    content = iconv.decode(raw, 'utf-16be');
  } else {
    content = raw.toString('utf-8');
  }

  const lines = content.split('\n').filter(l => l.trim());
  const header = lines[0].split('\t');
  console.log(`  Products CSV headers: ${header.join(', ')}`);

  const priceData = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 5) continue;

    priceData.push({
      variantId: cols[0].trim(),
      name: cols[1].trim(),
      sku: cols[2].trim(),
      price: parseFloat(cols[3].replace(',', '.')) || 0,
      oldPrice: cols[4] ? parseFloat(cols[4].replace(/"/g, '').replace(',', '.')) || null : null,
      costPrice: cols[5] ? parseFloat(cols[5].replace(/"/g, '').replace(',', '.')) || null : null,
      stock: parseInt(cols[cols.length - 1]) || 0,
    });
  }

  console.log(`  Price records from CSV: ${priceData.length}`);
  return priceData;
}

async function main() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

  // 1. Parse XML (main source)
  const { categories: xmlCategories, products } = await parseXML();

  // 2. Parse collections CSV (for slugs and hierarchy)
  const collections = parseCollectionsCSV();

  // 3. Parse products CSV (for stock info)
  const priceData = parseProductsCSV();

  // --- Merge stock data into products ---
  const priceMap = new Map();
  for (const pd of priceData) {
    priceMap.set(pd.variantId, pd);
  }

  for (const product of products) {
    for (const variant of product.variants) {
      const pd = priceMap.get(variant.variantId);
      if (pd) {
        variant.stock = pd.stock;
        variant.sku = pd.sku;
        if (!variant.price && pd.price) variant.price = pd.price;
      }
    }
    // Recalculate stock
    product.totalStock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
  }

  // --- Merge category data ---
  // Build category map from XML (has parentId) and CSV (has slug, URL)
  const collectionMap = new Map();
  for (const col of collections) {
    collectionMap.set(col.id, col);
  }

  const finalCategories = xmlCategories.map(cat => {
    const csvData = collectionMap.get(cat.id);
    return {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      slug: csvData ? csvData.slug : '',
      url: csvData ? csvData.url : '',
      imageUrl: csvData ? csvData.imageUrl : '',
      description: csvData ? csvData.description : '',
      isHidden: csvData ? csvData.isHidden : false,
      productCount: csvData ? csvData.productCount : 0,
    };
  });

  // Add slug to products using category slug mapping
  const catSlugMap = new Map();
  for (const cat of finalCategories) {
    catSlugMap.set(cat.id, cat.slug);
  }

  // --- Collect all image URLs ---
  const allImageUrls = new Set();
  for (const product of products) {
    for (const pic of product.pictures) {
      allImageUrls.add(pic);
    }
  }
  for (const cat of finalCategories) {
    if (cat.imageUrl) allImageUrls.add(cat.imageUrl);
  }

  // --- Stats ---
  console.log('\n=== SUMMARY ===');
  console.log(`Categories: ${finalCategories.length}`);
  console.log(`Products: ${products.length}`);
  console.log(`Product variants: ${products.reduce((s, p) => s + p.variants.length, 0)}`);
  console.log(`Products with description: ${products.filter(p => p.description && p.description.trim()).length}`);
  console.log(`Products without description: ${products.filter(p => !p.description || !p.description.trim()).length}`);
  console.log(`Total images: ${allImageUrls.size}`);
  console.log(`Products in stock: ${products.filter(p => p.inStock).length}`);
  console.log(`Products out of stock: ${products.filter(p => !p.inStock).length}`);

  // --- Save ---
  fs.writeFileSync(path.join(DATA, 'categories.json'), JSON.stringify(finalCategories, null, 2));
  fs.writeFileSync(path.join(DATA, 'products.json'), JSON.stringify(products, null, 2));
  fs.writeFileSync(path.join(DATA, 'price-data.json'), JSON.stringify(priceData, null, 2));
  fs.writeFileSync(path.join(DATA, 'image-urls.json'), JSON.stringify([...allImageUrls], null, 2));

  console.log('\nFiles saved to data/:');
  console.log('  - categories.json');
  console.log('  - products.json');
  console.log('  - price-data.json');
  console.log('  - image-urls.json');
}

main().catch(console.error);

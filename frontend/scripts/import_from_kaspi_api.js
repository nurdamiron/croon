const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const token = '9PrOJrej45GK2VgRCTBpUEsf2f7LGezCwq5KwZkhxYc=';
const baseUrl = 'https://kaspi.kz/shop/api/v2';

const slug = (s) => s.toLowerCase()
  .replace(/[^a-z0-9а-яё]+/gi, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

async function main() {
  console.log('=== Cleaning database of old Alash electronic products... ===');
  
  // Clean order items, offers, catalog entries, products, categories
  await prisma.kaspiOrderItem.deleteMany({});
  await prisma.kaspiOffer.deleteMany({});
  await prisma.kaspiCatalogEntry.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.productChangeLog.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.orderViewedProduct.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  
  console.log('Database wiped clean.');

  // Create root catalog category
  const rootId = 'root-catalog-id';
  await prisma.category.create({
    data: {
      id: rootId,
      name: 'Каталог',
      slug: 'catalog',
      isHidden: true
    }
  });
  console.log('Root category created.');

  const now = Date.now();
  const MS_14_DAYS = 14 * 24 * 60 * 60 * 1000;
  
  // Fetch last 28 days of orders (2 chunks of 14 days)
  const chunks = [];
  for (let j = 0; j < 2; j++) {
    const toMs = now - j * MS_14_DAYS;
    const fromMs = toMs - MS_14_DAYS;
    chunks.push({ fromMs, toMs });
  }

  const processedOrders = new Set();
  const productsSet = new Set();
  const categoriesSet = new Set();

  console.log('\n=== Querying Kaspi Orders to discover real products (Incremental mode)... ===');

  for (const chunk of chunks) {
    const fromDate = new Date(chunk.fromMs).toISOString();
    const toDate = new Date(chunk.toMs).toISOString();
    console.log(`Fetching orders from ${fromDate} to ${toDate}...`);
    
    const states = ['ARCHIVE', 'DELIVERY', 'KASPI_DELIVERY', 'PICKUP', 'SIGN_REQUIRED', 'NEW'];
    
    for (const state of states) {
      let page = 0;
      for (;;) {
        const url = `${baseUrl}/orders?page[number]=${page}&page[size]=100&filter[orders][state]=${state}&filter[orders][creationDate][$ge]=${chunk.fromMs}&filter[orders][creationDate][$le]=${chunk.toMs}`;
        
        try {
          const res = await fetch(url, {
            headers: {
              'Content-Type': 'application/vnd.api+json',
              'Accept': 'application/vnd.api+json',
              'X-Auth-Token': token
            }
          });
          
          if (!res.ok) {
            console.log(`  State ${state} page ${page} returned status ${res.status}. Breaking.`);
            break;
          }
          
          const data = await res.json();
          const orders = data.data || [];
          if (orders.length === 0) break;
          
          console.log(`  State ${state} (Page ${page}): ${orders.length} orders found`);
          
          for (const order of orders) {
            if (processedOrders.has(order.id)) {
              continue;
            }
            processedOrders.add(order.id);

            const entriesUrl = `${baseUrl}/orders/${order.id}/entries`;
            const entriesRes = await fetch(entriesUrl, {
              headers: {
                'Content-Type': 'application/vnd.api+json',
                'Accept': 'application/vnd.api+json',
                'X-Auth-Token': token
              }
            });
            
            if (entriesRes.ok) {
              const entriesData = await entriesRes.json();
              for (const entry of entriesData.data || []) {
                const offer = entry.attributes?.offer;
                const category = entry.attributes?.category;
                
                if (offer && offer.code && offer.name) {
                  const sku = String(offer.code).trim();
                  
                  // 1. Process category if not done yet
                  let catId = null;
                  if (category && category.code && category.title) {
                    const catCode = String(category.code).trim();
                    const catTitle = String(category.title).trim();
                    catId = `cat_${slug(catCode)}`;
                    
                    if (!categoriesSet.has(catCode)) {
                      const catSlug = slug(catTitle);
                      await prisma.category.upsert({
                        where: { slug: catSlug },
                        update: { name: catTitle, parentId: rootId },
                        create: {
                          id: catId,
                          name: catTitle,
                          slug: catSlug,
                          parentId: rootId
                        }
                      });
                      categoriesSet.add(catCode);
                      console.log(`    Category created/updated on-the-fly: ${catTitle}`);
                    }
                  }
                  
                  // 2. Process product if not done yet
                  if (!productsSet.has(sku)) {
                    const price = entry.attributes?.basePrice || 0;
                    const prodId = `prod_${slug(offer.name)}_${sku}`;
                    const prodSlug = `${slug(offer.name)}-${sku}`;

                    await prisma.product.upsert({
                      where: { slug: prodSlug },
                      update: { price: price, inStock: true },
                      create: {
                        id: prodId,
                        name: offer.name,
                        slug: prodSlug,
                        price: price,
                        sku: sku,
                        categoryId: catId,
                        totalStock: 50,
                        inStock: true
                      }
                    });
                    
                    await prisma.kaspiCatalogEntry.upsert({
                      where: { kaspiSku: sku },
                      update: { priceTenge: Math.round(price), available: true },
                      create: {
                        kaspiSku: sku,
                        kaspiProductId: sku.split('_')[0],
                        name: offer.name,
                        priceTenge: Math.round(price),
                        available: true,
                        cityId: '750000000',
                        storeId: '30233309_PP1'
                      }
                    });

                    await prisma.kaspiOffer.upsert({
                      where: { kaspiSku: sku },
                      update: { priceTenge: Math.round(price), active: true },
                      create: {
                        kaspiSku: sku,
                        productId: prodId,
                        priceTenge: Math.round(price),
                        active: true,
                        kaspiName: offer.name,
                        cityId: '750000000',
                        kaspiStoreId: '30233309_PP1'
                      }
                    });
                    
                    productsSet.add(sku);
                    console.log(`    Product created & linked on-the-fly: ${offer.name} (${sku})`);
                  }
                }
              }
            }
            await new Promise(r => setTimeout(r, 60)); // Rate limit safety
          }
          
          if (orders.length < 100) break;
          page++;
        } catch (e) {
          console.error('Error fetching order page:', e);
          break;
        }
      }
    }
  }

  // Create general settings if missing
  for (const [key, value] of Object.entries({
    kaspi_feed_enabled: 'true',
    kaspi_site_blocks_enabled: 'true',
    kaspi_dumping_enabled: 'false',
    kaspi_commission_mult: '1.41',
  })) {
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }

  console.log(`\n=== SUCCESS: ${productsSet.size} unique products and ${categoriesSet.size} categories imported and linked! ===`);
}

main().catch(console.error).finally(() => prisma.$disconnect());

const token = '9PrOJrej45GK2VgRCTBpUEsf2f7LGezCwq5KwZkhxYc=';
const baseUrl = 'https://kaspi.kz/shop/api/v2';

async function fetchAllSoldProducts() {
  console.log('Querying Kaspi Orders for the last 90 days to discover real products...');
  
  const now = Date.now();
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
  
  // We will page through orders
  let page = 0;
  const productsMap = new Map();
  
  for (let i = 0; i < 15; i++) { // Fetch up to 15 pages (1500 orders max)
    const url = `${baseUrl}/orders?page[number]=${page}&page[size]=100&filter[orders][state]=ARCHIVE&filter[orders][creationDate][$ge]=${ninetyDaysAgo}&filter[orders][creationDate][$le]=${now}`;
    
    try {
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/vnd.api+json',
          'Accept': 'application/vnd.api+json',
          'X-Auth-Token': token
        }
      });
      
      if (!res.ok) {
        console.log(`Failed to fetch page ${page}: ${res.status}`);
        break;
      }
      
      const data = await res.json();
      const orders = data.data || [];
      if (orders.length === 0) break;
      
      console.log(`Page ${page}: fetched ${orders.length} orders`);
      
      for (const order of orders) {
        // Fetch order entries
        const orderId = order.id;
        const entriesUrl = `${baseUrl}/orders/${orderId}/entries`;
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
            if (offer && offer.code) {
              productsMap.set(offer.code, {
                code: offer.code,
                name: offer.name,
                categoryCode: category?.code,
                categoryTitle: category?.title,
                price: entry.attributes?.basePrice
              });
            }
          }
        }
        // Throttling to prevent rate limits
        await new Promise(r => setTimeout(r, 100));
      }
      
      page++;
      if (orders.length < 100) break;
    } catch (e) {
      console.error('Error fetching orders:', e);
      break;
    }
  }
  
  console.log(`\nDiscovered ${productsMap.size} unique products sold in the last 90 days:`);
  const products = Array.from(productsMap.values());
  console.log(JSON.stringify(products.slice(0, 30), null, 2));
  if (products.length > 30) {
    console.log(`... and ${products.length - 30} more products.`);
  }
}

fetchAllSoldProducts();

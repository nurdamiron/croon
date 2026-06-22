/*
 * Полный дамп того, что доступно через Kaspi API с нашим токеном.
 * Запуск: node scripts/kaspi-dump.js
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

const TOKEN = process.env.KASPI_API_TOKEN;
if (!TOKEN) { console.error('KASPI_API_TOKEN отсутствует'); process.exit(1); }

const BASE = 'https://kaspi.kz/shop/api';
const H_VND = { 'X-Auth-Token': TOKEN, 'Content-Type': 'application/vnd.api+json', 'Accept': 'application/vnd.api+json' };
const H_JSON = { 'X-Auth-Token': TOKEN, 'Accept': 'application/json' };

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(__dirname, '..', '..', 'exports', `kaspi-dump-${stamp}`);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'orders-entries'), { recursive: true });

const summary = [];
function log(msg) { console.log(msg); summary.push(msg); }

async function get(url, headers) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function dumpOrdersFor(state, includeUser) {
  const sinceMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const all = [];
  let page = 0;
  while (true) {
    const params = new URLSearchParams({
      'page[number]': String(page),
      'page[size]': '100',
      'filter[orders][creationDate][$ge]': String(sinceMs),
    });
    if (state) params.append('filter[orders][state]', state);
    if (includeUser) params.append('include[orders]', 'user');
    const r = await get(`${BASE}/v2/orders?${params}`, H_VND);
    if (!r.ok) {
      log(`  state=${state || 'ANY'} page=${page}: HTTP ${r.status}`);
      break;
    }
    const data = r.body.data || [];
    all.push(...data);
    const total = r.body.meta?.totalCount;
    log(`  state=${state || 'ANY'} page=${page}: +${data.length} (total ${total})`);
    if (data.length < 100) break;
    page++;
    if (page > 20) break;
  }
  return all;
}

(async () => {
  log(`Дамп Kaspi API — ${new Date().toISOString()}`);
  log(`Папка: ${OUT}\n`);

  // 1. Категории
  log('[1/5] Категории каталога');
  const cats = await get(`${BASE}/products/classification/categories`, H_JSON);
  if (cats.ok) {
    fs.writeFileSync(path.join(OUT, 'categories.json'), JSON.stringify(cats.body, null, 2));
    log(`  ✓ ${Array.isArray(cats.body) ? cats.body.length : '?'} категорий`);
  } else log(`  ✗ HTTP ${cats.status}`);

  // 2. Города
  log('\n[2/5] Города (для пунктов выдачи)');
  const cities = await get(`${BASE}/v2/cities`, H_VND);
  if (cities.ok) {
    fs.writeFileSync(path.join(OUT, 'cities.json'), JSON.stringify(cities.body, null, 2));
    log(`  ✓ ${cities.body.data?.length || 0} городов`);
  } else log(`  ✗ HTTP ${cities.status}`);

  // 3. Заказы по всем состояниям
  log('\n[3/5] Заказы (14 дней, все состояния)');
  const states = ['NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE'];
  const allOrders = {};
  for (const s of states) {
    log(` ${s}:`);
    allOrders[s] = await dumpOrdersFor(s, true);
  }
  // также без фильтра по состоянию
  log(' БЕЗ ФИЛЬТРА:');
  allOrders.ANY = await dumpOrdersFor(null, true);

  fs.writeFileSync(path.join(OUT, 'orders.json'), JSON.stringify(allOrders, null, 2));
  const totalOrders = Object.values(allOrders).reduce((s, a) => s + a.length, 0);
  log(`  ИТОГО: ${totalOrders} (записей по всем фильтрам, могут дублироваться)`);

  // 4. Позиции заказов — берём уникальные ID
  log('\n[4/5] Позиции заказов (entries)');
  const seen = new Set();
  for (const s of Object.keys(allOrders)) {
    for (const o of allOrders[s]) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      const r = await get(`${BASE}/v2/orders/${o.id}/entries?include[order.entries]=product,merchantProduct`, H_VND);
      if (r.ok) {
        fs.writeFileSync(path.join(OUT, 'orders-entries', `${o.id}.json`), JSON.stringify(r.body, null, 2));
        log(`  ✓ ${o.id} (${s}): ${r.body.data?.length || 0} позиций`);
      } else {
        log(`  ✗ ${o.id} (${s}): HTTP ${r.status}`);
      }
      if (seen.size >= 100) break;
    }
    if (seen.size >= 100) break;
  }
  if (!seen.size) log('  (заказов не было — пропуск)');

  // 5. Прочие зонды
  log('\n[5/5] Прочие эндпоинты');
  const extras = [
    ['orderentry_example',    `${BASE}/v2/orderentries/0/product`,           H_VND],
    ['attributes_arduino',    `${BASE}/products/classification/attributes?c=${encodeURIComponent('Master - Microcontrollers')}`, H_JSON],
    ['offer_get_example',     `${BASE}/offer/00000?cityId=750000000`,        H_JSON],
    ['returns',               `${BASE}/v2/returns?page[number]=0&page[size]=10&filter[returns][creationDate][$ge]=${Date.now() - 14*86400000}`, H_VND],
    ['reviews',               `${BASE}/v2/reviews?page[number]=0&page[size]=10`,                 H_VND],
  ];
  const probes = [];
  for (const [name, url, h] of extras) {
    const r = await get(url, h);
    probes.push({ name, url, status: r.status, ok: r.ok, body: r.body });
    log(`  ${r.ok ? '✓' : '✗'} ${name}: HTTP ${r.status}`);
  }
  fs.writeFileSync(path.join(OUT, 'extra-probes.json'), JSON.stringify(probes, null, 2));

  fs.writeFileSync(path.join(OUT, 'summary.txt'), summary.join('\n'));
  log(`\nГотово. ${OUT}`);
})();

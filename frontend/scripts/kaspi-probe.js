/*
 * Kaspi API probe — проверяет токен и формат ответа на разных эндпоинтах.
 * Запуск: node scripts/kaspi-probe.js
 * Результаты сохраняются в exports/kaspi-probe-<timestamp>.json
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

const TOKEN = process.env.KASPI_API_TOKEN;
if (!TOKEN) {
  console.error('KASPI_API_TOKEN не найден в .env');
  process.exit(1);
}

const BASE = 'https://kaspi.kz/shop/api';
const HEADERS = {
  'X-Auth-Token': TOKEN,
  'Content-Type': 'application/vnd.api+json',
  'Accept': 'application/vnd.api+json',
};

// Заказы за последние 90 дней — Kaspi требует creationDate[$ge] (unix-ms)
const SINCE_MS = Date.now() - 90 * 24 * 60 * 60 * 1000;

const PROBES = [
  {
    name: 'orders_14d',
    url: `${BASE}/v2/orders?page[number]=0&page[size]=5&filter[orders][creationDate][$ge]=${SINCE_MS}`,
  },
  {
    name: 'orders_14d_new',
    url: `${BASE}/v2/orders?page[number]=0&page[size]=5&filter[orders][creationDate][$ge]=${SINCE_MS}&filter[orders][state]=NEW`,
  },
  {
    name: 'categories_json',
    url: `${BASE}/products/classification/categories`,
    accept: 'application/json',
  },
  {
    name: 'merchant_info',
    url: `${BASE}/v2/merchants`,
  },
];

async function probe(p) {
  const t0 = Date.now();
  try {
    const headers = { ...HEADERS };
    if (p.accept) headers.Accept = p.accept;
    const res = await fetch(p.url, { headers });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    return {
      name: p.name,
      url: p.url,
      status: res.status,
      ms: Date.now() - t0,
      ok: res.ok,
      bodySample: parsed
        ? JSON.stringify(parsed).slice(0, 800)
        : text.slice(0, 400),
      contentType: res.headers.get('content-type'),
    };
  } catch (e) {
    return { name: p.name, url: p.url, error: String(e), ms: Date.now() - t0 };
  }
}

(async () => {
  const results = [];
  for (const p of PROBES) {
    process.stdout.write(`→ ${p.name}... `);
    const r = await probe(p);
    console.log(`${r.status || 'ERR'} (${r.ms}ms)`);
    results.push(r);
  }

  const outDir = path.join(__dirname, '..', '..', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `kaspi-probe-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nСохранено: ${outPath}`);

  console.log('\nСводка:');
  for (const r of results) {
    console.log(
      `  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(15)} ${r.status || 'ERR'}  ${
        r.contentType || ''
      }`
    );
  }
})();

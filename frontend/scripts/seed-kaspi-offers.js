/*
 * Seed KaspiOffer из mapping CSV + ACTIVE.xml от Kaspi.
 *
 * Источники:
 *   scripts/data/kaspi-mapping.csv          — kaspi_sku,kaspi_name,alash_id,note
 *   scripts/data/kaspi-active-original.xml  — оригинальный фид Kaspi (цены, brand, storeId)
 *
 * Запуск:
 *   node scripts/seed-kaspi-offers.js
 *   node scripts/seed-kaspi-offers.js --dry
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DRY = process.argv.includes('--dry');
const DATA_DIR = path.join(__dirname, 'data');
const CSV_PATH = path.join(DATA_DIR, 'kaspi-mapping.csv');
const XML_PATH = path.join(DATA_DIR, 'kaspi-active-original.xml');

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = [];
    let cur = '';
    let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const [kaspi_sku, kaspi_name, alash_id, note] = cells;
    rows.push({
      kaspi_sku: (kaspi_sku || '').trim(),
      kaspi_name: (kaspi_name || '').trim(),
      alash_id: (alash_id || '').trim(),
      note: (note || '').trim(),
    });
  }
  return rows;
}

function parseOffersXml(xml) {
  const offers = {};
  const offerRe = /<offer\s+sku="([^"]+)">([\s\S]*?)<\/offer>/g;
  let m;
  while ((m = offerRe.exec(xml))) {
    const sku = m[1];
    const body = m[2];
    const brand = (body.match(/<brand>([^<]*)<\/brand>/) || [, ''])[1];
    const model = (body.match(/<model>([^<]*)<\/model>/) || [, ''])[1];
    const storeId = (body.match(/storeId="([^"]+)"/) || [, '30233309_PP1'])[1];
    const cityPriceMatch = body.match(/<cityprice\s+cityId="([^"]+)">\s*([0-9.]+)\s*<\/cityprice>/);
    const cityId = cityPriceMatch ? cityPriceMatch[1] : '750000000';
    const price = cityPriceMatch ? Math.round(parseFloat(cityPriceMatch[2])) : 0;
    offers[sku] = { brand, model, storeId, cityId, price };
  }
  return offers;
}

async function main() {
  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const xml = fs.readFileSync(XML_PATH, 'utf8');
  const rows = parseCsv(csv);
  const offersInXml = parseOffersXml(xml);

  const ops = [];
  for (const row of rows) {
    if (!row.alash_id) {
      console.log(`SKIP ${row.kaspi_sku} — alash_id пустой (${row.kaspi_name})`);
      continue;
    }
    const xmlOffer = offersInXml[row.kaspi_sku];
    if (!xmlOffer) {
      console.log(`SKIP ${row.kaspi_sku} — нет в ACTIVE.xml`);
      continue;
    }
    const product = await prisma.product.findUnique({
      where: { id: row.alash_id },
      select: { id: true, name: true },
    });
    if (!product) {
      console.log(`SKIP ${row.kaspi_sku} — Product ${row.alash_id} не найден в БД`);
      continue;
    }
    ops.push({
      kaspiSku: row.kaspi_sku,
      productId: product.id,
      kaspiStoreId: xmlOffer.storeId,
      priceTenge: xmlOffer.price,
      cityId: xmlOffer.cityId,
      kaspiName: row.kaspi_name || xmlOffer.model,
      kaspiBrand: xmlOffer.brand,
      active: true,
    });
  }

  console.log(`\n${ops.length} офферов к upsert${DRY ? ' (DRY)' : ''}:`);
  for (const o of ops) {
    console.log(`  ${o.kaspiSku.padEnd(22)} → ${o.productId.padEnd(6)} ${o.priceTenge} тг`);
  }

  if (DRY) {
    await prisma.$disconnect();
    return;
  }

  for (const o of ops) {
    await prisma.kaspiOffer.upsert({
      where: { kaspiSku: o.kaspiSku },
      update: {
        productId: o.productId,
        kaspiStoreId: o.kaspiStoreId,
        priceTenge: o.priceTenge,
        cityId: o.cityId,
        kaspiName: o.kaspiName,
        kaspiBrand: o.kaspiBrand,
        active: o.active,
      },
      create: o,
    });
  }

  const total = await prisma.kaspiOffer.count();
  console.log(`\nГотово. Всего KaspiOffer в БД: ${total}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

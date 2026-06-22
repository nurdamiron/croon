const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const file = process.argv[2] || path.join(__dirname, 'data/kaspi-archive.xml');
const xml = fs.readFileSync(file, 'utf8');

const offers = [];
const offerRe = /<offer\s+sku="([^"]+)">([\s\S]*?)<\/offer>/g;
let m;
while ((m = offerRe.exec(xml))) {
  const sku = m[1];
  const body = m[2];
  const brand = (body.match(/<brand>([^<]*)<\/brand>/) || [, ''])[1].trim() || null;
  const name = (body.match(/<model>([^<]*)<\/model>/) || [, ''])[1].trim();
  const avail = body.match(/<availability\s+available="([^"]+)"\s+storeId="([^"]+)"/);
  const available = avail ? avail[1] === 'yes' : false;
  const storeId = avail ? avail[2] : '30233309_PP1';
  const cp = body.match(/<cityprice\s+cityId="([^"]+)">\s*([0-9.]+)\s*<\/cityprice>/);
  const cityId = cp ? cp[1] : '750000000';
  const price = cp ? Math.round(parseFloat(cp[2])) : 0;
  if (sku && name && price > 0) offers.push({ kaspiSku: sku, name, brand, priceTenge: price, cityId, storeId, available });
}
(async () => {
  console.log(`Parsed ${offers.length} offers from ${file}`);
  for (const o of offers) {
    await prisma.kaspiCatalogEntry.upsert({
      where: { kaspiSku: o.kaspiSku },
      update: { name: o.name, brand: o.brand, priceTenge: o.priceTenge, cityId: o.cityId, storeId: o.storeId, available: o.available },
      create: o,
    });
  }
  const total = await prisma.kaspiCatalogEntry.count();
  console.log(`KaspiCatalogEntry в БД: ${total}`);
  await prisma.$disconnect();
})();

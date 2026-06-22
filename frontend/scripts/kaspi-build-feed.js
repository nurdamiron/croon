/*
 * Перебилд Kaspi XML price-feed:
 *   - читает существующий ACTIVE.xml из Downloads (или путь через --input)
 *   - оставляет те же offers (SKU, model, brand, availabilities)
 *   - подменяет цену на указанную (по умолчанию 1000)
 *
 * Запуск:
 *   node scripts/kaspi-build-feed.js
 *   node scripts/kaspi-build-feed.js --price=1000
 *   node scripts/kaspi-build-feed.js --input=/path/to/ACTIVE.xml --output=/path/to/out.xml
 */

const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const PRICE = parseInt(args.price ?? '1000', 10);
const INPUT = args.input || '/Users/beksultanajten/Downloads/ACTIVE.xml';
const OUTPUT = args.output || path.join(__dirname, '..', '..', 'exports', 'kaspi-feed.xml');

if (!Number.isFinite(PRICE) || PRICE < 1) {
  console.error('Некорректная цена:', args.price);
  process.exit(1);
}

const xml = fs.readFileSync(INPUT, 'utf8');

// Подмена всех значений <cityprice cityId="...">XXX</cityprice> на PRICE.
// Тег <price>X</price> вне cityprices тоже поменяем (на случай если у каких-то офферов оно есть).
let count = 0;
let out = xml.replace(
  /(<cityprice\b[^>]*>)([^<]*)(<\/cityprice>)/g,
  (_, open, _val, close) => { count++; return `${open}${PRICE}${close}`; }
);
out = out.replace(
  /(<price>)([^<]*)(<\/price>)/g,
  (_, open, _val, close) => { count++; return `${open}${PRICE}${close}`; }
);

// Обновляем атрибут date у kaspi_catalog на текущее время (формат "YYYY-MM-DD HH:MM")
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const dateAttr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
out = out.replace(/date="[^"]*"/, `date="${dateAttr}"`);

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, out);

const offerCount = (out.match(/<offer\s/g) || []).length;

console.log(`✓ Записано: ${OUTPUT}`);
console.log(`  offers:       ${offerCount}`);
console.log(`  цен заменено: ${count}`);
console.log(`  новая цена:   ${PRICE}`);
console.log(`  date:         ${dateAttr}`);
console.log(`  размер:       ${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB`);

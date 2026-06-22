/**
 * sync-stock.js
 *
 * Обновляет цены, себестоимость и остатки из CSV-выгрузки InSales.
 * НЕ трогает: name, slug, description, images, categories, weight, meta.
 *
 * Использование:
 *   node scripts/sync-stock.js [путь/к/файлу.csv]
 *   node scripts/sync-stock.js --dry-run
 *
 * CSV колонки (UTF-16 LE, разделитель TAB):
 *   1: ID варианта   2: Название   3: Артикул
 *   4: Цена продажи  5: Старая цена
 *   6: Начало периода себестоимости  7: Себестоимость
 *   8: Тип цен Озон  9: Остаток
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_ARG = process.argv.find(a => a.endsWith('.csv'));
const CSV_PATH = CSV_ARG
  ? path.resolve(CSV_ARG)
  : path.resolve(__dirname, '..', '..', 'shop_products_prices_and_stocks-04.04.2026.csv');

// ── helpers ──────────────────────────────────────────────────────────────────

function parseNum(str) {
  if (!str || str === '""' || str.trim() === '') return null;
  const n = parseFloat(str.replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parseDate(str) {
  if (!str || str === '""' || str.trim() === '') return null;
  const parts = str.trim().split('.');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const dt = new Date(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`);
  return isNaN(dt.getTime()) ? null : dt;
}

function parseCsv(filePath) {
  const buffer = fs.readFileSync(filePath);
  const content = buffer.toString('utf16le');
  const lines = content.split(/\r?\n/).filter(l => l.trim());

  return lines.slice(1).map(line => {
    const cols = line.split('\t').map(c => c.trim());
    return {
      variantId:    cols[0] || null,
      sku:          cols[2] || null,
      price:        parseNum(cols[3]),
      oldPrice:     parseNum(cols[4]),
      costPriceDate: parseDate(cols[5]),
      costPrice:    parseNum(cols[6]),
      stock:        parseInt(cols[8]) || 0,
    };
  }).filter(r => r.variantId && r.variantId !== 'ID варианта');
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Файл не найден: ${CSV_PATH}`);
    process.exit(1);
  }

  if (DRY_RUN) console.log('🔍 DRY RUN — изменения в БД не вносятся\n');

  const rows = parseCsv(CSV_PATH);
  console.log(`📦 CSV: ${rows.length} строк`);

  let variantUpdated = 0;
  let variantSkipped = 0;
  let notFound = 0;

  // productId → массив строк CSV (для расчёта totalStock и выбора цен)
  const productMap = new Map();

  for (const row of rows) {
    let variantDbId = null;
    let productId   = null;

    // 1. Поиск по ID варианта
    const byId = await prisma.productVariant.findUnique({
      where:  { id: row.variantId },
      select: { id: true, productId: true },
    });

    if (byId) {
      variantDbId = byId.id;
      productId   = byId.productId;
    } else if (row.sku) {
      // 2. Fallback: поиск по артикулу
      const bySku = await prisma.productVariant.findFirst({
        where:  { sku: row.sku },
        select: { id: true, productId: true },
      });
      if (bySku) {
        variantDbId = bySku.id;
        productId   = bySku.productId;
      }
    }

    if (!variantDbId) {
      notFound++;
      continue;
    }

    // Обновляем вариант
    if (!DRY_RUN) {
      await prisma.productVariant.update({
        where: { id: variantDbId },
        data: {
          price:     row.price    ?? undefined,
          oldPrice:  row.oldPrice,
          stock:     row.stock,
          available: row.stock > 0,
        },
      });
    }
    variantUpdated++;

    if (!productMap.has(productId)) productMap.set(productId, []);
    productMap.get(productId).push(row);
  }

  console.log(`✅ Вариантов: обновлено ${variantUpdated}, не найдено ${notFound}`);

  // ── обновляем Product ────────────────────────────────────────────────────
  let productUpdated = 0;

  for (const [productId, csvRows] of productMap) {
    // Свежие данные вариантов из БД
    const variants = await prisma.productVariant.findMany({
      where:  { productId },
      select: { price: true, oldPrice: true, stock: true },
    });

    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
    const inStock    = totalStock > 0;

    // Цена/скидка: берём самый дешёвый из доступных, иначе самый дешёвый вообще
    const active   = variants.filter(v => v.stock > 0);
    const pool     = active.length > 0 ? active : variants;
    const cheapest = pool.reduce((a, b) => (a.price <= b.price ? a : b), pool[0]);

    // costPrice / costPriceDate: берём из CSV-строки с минимальной ценой
    const primary = [...csvRows].sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0];

    if (!DRY_RUN) {
      await prisma.product.update({
        where: { id: productId },
        data: {
          price:         cheapest?.price    ?? undefined,
          oldPrice:      cheapest?.oldPrice ?? null,
          totalStock,
          inStock,
          costPrice:     primary.costPrice,
          costPriceDate: primary.costPriceDate,
        },
      });
    } else {
      // DRY RUN: просто показываем что изменилось бы
      const current = await prisma.product.findUnique({
        where:  { id: productId },
        select: { name: true, price: true, totalStock: true, inStock: true },
      });
      if (current) {
        const changed = [];
        if (cheapest?.price !== undefined && cheapest.price !== current.price)
          changed.push(`цена ${current.price} → ${cheapest.price}`);
        if (totalStock !== current.totalStock)
          changed.push(`склад ${current.totalStock} → ${totalStock}`);
        if (inStock !== current.inStock)
          changed.push(`inStock ${current.inStock} → ${inStock}`);
        if (changed.length)
          console.log(`  [${productId.slice(0,8)}] ${current.name.slice(0, 50)}: ${changed.join(', ')}`);
      }
    }

    productUpdated++;
  }

  console.log(`✅ Товаров: обновлено ${productUpdated}`);
  if (DRY_RUN) console.log('\n🔍 DRY RUN завершён — в БД ничего не изменено');
  else         console.log('\n🎉 Синхронизация завершена!');
}

main()
  .catch(err => { console.error('❌', err); process.exit(1); })
  .finally(() => prisma.$disconnect());

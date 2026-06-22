/**
 * Экспорт товаров в наличии → Excel + Kaspi Shopping XML (с картинками).
 *
 * Флаги:
 *   --test            Только 10 товаров (для проверки)
 *   --all             Все товары (включая inStock=false)
 *   --merchant-id=ID  Merchant ID из Kaspi-кабинета (для XML-фида)
 *   --store-id=ID     Store ID из Kaspi-кабинета (для XML-фида)
 *   --city=CODE       Код города (по умолчанию 750000000 — Алматы)
 *
 * Запуск (тест 10 штук):
 *   node scripts/export-for-kaspi.js --test --merchant-id=30383258 --store-id=1
 *
 * Выходные файлы в exports/:
 *   kaspi-products-YYYY-MM-DD.xlsx
 *   kaspi-feed-YYYY-MM-DD.xml
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

let XLSX;
try {
  XLSX = require('xlsx');
} catch {
  console.error('Установи xlsx: npm install xlsx');
  process.exit(1);
}

const prisma = new PrismaClient();

// ─── Аргументы ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isTest  = args.includes('--test');
const isAll   = args.includes('--all');
const merchantId = (args.find(a => a.startsWith('--merchant-id=')) || '').split('=')[1] || 'YOUR_MERCHANT_ID';
const storeId    = (args.find(a => a.startsWith('--store-id='))    || '').split('=')[1] || '1';
const cityCode   = (args.find(a => a.startsWith('--city='))        || '').split('=')[1] || '750000000';
const limit = isTest ? 10 : undefined;

function resolveStock(p, v) {
  if (v && v.stock > 0) return v.stock;
  if (p.totalStock > 0) return p.totalStock;
  return 999; // 0 = неограниченный в alash → 999 для Kaspi
}

// ─── XML-генератор ────────────────────────────────────────────────────────
function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildXmlFeed(rows, date) {
  const offers = rows.map(r => {
    const pictures = (r.images || [])
      .slice(0, 5) // Kaspi принимает до 5 картинок на оффер
      .map(url => `      <picture>${escapeXml(url)}</picture>`)
      .join('\n');

    return `    <offer sku="${escapeXml(r.sku)}">
      <model>${escapeXml(r.name)}</model>${r.category ? `\n      <brand>${escapeXml(r.category)}</brand>` : ''}
${pictures}
      <availabilities>
        <availability available="yes" storeId="${escapeXml(storeId)}" stockCount="${r.stock}.0"/>
      </availabilities>
      <cityprices>
        <cityprice cityId="${cityCode}">${r.price}</cityprice>
      </cityprices>
    </offer>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kaspi_catalog xmlns="kaspiShopping" date="${date}">
  <company>${escapeXml(merchantId)}</company>
  <merchantid>${escapeXml(merchantId)}</merchantid>
  <offers>
${offers}
  </offers>
</kaspi_catalog>`;
}

// ─── Основной скрипт ──────────────────────────────────────────────────────
async function main() {
  const where = isAll ? {} : { inStock: true };
  const modeLabel = isTest ? `ТЕСТ (${limit} товаров)` : isAll ? 'все товары' : 'товары в наличии';
  console.log(`Режим: ${modeLabel}`);
  console.log(`MerchantId: ${merchantId} | StoreId: ${storeId} | City: ${cityCode}`);

  const products = await prisma.product.findMany({
    where,
    take: limit,
    include: {
      category: { select: { name: true } },
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { url: true, alt: true }
      },
      variants: {
        where: { available: true },
        orderBy: { id: 'asc' },
        select: { sku: true, price: true, stock: true, title: true }
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  console.log(`Загружено: ${products.length} товаров`);

  const rows = [];

  for (const p of products) {
    const categoryName = p.category?.name ?? '';
    const imageUrls = p.images.map(i => i.url);
    const availableVariants = p.variants.filter(v => v.sku);

    if (availableVariants.length > 0) {
      for (const v of availableVariants) {
        rows.push({
          sku: v.sku,
          name: v.title ? `${p.name} ${v.title}`.trim() : p.name,
          category: categoryName,
          price: v.price ?? p.price,
          cost: p.costPrice ?? null,
          stock: resolveStock(p, v),
          images: imageUrls
        });
      }
    } else {
      rows.push({
        sku: p.id,
        name: p.name,
        category: categoryName,
        price: p.price,
        cost: p.costPrice ?? null,
        stock: resolveStock(p, null),
        images: imageUrls
      });
    }
  }

  console.log(`Строк для экспорта: ${rows.length}`);

  // ── Папка exports ──
  const exportsDir = path.join(__dirname, '..', 'exports');
  if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir);

  const date = new Date().toISOString().slice(0, 10);
  const suffix = isTest ? '-test' : '';

  // ── Excel ──
  const excelRows = rows.map(r => ({
    'артикул': r.sku,
    'название': r.name,
    'категория': r.category,
    'цена': r.price,
    'себестоимость': r.cost,
    'остаток': r.stock,
    'фото 1': r.images[0] ?? '',
    'фото 2': r.images[1] ?? '',
    'фото 3': r.images[2] ?? '',
  }));

  const ws = XLSX.utils.json_to_sheet(excelRows);
  // Широкие колонки для URL
  ws['!cols'] = [
    { wch: 20 }, { wch: 50 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 8 },
    { wch: 70 }, { wch: 70 }, { wch: 70 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  const xlsxPath = path.join(exportsDir, `kaspi-products${suffix}-${date}.xlsx`);
  XLSX.writeFile(wb, xlsxPath);
  console.log(`\nExcel → ${xlsxPath}`);

  // ── Kaspi XML feed ──
  const xmlContent = buildXmlFeed(rows, date);
  const xmlPath = path.join(exportsDir, `kaspi-feed${suffix}-${date}.xml`);
  fs.writeFileSync(xmlPath, xmlContent, 'utf8');
  console.log(`XML   → ${xmlPath}`);

  // ── Итог ──
  const withPhotos = rows.filter(r => r.images.length > 0).length;
  const noPhotos   = rows.length - withPhotos;

  console.log(`\n─── Итог ───────────────────────`);
  console.log(`Товаров: ${rows.length}`);
  console.log(`С фото:  ${withPhotos}`);
  console.log(`Без фото: ${noPhotos}`);

  if (merchantId === 'YOUR_MERCHANT_ID') {
    console.log(`\n⚠️  Укажи --merchant-id=ВАШ_ID из Kaspi-кабинета для корректного XML`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

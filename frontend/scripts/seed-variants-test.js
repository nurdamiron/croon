/**
 * Seed script for local variant testing
 * Run: DATABASE_URL="postgresql://nurdauletakhmatov@localhost:5432/alash_variants_test" node scripts/seed-variants-test.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Seeding local test database...')

  // ── 1. Admin user ──────────────────────────────────────────────────────────
  const bcrypt = require('bcryptjs')
  await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      id: 'u_admin',
      email: 'admin@test.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      name: 'Admin',
      role: 'ADMIN',
    },
  })
  console.log('✓ Admin user: admin@test.com / admin123')

  // ── 2. Category tree ───────────────────────────────────────────────────────
  await prisma.category.upsert({
    where: { slug: 'katalog' },
    update: {},
    create: { id: 'cat_root', name: 'Каталог', slug: 'katalog', isHidden: true },
  })
  await prisma.category.upsert({
    where: { slug: 'komponenty' },
    update: {},
    create: { id: 'cat_comp', name: 'Компоненты', slug: 'komponenty', parentId: 'cat_root' },
  })
  await prisma.category.upsert({
    where: { slug: 'krepezh' },
    update: {},
    create: { id: 'cat_fix', name: 'Крепёж', slug: 'krepezh', parentId: 'cat_root' },
  })
  await prisma.category.upsert({
    where: { slug: 'moduli' },
    update: {},
    create: { id: 'cat_mod', name: 'Модули', slug: 'moduli', parentId: 'cat_root' },
  })
  console.log('✓ Categories created')

  // ── 3. Helper ──────────────────────────────────────────────────────────────
  async function upsertProduct({ id, name, slug, price, categoryId, variantAttributes, variants, images = [] }) {
    const totalStock = variants.reduce((s, v) => s + v.stock, 0)
    const inStock = variants.some(v => v.available && v.stock > 0)

    await prisma.product.upsert({
      where: { slug },
      update: { variantAttributes },
      create: {
        id,
        name,
        slug,
        price,
        categoryId,
        inStock,
        totalStock,
        variantAttributes,
        images: images.length ? {
          create: images.map((url, i) => ({ url, alt: name, sortOrder: i })),
        } : undefined,
      },
    })

    // Replace variants
    await prisma.productVariant.deleteMany({ where: { productId: id } })
    await prisma.productVariant.createMany({
      data: variants.map((v, i) => ({
        id: `${id}_v${i}`,
        productId: id,
        sku: v.sku,
        price: v.price ?? price,
        oldPrice: v.oldPrice ?? null,
        stock: v.stock,
        available: v.available ?? v.stock > 0,
        title: v.title ?? null,
        attributes: v.attributes ?? {},
      })),
    })

    console.log(`  ✓ ${name} (${variants.length} вариантов)`)
  }

  // ── 4. Резисторы (1 ось: Номинал) ─────────────────────────────────────────
  await upsertProduct({
    id: 'p_resistor',
    name: 'Постоянный резистор 1/4 Вт (набор 10 штук)',
    slug: 'postoyannyy-rezistor-1-4-vt',
    price: 200,
    categoryId: 'cat_comp',
    variantAttributes: ['Номинал'],
    variants: [
      { sku: '1238',   title: '1 МОм',   attributes: { 'Номинал': '1 МОм' },   stock: 37,  price: 200 },
      { sku: '1238.1', title: '100 КОм', attributes: { 'Номинал': '100 КОм' }, stock: 10,  price: 200 },
      { sku: '1238.2', title: '10 Ом',   attributes: { 'Номинал': '10 Ом' },   stock: 0,   price: 200, available: false },
      { sku: '1238.3', title: '330 Ом',  attributes: { 'Номинал': '330 Ом' },  stock: 34,  price: 200 },
      { sku: '1238.4', title: '100 Ом',  attributes: { 'Номинал': '100 Ом' },  stock: 23,  price: 200 },
      { sku: '1238.5', title: '1 КОм',   attributes: { 'Номинал': '1 КОм' },   stock: 442, price: 200 },
      { sku: '1238.6', title: '2 КОм',   attributes: { 'Номинал': '2 КОм' },   stock: 43,  price: 200 },
      { sku: '1238.7', title: '5 КОм',   attributes: { 'Номинал': '5 КОм' },   stock: 5,   price: 200 },
      { sku: '1238.8', title: '10 КОм',  attributes: { 'Номинал': '10 КОм' },  stock: 205, price: 200 },
      { sku: '1238.9', title: '220 Ом',  attributes: { 'Номинал': '220 Ом' },  stock: 955, price: 200 },
    ],
  })

  // ── 5. Стойки М3 (2 оси: Тип разъёма × Длина) ────────────────────────────
  await upsertProduct({
    id: 'p_stojka_m3',
    name: 'Латунные стойки для плат М3',
    slug: 'latunnye-stojki-dlya-plat-m3',
    price: 50,
    categoryId: 'cat_fix',
    variantAttributes: ['Тип разъёма', 'Длина'],
    variants: [
      // мама-мама
      { sku: '100', title: 'мама-мама / 4мм',  attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '4мм' },  stock: 80,  price: 40 },
      { sku: '101', title: 'мама-мама / 5мм',  attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '5мм' },  stock: 90,  price: 40 },
      { sku: '102', title: 'мама-мама / 6мм',  attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '6мм' },  stock: 120, price: 50 },
      { sku: '103', title: 'мама-мама / 8мм',  attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '8мм' },  stock: 65,  price: 50 },
      { sku: '104', title: 'мама-мама / 10мм', attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '10мм' }, stock: 55,  price: 55 },
      { sku: '105', title: 'мама-мама / 12мм', attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '12мм' }, stock: 40,  price: 60 },
      { sku: '106', title: 'мама-мама / 15мм', attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '15мм' }, stock: 38,  price: 65 },
      { sku: '107', title: 'мама-мама / 20мм', attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '20мм' }, stock: 30,  price: 70 },
      { sku: '108', title: 'мама-мама / 25мм', attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '25мм' }, stock: 25,  price: 80 },
      { sku: '109', title: 'мама-мама / 30мм', attributes: { 'Тип разъёма': 'мама-мама', 'Длина': '30мм' }, stock: 0,   price: 90,  available: false },
      // папа-мама
      { sku: '110', title: 'папа-мама / 4мм+6',  attributes: { 'Тип разъёма': 'папа-мама', 'Длина': '4мм' },  stock: 45,  price: 55 },
      { sku: '111', title: 'папа-мама / 6мм+6',  attributes: { 'Тип разъёма': 'папа-мама', 'Длина': '6мм' },  stock: 60,  price: 55 },
      { sku: '112', title: 'папа-мама / 8мм+6',  attributes: { 'Тип разъёма': 'папа-мама', 'Длина': '8мм' },  stock: 35,  price: 60 },
      { sku: '113', title: 'папа-мама / 10мм+6', attributes: { 'Тип разъёма': 'папа-мама', 'Длина': '10мм' }, stock: 0,   price: 65,  available: false },
      { sku: '114', title: 'папа-мама / 12мм+6', attributes: { 'Тип разъёма': 'папа-мама', 'Длина': '12мм' }, stock: 28,  price: 70 },
      { sku: '115', title: 'папа-мама / 15мм+6', attributes: { 'Тип разъёма': 'папа-мама', 'Длина': '15мм' }, stock: 22,  price: 75 },
      { sku: '116', title: 'папа-мама / 20мм+6', attributes: { 'Тип разъёма': 'папа-мама', 'Длина': '20мм' }, stock: 18,  price: 85 },
    ],
  })

  // ── 6. Реле (1 ось: Напряжение, разные цены) ──────────────────────────────
  await upsertProduct({
    id: 'p_relay',
    name: '1-канальный модуль реле',
    slug: '1-kanalnyy-modul-rele',
    price: 380,
    categoryId: 'cat_mod',
    variantAttributes: ['Напряжение'],
    variants: [
      { sku: '212',  title: '5 В',  attributes: { 'Напряжение': '5 В' },  stock: 71,  price: 380,  oldPrice: 500 },
      { sku: '855',  title: '3.3 В',attributes: { 'Напряжение': '3.3 В' },stock: 0,   price: 1100, available: false },
      { sku: '1279', title: '24 В', attributes: { 'Напряжение': '24 В' }, stock: 2,   price: 500 },
      { sku: '1420', title: '12 В', attributes: { 'Напряжение': '12 В' }, stock: 123, price: 650 },
    ],
  })

  // ── 7. Обычный товар БЕЗ вариантов (для сравнения) ────────────────────────
  await upsertProduct({
    id: 'p_arduino',
    name: 'Arduino Uno R3',
    slug: 'arduino-uno-r3',
    price: 4500,
    categoryId: 'cat_mod',
    variantAttributes: [],
    variants: [
      { sku: '123', title: null, attributes: {}, stock: 15, price: 4500, oldPrice: 5500 },
    ],
  })

  console.log('\n✅ Done! Go to http://localhost:3000')
  console.log('   Test pages:')
  console.log('   - /product/postoyannyy-rezistor-1-4-vt  (1 ось: Номинал)')
  console.log('   - /product/latunnye-stojki-dlya-plat-m3 (2 оси: Тип × Длина)')
  console.log('   - /product/1-kanalnyy-modul-rele        (1 ось: Напряжение, разные цены)')
  console.log('   - /product/arduino-uno-r3               (без вариантов — старое поведение)')
  console.log('   Admin: /admin  →  admin@test.com / admin123')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

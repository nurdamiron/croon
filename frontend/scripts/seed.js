const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

const prisma = new PrismaClient()
const cuid = () => crypto.randomUUID()
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80)

async function main() {
  console.log('=== Croon Seed ===\n')

  // 1. Admin
  console.log('1. Admin...')
  const hash = await bcrypt.hash('admin123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@croon.kz' },
    update: { role: 'ADMIN', passwordHash: hash },
    create: { email: 'admin@croon.kz', passwordHash: hash, name: 'Администратор', role: 'ADMIN' },
  })
  console.log('   admin@croon.kz / admin123')

  // 2. Root category
  console.log('2. Categories...')
  let root = await prisma.category.findUnique({ where: { slug: 'catalog' } })
  if (!root) {
    root = await prisma.category.create({ data: { id: cuid(), name: 'Каталог', slug: 'catalog', isHidden: true } })
  }

  const cats = [
    { name: 'Arduino', slug: 'arduino' },
    { name: 'ESP32 / ESP8266', slug: 'esp32-esp8266' },
    { name: 'Raspberry Pi', slug: 'raspberry-pi' },
    { name: 'Датчики', slug: 'datchiki' },
    { name: 'Модули', slug: 'moduli' },
    { name: 'Компоненты', slug: 'komponenty' },
    { name: 'Инструмент', slug: 'instrument' },
    { name: 'Кабели и разъёмы', slug: 'kabeli-i-razemy' },
  ]

  const catMap = {}
  for (const c of cats) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, parentId: root.id },
      create: { id: cuid(), name: c.name, slug: c.slug, parentId: root.id },
    })
    catMap[c.slug] = row.id
  }
  console.log(`   ${cats.length} categories`)

  // 3. Products (createMany)
  console.log('3. Products...')
  const existing = await prisma.product.count()
  if (existing > 0) {
    console.log(`   ${existing} already exist, skipping`)
  } else {
    const products = [
      { name: 'Arduino UNO R3', cat: 'arduino', price: 4500, oldPrice: 5500, stock: 25, cost: 2800, sku: 'A001' },
      { name: 'Arduino NANO V3', cat: 'arduino', price: 2800, stock: 40, cost: 1500, sku: 'A002' },
      { name: 'Arduino MEGA 2560', cat: 'arduino', price: 8500, stock: 10, cost: 5500, sku: 'A003' },
      { name: 'ESP32 DevKit V1', cat: 'esp32-esp8266', price: 3200, oldPrice: 4000, stock: 30, cost: 1800, sku: 'E001' },
      { name: 'ESP8266 NodeMCU V3', cat: 'esp32-esp8266', price: 2200, stock: 50, cost: 1100, sku: 'E002' },
      { name: 'ESP32-CAM', cat: 'esp32-esp8266', price: 4800, stock: 15, cost: 2500, sku: 'E003' },
      { name: 'Raspberry Pi 5 (4GB)', cat: 'raspberry-pi', price: 38000, stock: 8, cost: 28000, sku: 'R001' },
      { name: 'Raspberry Pi Pico W', cat: 'raspberry-pi', price: 3500, stock: 20, cost: 1800, sku: 'R002' },
      { name: 'DHT22 датчик температуры', cat: 'datchiki', price: 1200, stock: 100, cost: 400, sku: 'D001' },
      { name: 'HC-SR04 ультразвуковой дальномер', cat: 'datchiki', price: 800, stock: 60, cost: 250, sku: 'D002' },
      { name: 'MQ-2 датчик газа', cat: 'datchiki', price: 900, stock: 45, cost: 300, sku: 'D003' },
      { name: 'BMP280 датчик давления', cat: 'datchiki', price: 1500, stock: 35, cost: 600, sku: 'D004' },
      { name: 'Модуль реле 1 канал 5В', cat: 'moduli', price: 600, stock: 80, cost: 180, sku: 'M001' },
      { name: 'Драйвер мотора L298N', cat: 'moduli', price: 1800, stock: 25, cost: 700, sku: 'M002' },
      { name: 'Модуль RTC DS3231', cat: 'moduli', price: 1400, stock: 30, cost: 500, sku: 'M003' },
      { name: 'Набор резисторов 1/4W (600шт)', cat: 'komponenty', price: 2500, stock: 15, cost: 800, sku: 'K001' },
      { name: 'Набор конденсаторов (300шт)', cat: 'komponenty', price: 2000, stock: 12, cost: 600, sku: 'K002' },
      { name: 'Светодиоды 5мм (100шт)', cat: 'komponenty', price: 800, stock: 50, cost: 200, sku: 'K003' },
      { name: 'Паяльник 60W с регулировкой', cat: 'instrument', price: 8500, stock: 12, cost: 4500, sku: 'I001' },
      { name: 'Мультиметр DT830B', cat: 'instrument', price: 3200, stock: 18, cost: 1500, sku: 'I002' },
      { name: 'USB кабель Type-C 1м', cat: 'kabeli-i-razemy', price: 500, stock: 200, cost: 150, sku: 'C001' },
      { name: 'Джамперы M-M 20см (40шт)', cat: 'kabeli-i-razemy', price: 600, stock: 100, cost: 180, sku: 'C002' },
      { name: 'Макетная плата 830 точек', cat: 'kabeli-i-razemy', price: 1200, stock: 40, cost: 400, sku: 'C003' },
    ]

    const rows = products.map(p => ({
      id: cuid(), name: p.name, slug: slug(p.name), price: p.price,
      oldPrice: p.oldPrice || null, inStock: p.stock > 0, totalStock: p.stock,
      costPrice: p.cost || null, sku: p.sku || null, categoryId: catMap[p.cat],
    }))
    await prisma.product.createMany({ data: rows })
    console.log(`   ${rows.length} products`)
  }

  // 4. AppSettings
  console.log('4. Settings...')
  for (const [key, value] of Object.entries({
    kaspi_feed_enabled: 'true', kaspi_site_blocks_enabled: 'true',
    kaspi_dumping_enabled: 'false', kaspi_commission_mult: '1.41',
  })) {
    await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  }
  console.log('   4 settings')

  console.log('\n=== Done! ===')
  console.log('Login: admin@croon.kz / admin123')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

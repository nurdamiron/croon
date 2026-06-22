/**
 * Generate AI descriptions for products with thin descriptions (<300 chars plain text).
 * Uses Perplexity API (OpenAI-compatible).
 *
 * Run:     PPLX_KEY=pplx-... node scripts/generate-descriptions.js
 * Dry run: PPLX_KEY=pplx-... node scripts/generate-descriptions.js --dry
 * Limit:   PPLX_KEY=pplx-... node scripts/generate-descriptions.js --limit=10
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const DRY = process.argv.includes('--dry')
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='))
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity
const PPLX_KEY = process.env.PPLX_KEY
const THIN_THRESHOLD = 300 // chars of plain text
const DELAY_MS = 1200 // rate limit buffer between calls

if (!PPLX_KEY) {
  console.error('Error: PPLX_KEY env var required')
  console.error('Usage: PPLX_KEY=pplx-... node scripts/generate-descriptions.js')
  process.exit(1)
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function generateDescription(product) {
  const currentDesc = stripHtml(product.description)
  const sku = product.sku || product.id
  const category = product.category?.name || 'Электроника'

  const prompt = `Ты — копирайтер интернет-магазина электроники ИП КРУН (Казахстан). Напиши описание товара на русском языке.

Товар: ${product.name}
Категория: ${category}
Артикул: ${sku}
Цена: ${product.price} ₸
Текущее описание: ${currentDesc || '(нет)'}

Требования:
- Ровно 3-4 предложения, итого 250-400 символов
- Что это за товар и для чего используется
- Кому подойдёт (Arduino/Raspberry Pi проекты, DIY, профи)
- Если в названии есть технические характеристики — упомяни
- Без клише ("высокое качество", "отличный выбор", "широкий выбор")
- Только текст, без HTML-тегов, без кавычек вокруг всего текста`

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PPLX_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API ${response.status}: ${err.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || null
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  const allProducts = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      slug: true,
      sku: true,
      category: { select: { name: true } },
    },
  })

  const allThin = allProducts.filter(p => stripHtml(p.description).length < THIN_THRESHOLD)
  const thinProducts = allThin.slice(0, LIMIT)

  console.log(`Total products: ${allProducts.length}`)
  console.log(`Thin (<${THIN_THRESHOLD} chars): ${allThin.length}`)
  if (LIMIT < Infinity) console.log(`Processing first ${thinProducts.length} of ${allThin.length} (--limit=${LIMIT})`)
  if (DRY) console.log('DRY RUN — no DB writes\n')

  let updated = 0
  let failed = 0

  for (let i = 0; i < thinProducts.length; i++) {
    const product = thinProducts[i]
    const currentPlain = stripHtml(product.description)
    const prefix = `[${i + 1}/${thinProducts.length}]`

    try {
      const newDesc = await generateDescription(product)

      if (!newDesc || newDesc.length < 100) {
        console.log(`${prefix} SKIP (too short response): ${product.name.slice(0, 50)}`)
        failed++
        continue
      }

      console.log(`${prefix} ${product.name.slice(0, 55)}`)
      console.log(`  before (${currentPlain.length}): ${currentPlain.slice(0, 80)}…`)
      console.log(`  after  (${newDesc.length}): ${newDesc.slice(0, 80)}…`)

      if (!DRY) {
        await prisma.product.update({
          where: { id: product.id },
          data: { description: newDesc },
        })
        updated++
      }

      if (i < thinProducts.length - 1) await sleep(DELAY_MS)
    } catch (err) {
      console.error(`${prefix} ERROR: ${product.name.slice(0, 50)} — ${err.message}`)
      failed++
      await sleep(DELAY_MS * 2)
    }
  }

  console.log(`\nDone. Updated: ${updated}, Failed/skipped: ${failed}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

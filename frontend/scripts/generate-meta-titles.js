/**
 * Auto-generate metaTitle for products with names longer than 60 chars.
 * Splits at first comma/bracket/dash and truncates to 57 chars.
 *
 * Run: node scripts/generate-meta-titles.js
 * Dry run: node scripts/generate-meta-titles.js --dry
 */

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const DRY = process.argv.includes('--dry')
const MAX = 60

function smartShorten(name) {
  if (name.length <= MAX) return null // No metaTitle needed

  // Try splitting at first comma — often "Product name, spec, spec2..."
  const commaIdx = name.indexOf(',')
  if (commaIdx > 20 && commaIdx <= MAX - 1) {
    return name.slice(0, commaIdx).trim()
  }

  // Try splitting at first opening bracket
  const bracketIdx = name.search(/[([{]/)
  if (bracketIdx > 20 && bracketIdx <= MAX - 1) {
    return name.slice(0, bracketIdx).trim()
  }

  // Try splitting at last space before MAX
  const sub = name.slice(0, MAX - 1)
  const lastSpace = sub.lastIndexOf(' ')
  if (lastSpace > 20) {
    return sub.slice(0, lastSpace).trim() + '…'
  }

  // Hard cut
  return sub.trim() + '…'
}

async function main() {
  const products = await prisma.product.findMany({
    where: { metaTitle: null },
    select: { id: true, name: true },
  })

  const toUpdate = products
    .map(p => ({ id: p.id, name: p.name, metaTitle: smartShorten(p.name) }))
    .filter(p => p.metaTitle !== null)

  console.log(`Found ${products.length} products without metaTitle`)
  console.log(`Will update ${toUpdate.length} products with long names (>${MAX} chars)`)

  if (DRY) {
    console.log('\n--- DRY RUN (first 20) ---')
    toUpdate.slice(0, 20).forEach(p => {
      console.log(`  "${p.name.slice(0, 60)}..." → "${p.metaTitle}"`)
    })
    return
  }

  let updated = 0
  for (const p of toUpdate) {
    await prisma.product.update({
      where: { id: p.id },
      data: { metaTitle: p.metaTitle },
    })
    updated++
    if (updated % 100 === 0) console.log(`  Updated ${updated}/${toUpdate.length}...`)
  }

  console.log(`\nDone! Updated ${updated} products.`)
  console.log('These products now use metaTitle in <title> tag (see generateMetadata in product/[slug]/page.tsx)')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

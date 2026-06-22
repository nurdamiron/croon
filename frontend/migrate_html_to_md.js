/**
 * Migrates product descriptions from HTML to Markdown.
 * Uses turndown to convert HTML → Markdown.
 * Safe to re-run: skips products that are already plain text / Markdown.
 * Run: node migrate_html_to_md.js
 */
const { PrismaClient } = require('@prisma/client')
const TurndownService = require('turndown')
const prisma = new PrismaClient()

const td = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  hr: '---',
})

// Remove empty links but keep their text
td.addRule('emptyLinks', {
  filter: node => node.nodeName === 'A' && !node.getAttribute('href'),
  replacement: content => content,
})

// Convert <br> to newline
td.addRule('lineBreaks', {
  filter: 'br',
  replacement: () => '\n',
})

function isHtml(str) {
  return /<[a-z][\s\S]*>/i.test(str.slice(0, 500))
}

function cleanMd(md) {
  return md
    .replace(/\n{3,}/g, '\n\n')   // max 2 consecutive newlines
    .replace(/^\s+|\s+$/g, '')     // trim
}

async function main() {
  const products = await prisma.product.findMany({
    where: { description: { not: null } },
    select: { id: true, slug: true, description: true },
  })

  console.log(`Total products with descriptions: ${products.length}`)

  let skipped = 0
  let converted = 0
  let errors = 0

  for (const p of products) {
    if (!p.description) continue

    if (!isHtml(p.description)) {
      skipped++
      continue
    }

    try {
      const md = cleanMd(td.turndown(p.description))
      await prisma.product.update({
        where: { id: p.id },
        data: { description: md },
      })
      converted++
      if (converted % 100 === 0) console.log(`  Converted ${converted}...`)
    } catch (e) {
      console.error(`  Error on ${p.slug}: ${e.message}`)
      errors++
    }
  }

  console.log(`\nDone.`)
  console.log(`  Converted: ${converted}`)
  console.log(`  Skipped (already Markdown/text): ${skipped}`)
  console.log(`  Errors: ${errors}`)

  await prisma.$disconnect()
}

main().catch(e => { console.error(e.message); process.exit(1) })

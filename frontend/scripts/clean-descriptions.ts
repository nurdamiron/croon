/**
 * Clean product descriptions: remove all class, data-*, style attributes
 * and unnecessary wrapper divs while preserving semantic HTML structure.
 *
 * Usage: npx tsx scripts/clean-descriptions.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client'
import { sanitizeHtml } from '../src/lib/sanitize'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'img',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'blockquote', 'pre', 'code', 'hr',
  'figure', 'figcaption', 'del', 'ins', 'sub', 'sup',
  // No div/span - they are just wrappers with classes, unwrap them
]

function cleanHtml(html: string): string {
  // Step 1: Remove all data-* attributes before DOMPurify
  let cleaned = html.replace(/\s+data-[\w-]+="[^"]*"/g, '')

  // Step 2: Sanitize with strict whitelist
  cleaned = sanitizeHtml(cleaned)

  // Step 3: Clean up whitespace
  cleaned = cleaned
    .replace(/\n{3,}/g, '\n\n')        // max 2 consecutive newlines
    .replace(/(<br\s*\/?>){3,}/g, '<br><br>') // max 2 consecutive br
    .replace(/^\s+|\s+$/g, '')          // trim
    .replace(/<p>\s*<\/p>/g, '')        // remove empty paragraphs
    .replace(/<p>\s*<br\s*\/?>\s*<\/p>/g, '') // remove paragraphs with only br

  return cleaned
}

async function main() {
  const products = await prisma.product.findMany({
    where: { description: { not: null } },
    select: { id: true, name: true, description: true },
  })

  console.log(`Found ${products.length} products with descriptions`)

  let changed = 0
  let skipped = 0

  for (const product of products) {
    if (!product.description) continue

    const cleaned = cleanHtml(product.description)

    if (cleaned === product.description) {
      skipped++
      continue
    }

    changed++

    if (dryRun) {
      if (changed <= 5) {
        console.log(`\n--- ${product.name} (${product.id}) ---`)
        console.log(`BEFORE (${product.description.length} chars): ${product.description.slice(0, 200)}...`)
        console.log(`AFTER  (${cleaned.length} chars): ${cleaned.slice(0, 200)}...`)
      }
    } else {
      await prisma.product.update({
        where: { id: product.id },
        data: { description: cleaned },
      })
    }
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Done: ${changed} cleaned, ${skipped} unchanged`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

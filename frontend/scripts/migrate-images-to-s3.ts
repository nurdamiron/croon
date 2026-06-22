/**
 * Migrate product images from local files (downloaded from InSales CDN) to S3
 * with SEO-friendly filenames: {product-slug}-{n}.{ext}
 *
 * Example: arduino-uno-r3-1.png, arduino-uno-r3-2.png
 *
 * Usage:
 *   npx tsx scripts/migrate-images-to-s3.ts --dry-run    # preview changes
 *   npx tsx scripts/migrate-images-to-s3.ts              # run migration
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

const BUCKET = 'alashed-media'
const REGION = 'eu-north-1'
const PREFIX = 'products/'
const LOCAL_DIR = path.resolve(__dirname, '../../public/images/products')
const S3_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com`

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

function getExtension(url: string): string {
  const match = url.match(/\.(\w+)$/)
  return match ? match[1].toLowerCase() : 'png'
}

// Extract InSales folder ID and filename from URL
function parseInsalesUrl(url: string): { folder: string; filename: string } | null {
  // https://static.insales-cdn.com/images/products/1/6295/570546327/34.png
  const parts = url.split('/')
  const filename = parts[parts.length - 1]
  const folder = parts[parts.length - 2]
  if (!folder || !filename) return null
  return { folder, filename }
}

async function s3Exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  }
  return map[ext] || 'image/png'
}

async function main() {
  console.log(dryRun ? '=== DRY RUN ===' : '=== MIGRATING IMAGES TO S3 ===')

  // Get all products with their images, ordered
  const products = await prisma.product.findMany({
    select: {
      id: true,
      slug: true,
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, url: true, sortOrder: true },
      },
    },
  })

  let uploaded = 0
  let skipped = 0
  let errors = 0
  let alreadyS3 = 0

  for (const product of products) {
    for (let i = 0; i < product.images.length; i++) {
      const img = product.images[i]

      // Skip already migrated
      if (img.url.includes('amazonaws.com')) {
        alreadyS3++
        continue
      }

      const ext = getExtension(img.url)
      const num = i + 1
      // SEO-friendly key: products/arduino-uno-r3-1.png
      const s3Key = `${PREFIX}${product.slug}-${num}.${ext}`
      const newUrl = `${S3_BASE}/${s3Key}`

      // Find local file
      const parsed = parseInsalesUrl(img.url)
      if (!parsed) {
        console.error(`  Cannot parse URL: ${img.url}`)
        errors++
        continue
      }

      const localPath = path.join(LOCAL_DIR, parsed.folder, parsed.filename)
      if (!fs.existsSync(localPath)) {
        console.error(`  File not found: ${localPath}`)
        errors++
        continue
      }

      if (dryRun) {
        if (uploaded < 10) {
          console.log(`  ${product.slug}: ${parsed.filename} -> ${s3Key}`)
        }
        uploaded++
        continue
      }

      // Upload to S3
      try {
        const buffer = fs.readFileSync(localPath)
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: s3Key,
          Body: buffer,
          ContentType: getMimeType(ext),
          CacheControl: 'public, max-age=31536000, immutable',
        }))

        // Update DB
        await prisma.productImage.update({
          where: { id: img.id },
          data: { url: newUrl },
        })

        uploaded++
        if (uploaded % 100 === 0) {
          console.log(`  Uploaded ${uploaded}...`)
        }
      } catch (err: any) {
        console.error(`  Error uploading ${s3Key}: ${err.message}`)
        errors++
      }
    }
  }

  console.log(`\nDone:`)
  console.log(`  Uploaded: ${uploaded}`)
  console.log(`  Already on S3: ${alreadyS3}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Errors: ${errors}`)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})

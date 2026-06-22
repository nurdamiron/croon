// Миграция внешних картинок из описаний товаров в наш S3.
//
// Сканирует все Product.description, находит ![](http(s)://...) ссылки на сторонние
// домены (всё, что НЕ alashed-media и НЕ относительные/data), скачивает каждый
// файл, кладёт в S3 alashed-media/products/desc/, переписывает URL в описании.
//
// Идемпотентно: уже наши alashed-media ссылки пропускаются.
//
// Запуск (на проде через SSM, в каталоге frontend/):
//   node scripts/migrate-description-images-to-s3.js          # dry-run
//   node scripts/migrate-description-images-to-s3.js --apply  # выполнить

const { PrismaClient } = require('@prisma/client')
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
const crypto = require('crypto')

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const BUCKET = 'alashed-media'
const PREFIX = 'products/desc/'
const REGION = 'eu-north-1'

const s3 = new S3Client({
  region: REGION,
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } }
    : {}),
})

const ALASH_HOST_RE = /(^|\/\/)([\w.-]+\.)?alashed-media\.s3[.-]/
// ![alt](url) и ![alt](url "title") — URL до пробела или ); title опционален
const IMG_MD_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g

function extFromUrl(url) {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').pop() || ''
    const m = last.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/)
    const ext = (m?.[1] || 'jpg').toLowerCase()
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
  } catch {
    return 'jpg'
  }
}

function contentTypeOf(ext) {
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' })[ext] || 'application/octet-stream'
}

// детерминированный ключ S3 для одной и той же внешней ссылки → идемпотентность
function s3KeyForUrl(url) {
  const h = crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
  return `${PREFIX}${h}.${extFromUrl(url)}`
}

async function existsInS3(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return true
  } catch { return false }
}

async function downloadAndUpload(url) {
  const key = s3KeyForUrl(url)
  const newUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`

  // если уже загружали — переиспользуем
  if (await existsInS3(key)) return { newUrl, reused: true }
  if (!APPLY) return { newUrl, reused: false }

  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const ext = extFromUrl(url)
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentTypeOf(ext),
  }))
  return { newUrl, reused: false }
}

async function main() {
  console.log(APPLY ? '=== РЕЖИМ: ВЫПОЛНЕНИЕ (--apply) ===' : '=== РЕЖИМ: DRY-RUN ===')

  const prods = await prisma.product.findMany({
    where: { description: { contains: '![' } },
    select: { id: true, name: true, description: true },
  })

  let totalProds = 0
  let totalLinks = 0
  let totalSkipped = 0
  let totalErrors = 0
  const errors = []
  const cache = new Map() // url → newUrl (для одинаковых ссылок не делаем дважды)

  for (const pr of prods) {
    const desc = pr.description || ''
    const matches = Array.from(desc.matchAll(IMG_MD_RE))
    if (matches.length === 0) continue

    const replacements = []
    for (const m of matches) {
      const url = m[2]
      if (ALASH_HOST_RE.test(url)) { totalSkipped++; continue } // уже наш
      try {
        let newUrl = cache.get(url)
        if (!newUrl) {
          const { newUrl: u } = await downloadAndUpload(url)
          newUrl = u
          cache.set(url, newUrl)
        }
        replacements.push({ old: url, new: newUrl })
        totalLinks++
      } catch (e) {
        totalErrors++
        errors.push({ id: pr.id, url, err: e.message })
      }
    }

    if (replacements.length === 0) continue
    totalProds++
    console.log(`\n[${pr.name.slice(0, 60)}] (${pr.id}) → ${replacements.length} ссылок`)
    for (const r of replacements.slice(0, 3)) {
      console.log(`   ${r.old.slice(0, 80)}`)
      console.log(`     → ${r.new}`)
    }
    if (replacements.length > 3) console.log(`   … ещё ${replacements.length - 3}`)

    if (APPLY) {
      let newDesc = desc
      for (const r of replacements) newDesc = newDesc.split(r.old).join(r.new)
      await prisma.product.update({ where: { id: pr.id }, data: { description: newDesc } })
    }
  }

  console.log(`\n=== ИТОГО ===`)
  console.log(`Товаров затронуто: ${totalProds}`)
  console.log(`Ссылок мигрировано: ${totalLinks}`)
  console.log(`Пропущено (уже наши): ${totalSkipped}`)
  console.log(`Ошибок скачивания: ${totalErrors}`)
  if (errors.length) {
    console.log(`\nПримеры ошибок (до 10):`)
    errors.slice(0, 10).forEach(e => console.log(`  [${e.id}] ${e.url}: ${e.err}`))
  }
  console.log(APPLY ? 'Изменения ПРИМЕНЕНЫ.' : 'Это DRY-RUN. Для выполнения добавьте --apply.')
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })

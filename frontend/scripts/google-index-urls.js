/**
 * Уведомляет Google об обновлении URL через Indexing API (urlNotifications.publish).
 *
 * Требования (см. https://developers.google.com/search/apis/indexing-api/v3/prereqs ):
 *   — В GCP включён API "Indexing API" для проекта ключа
 *   — JSON ключ сервисного аккаунта; email из client_email добавлен как владелец в Search Console
 *   — Квота по умолчанию ~200 URL/сутки (планируйте --max и повторные запуски)
 *
 * Использование:
 *   GOOGLE_INDEXING_KEY_PATH=/path/to/key.json SITE_URL=https://alash-electronics.kz \
 *     node scripts/google-index-urls.js --max=200 --start=0
 *
 *   node scripts/google-index-urls.js --dry-run   # только список URL из sitemap, без API
 *
 * Ключ НЕ коммитить в git.
 */

const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')

function parseArgs() {
  const out = {
    dryRun: false,
    max: 200,
    start: 0,
    delayMs: 500,
    credentials: process.env.GOOGLE_INDEXING_KEY_PATH || null,
  }
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true
    else if (a.startsWith('--max=')) out.max = Math.max(0, parseInt(a.split('=')[1], 10) || 0)
    else if (a.startsWith('--start=')) out.start = Math.max(0, parseInt(a.split('=')[1], 10) || 0)
    else if (a.startsWith('--delay-ms=')) out.delayMs = Math.max(0, parseInt(a.split('=')[1], 10) || 0)
    else if (a.startsWith('--credentials=')) out.credentials = a.split('=').slice(1).join('=')
  }
  return out
}

function siteUrl() {
  const u = process.env.SITE_URL || process.env.NEXTAUTH_URL || 'https://alash-electronics.kz'
  return u.replace(/\/$/, '')
}

async function fetchSitemapUrls(base) {
  const url = `${base}/sitemap.xml`
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Не удалось загрузить sitemap: HTTP ${res.status} — ${url}`)
  }
  const xml = await res.text()
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map(m => m[1].trim())
  const unique = [...new Set(locs)]
  return unique
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const args = parseArgs()
  const base = siteUrl()

  console.log(`Базовый URL сайта: ${base}`)
  console.log('Загрузка URL из sitemap.xml …')
  const all = await fetchSitemapUrls(base)
  console.log(`Всего уникальных URL в sitemap: ${all.length}`)

  const slice = all.slice(args.start, args.start + args.max)
  console.log(
    `Будет обработано: ${slice.length} (start=${args.start}, max=${args.max})` +
      (args.dryRun ? ' [DRY-RUN]' : '')
  )

  if (slice.length === 0) {
    console.log('Нечего отправлять.')
    return
  }

  if (args.dryRun) {
    slice.forEach((u, i) => console.log(`${i + 1}. ${u}`))
    return
  }

  if (!args.credentials || !fs.existsSync(path.resolve(args.credentials))) {
    console.error(
      'Укажите путь к JSON ключу: GOOGLE_INDEXING_KEY_PATH=... или --credentials=/abs/path.json'
    )
    process.exit(1)
  }

  const keyPath = path.resolve(args.credentials)
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'))

  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/indexing'],
  })

  const indexing = google.indexing({ version: 'v3', auth })

  await auth.authorize()
  console.log(`Сервисный аккаунт: ${key.client_email}`)
  console.log('Отправка URL_UPDATED …\n')

  let ok = 0
  let fail = 0

  for (let i = 0; i < slice.length; i++) {
    const url = slice[i]
    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url,
          type: 'URL_UPDATED',
        },
      })
      ok++
      const short = url.length > 80 ? `${url.slice(0, 80)}…` : url
      process.stdout.write(`\rOK ${ok}/${slice.length} ${short}`)
    } catch (e) {
      fail++
      const msg = e.message || String(e)
      console.error(`\nОшибка [${url}]: ${msg}`)
      if (e.response?.data) {
        console.error(JSON.stringify(e.response.data, null, 2))
      }
    }
    if (i < slice.length - 1 && args.delayMs > 0) {
      await sleep(args.delayMs)
    }
  }

  console.log(`\n\nГотово: успешно ${ok}, ошибок ${fail}`)
  if (all.length > args.start + slice.length) {
    console.log(
      `Следующая порция: --start=${args.start + args.max} --max=${args.max}`
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

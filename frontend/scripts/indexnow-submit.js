/**
 * IndexNow submission: submits all URLs from sitemap to Bing, Yandex, IndexNow API.
 * Unlike Google Indexing API, IndexNow accepts up to 10000 URLs per request — no daily quota.
 *
 * Usage:
 *   node scripts/indexnow-submit.js             # submit all sitemap URLs
 *   node scripts/indexnow-submit.js --dry-run   # show URLs, don't submit
 *   SITE_URL=https://alash-electronics.kz node scripts/indexnow-submit.js
 *
 * Cron (weekly, e.g. Sunday 10:00):
 *   0 10 * * 0 . /home/ubuntu/.profile; cd /home/ubuntu/alashed-shop/frontend && \
 *     SITE_URL=https://alash-electronics.kz /usr/bin/node scripts/indexnow-submit.js \
 *     >> /home/ubuntu/logs/indexnow.log 2>&1
 */

const https = require('https')
const http = require('http')

const KEY = '4bb2949a7737b479b3c93be2474b352c'
const SITE_URL = (process.env.SITE_URL || 'https://alash-electronics.kz').replace(/\/$/, '')
const DRY_RUN = process.argv.includes('--dry-run')

const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
]

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib.get(url, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function postJson(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload)
    const url = new URL(endpoint)
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function fetchSitemapUrls() {
  const sitemapUrl = `${SITE_URL}/sitemap.xml`
  console.log(`Fetching sitemap: ${sitemapUrl}`)
  const xml = await fetchUrl(sitemapUrl)

  // Extract sub-sitemaps
  const subSitemaps = [...xml.matchAll(/<loc>(https?:\/\/[^<]+\.xml)<\/loc>/g)].map((m) => m[1])

  let urls = []

  if (subSitemaps.length > 0) {
    for (const sub of subSitemaps) {
      const subXml = await fetchUrl(sub)
      const found = [...subXml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map((m) => m[1])
      urls.push(...found.filter((u) => !u.endsWith('.xml')))
    }
  } else {
    urls = [...xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)]
      .map((m) => m[1])
      .filter((u) => !u.endsWith('.xml'))
  }

  return [...new Set(urls)]
}

async function main() {
  const urls = await fetchSitemapUrls()
  console.log(`Found ${urls.length} URLs in sitemap`)

  if (DRY_RUN) {
    console.log('Dry run — first 10 URLs:')
    urls.slice(0, 10).forEach((u) => console.log(' ', u))
    return
  }

  const payload = {
    host: new URL(SITE_URL).hostname,
    key: KEY,
    keyLocation: `${SITE_URL}/${KEY}.txt`,
    urlList: urls,
  }

  for (const endpoint of ENDPOINTS) {
    try {
      const result = await postJson(endpoint, payload)
      console.log(`${endpoint} → HTTP ${result.status}`)
    } catch (err) {
      console.error(`${endpoint} → ERROR: ${err.message}`)
    }
  }

  console.log(`Done: submitted ${urls.length} URLs to ${ENDPOINTS.length} engines`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

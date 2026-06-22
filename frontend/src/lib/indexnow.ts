const INDEXNOW_KEY = '4bb2949a7737b479b3c93be2474b352c'
const SITE_URL = (process.env.SITE_URL || 'https://croon.kz').replace(/\/$/, '')

const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
]

export async function pingIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return

  const payload = {
    host: new URL(SITE_URL).hostname,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  }

  await Promise.allSettled(
    ENDPOINTS.map((endpoint) =>
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      })
    )
  )
}

export function productUrl(slug: string): string {
  return `${SITE_URL}/product/${slug}`
}

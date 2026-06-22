import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const INDEXNOW_KEY = '4bb2949a7737b479b3c93be2474b352c'
const SITE_URL = process.env.SITE_URL || 'https://alash-electronics.kz'

const INDEXNOW_ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
]

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { urls } = body as { urls: string[] }

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return NextResponse.json({ error: 'urls array required' }, { status: 400 })
  }

  if (urls.length > 10000) {
    return NextResponse.json({ error: 'Max 10000 URLs per request' }, { status: 400 })
  }

  const payload = {
    host: new URL(SITE_URL).hostname,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  }

  const results = await Promise.allSettled(
    INDEXNOW_ENDPOINTS.map((endpoint) =>
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      })
    )
  )

  const statuses = results.map((r, i) => ({
    endpoint: INDEXNOW_ENDPOINTS[i],
    ok: r.status === 'fulfilled' && r.value.ok,
    status: r.status === 'fulfilled' ? r.value.status : 'error',
  }))

  return NextResponse.json({ submitted: urls.length, results: statuses })
}

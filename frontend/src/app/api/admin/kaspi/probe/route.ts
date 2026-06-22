import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

function extractKaspiSku(input: string): string | null {
  const s = input.trim()
  const m = s.match(/-(\d{6,})(?:[/?#]|$)/)
  if (m) return m[1]
  if (/^[\d_]+$/.test(s) && s.length >= 6) return s
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function pick<T>(...vals: (T | null | undefined | '')[]): T | null {
  for (const v of vals) if (v != null && v !== '') return v as T
  return null
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { url } = await request.json().catch(() => ({}))
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url required' }, { status: 400 })
  }
  const sku = extractKaspiSku(url)
  if (!sku) {
    return NextResponse.json({ error: 'SKU не найден в URL' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru,en;q=0.9',
      },
      redirect: 'follow',
      // 8s timeout via AbortSignal
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      return NextResponse.json({ sku, error: `Kaspi вернул ${res.status}` }, { status: 200 })
    }
    const html = await res.text()

    // 1) JSON-LD <script type="application/ld+json"> с Product
    let name: string | null = null
    let brand: string | null = null
    let price: number | null = null

    const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g
    let m: RegExpExecArray | null
    while ((m = ldRe.exec(html))) {
      try {
        const j = JSON.parse(m[1].trim())
        const items = Array.isArray(j) ? j : [j]
        for (const it of items) {
          if (it?.['@type'] === 'Product' || (Array.isArray(it?.['@type']) && it['@type'].includes('Product'))) {
            name = pick(name, it.name)
            brand = pick(brand, typeof it.brand === 'string' ? it.brand : it.brand?.name)
            const offer = Array.isArray(it.offers) ? it.offers[0] : it.offers
            if (offer?.price) price = pick(price, Number(offer.price))
            if (offer?.lowPrice && !price) price = Number(offer.lowPrice)
          }
        }
      } catch {}
    }

    // 2) Open Graph и meta
    if (!name) {
      const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
      if (og) name = decodeEntities(og[1])
    }
    if (!name) {
      const t = html.match(/<title>([^<]+)<\/title>/i)
      if (t) {
        // Kaspi title: "Название купить в Костанай, цены — Kaspi.kz"
        name = decodeEntities(t[1]).replace(/\s*[-—]\s*Kaspi\.kz.*$/i, '').replace(/\s*купить\s+в\s+.*$/i, '').trim()
      }
    }

    // 3) Цена — приоритет: og:price, "price":N, "lowPrice":N, тенге в HTML
    if (!price) {
      const og = html.match(/<meta\s+property=["']product:price:amount["']\s+content=["']([\d.]+)["']/i)
      if (og) price = Math.round(Number(og[1]))
    }
    if (!price) {
      const m1 = html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/)
      if (m1) price = Math.round(Number(m1[1]))
    }
    if (!price) {
      const m1 = html.match(/"lowPrice"\s*:\s*"?(\d+(?:\.\d+)?)"?/)
      if (m1) price = Math.round(Number(m1[1]))
    }

    // 4) Бренд — через ссылку производителя или в HTML
    if (!brand) {
      const m1 = html.match(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)
      if (m1) brand = m1[1]
    }
    if (!brand) {
      const m1 = html.match(/\/manufacturer\/([a-z0-9_-]+)\//i)
      if (m1) brand = m1[1]
    }

    return NextResponse.json({
      sku,
      name: name ? decodeEntities(name) : null,
      brand: brand ? decodeEntities(brand) : null,
      price: Number.isFinite(price as number) ? price : null,
    })
  } catch (e) {
    return NextResponse.json({ sku, error: 'Не удалось получить страницу: ' + (e as Error).message }, { status: 200 })
  }
}

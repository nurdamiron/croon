import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { searchLimiter } from '@/lib/rate-limit'
import { transliterate, switchLayout } from '@/lib/data'

export interface SearchSuggestion {
  id: string
  name: string
  slug: string
  price: number
  imageUrl: string | null
}

export async function GET(request: NextRequest) {
  const blocked = searchLimiter(request)
  if (blocked) return blocked

  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ products: [] })

  const exactPattern = `%${q}%`
  const normalizedQ = q.replace(/[-_\s]+/g, '')
  const normalizedPattern = `%${normalizedQ}%`

  let where = `(p.name ILIKE $1`
  where += ` OR REPLACE(REPLACE(REPLACE(p.name, '-', ''), ' ', ''), '_', '') ILIKE $2`
  // SKU search — Product.sku (источник истины после миграции этапа 1)
  where += ` OR p.sku ILIKE $1`
  const params: unknown[] = [exactPattern, normalizedPattern]

  // Transliteration + layout switch (same as full search)
  const translit = transliterate(q)
  const layout = switchLayout(q)
  if (layout) {
    translit.push(layout)
    translit.push(...transliterate(layout))
  }
  for (const t of translit) {
    params.push(`%${t}%`)
    where += ` OR p.name ILIKE $${params.length}`
  }

  // Individual words for multi-word queries
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    for (const w of words) {
      params.push(`%${w}%`)
      where += ` OR p.name ILIKE $${params.length}`
    }
  }
  where += `)`

  const rows: SearchSuggestion[] = await prisma.$queryRawUnsafe(
    `SELECT p.id, p.name, p.slug, p.price,
            (SELECT i.url FROM "ProductImage" i WHERE i."productId" = p.id ORDER BY i."sortOrder" ASC LIMIT 1) AS "imageUrl"
     FROM "Product" p
     WHERE ${where}
     ORDER BY
       p."inStock" DESC,
       CASE
         WHEN p.name ILIKE $1 THEN 0
         WHEN p.sku ILIKE $1 THEN 1
         ELSE 2
       END
     LIMIT 7`,
    ...params
  )

  return NextResponse.json({ products: rows })
}

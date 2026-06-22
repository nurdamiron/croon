import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// Извлечь slug из URL вида https://alash-electronics.kz/product/arduino-uno-r3/ или /product/arduino-uno-r3
function extractSlug(input: string): string | null {
  const s = input.trim()
  const m = s.match(/\/product\/([a-z0-9-]+)/i)
  if (m) return m[1].toLowerCase()
  if (/^[a-z0-9-]+$/i.test(s)) return s.toLowerCase()
  return null
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url') || ''
  const q = (searchParams.get('q') || '').trim()

  // 1) Если передан URL — ищем по точному slug
  if (url) {
    const slug = extractSlug(url)
    if (!slug) return NextResponse.json({ found: false, error: 'slug не найден в URL' })
    const product = await prisma.product.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, totalStock: true, inStock: true, price: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } },
    })
    if (!product) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, product: withImage(product) })
  }

  // 2) Если передан q — поиск по name/sku/id (по словам, чтобы «реле 5в»
  //    находило по обоим словам). slug-матч только для латинских запросов
  //    (иначе кириллица превращалась в "-" и матчила все товары — баг).
  if (q) {
    const words = q.split(/\s+/).filter(Boolean)
    const slugSafe = q.toLowerCase().replace(/[^a-z0-9-]+/g, '')  // пусто для кириллицы
    // каждое слово должно встретиться в name (AND по словам)
    const AND = words.map(w => ({
      OR: [
        { name: { contains: w, mode: 'insensitive' as const } },
        { sku: { contains: w, mode: 'insensitive' as const } },
      ],
    }))
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { id: { equals: q } },
          { AND },
          ...(slugSafe.length >= 2 ? [{ slug: { contains: slugSafe } }] : []),
        ],
      },
      select: { id: true, name: true, slug: true, totalStock: true, inStock: true, price: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } },
      take: 15,
      orderBy: { name: 'asc' },
    })
    return NextResponse.json({ products: products.map(withImage) })
  }

  return NextResponse.json({ products: [] })
}

const S3IMG = 'https://alashed-media.s3.eu-north-1.amazonaws.com'
function withImage(p: any) {
  let img = p.images?.[0]?.url || null
  if (img && !img.startsWith('http')) img = `${S3IMG}/${img.replace(/^\//, '')}`
  const { images, ...rest } = p
  return { ...rest, image: img }
}

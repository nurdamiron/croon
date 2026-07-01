import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Доступ: админ-сессия ИЛИ ?secret=<CRON_SECRET>.
async function authorized(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions)
  if (session?.user && (session.user as any).role === 'ADMIN') return true
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qs = req.nextUrl.searchParams.get('secret')
    if (auth === `Bearer ${secret}` || qs === secret) return true
  }
  return false
}

// GET — ПОЛНЫЙ каталог (вкл. не в наличии).
// Поля: id, sku (артикул), name, price, available (totalStock−reservedStock),
// inStock, images[]. По SKU строится единый склад.
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const products = await prisma.product.findMany({
    select: {
      id: true, name: true, slug: true, price: true, description: true,
      totalStock: true, reservedStock: true, inStock: true, sku: true,
      images: { select: { url: true }, orderBy: { sortOrder: 'asc' } },
      category: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { id: 'asc' },
  })

  const items = products.map(p => ({
    id: p.id,
    sku: (p.sku || '').trim() || null,
    name: p.name,
    slug: p.slug,
    price: p.price,
    description: p.description,
    available: Math.max(0, p.totalStock - p.reservedStock),
    inStock: p.inStock,
    images: p.images.map(i => i.url),
    category: p.category ? { id: p.category.id, name: p.category.name, slug: p.category.slug } : null,
  }))

  // полное дерево категорий (для анализа структуры внешними каналами)
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true, isHidden: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  })

  return NextResponse.json({ count: items.length, items, categories }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

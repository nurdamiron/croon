import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('ids') || ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 12)

  if (ids.length === 0) return NextResponse.json([])

  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      oldPrice: true,
      inStock: true,
      badgeText: true,
      images: { take: 2, select: { url: true, alt: true } },
    },
  })

  // Preserve order from input IDs
  const map = new Map(products.map(p => [p.id, p]))
  const ordered = ids.map(id => map.get(id)).filter(Boolean)

  return NextResponse.json(ordered)
}

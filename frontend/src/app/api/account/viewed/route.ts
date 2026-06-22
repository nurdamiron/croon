import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get('ids')
  if (!ids) return NextResponse.json([])

  const idList = ids.split(',').filter(Boolean).slice(0, 20)
  if (idList.length === 0) return NextResponse.json([])

  const products = await prisma.product.findMany({
    where: { id: { in: idList } },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      oldPrice: true,
      inStock: true,
      images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
    },
  })

  // Return in the same order as the input IDs
  const map = new Map(products.map(p => [p.id, p]))
  return NextResponse.json(idList.map(id => map.get(id)).filter(Boolean))
}

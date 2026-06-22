import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get('ids')

  if (!ids) {
    return NextResponse.json([], { status: 200 })
  }

  const idList = ids.split(',').filter(Boolean)

  const products = await prisma.product.findMany({
    where: { id: { in: idList } },
    include: {
      images: { orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  })

  // totalStock в ответе — доступный остаток (за вычетом брони под Kaspi-заказы),
  // чтобы корзина не давала заказать зарезервированное количество.
  const withAvailable = products.map((p) => ({
    ...p,
    totalStock: Math.max(0, p.totalStock - p.reservedStock),
  }))

  return NextResponse.json(withAvailable)
}

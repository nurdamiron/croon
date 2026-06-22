import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Внутренний API выгрузки товаров (по x-api-key). Был создан напрямую на проде
// (не было в репозитории) — внесён в репо при миграции «1 карточка = 1 товар».
// SKU читается с Product.sku (ProductVariant удалён).
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100'), 500)
  const skip = (page - 1) * limit

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: { archived: false }, // архивные товары не отдаём в каналы (Ba3ar/Satu витрина)
      select: {
        id: true,
        name: true,
        price: true,
        inStock: true,
        totalStock: true,
        reservedStock: true,
        sku: true,
        category: { select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
      },
      orderBy: { name: 'asc' },
      skip,
      take: limit,
    }),
    prisma.product.count({ where: { archived: false } }),
  ])

  const hasMore = skip + products.length < total

  return NextResponse.json({ products, total, page, limit, hasMore })
}

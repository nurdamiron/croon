import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      category: true,
      categories: { select: { id: true } },
    },
  })

  if (!product) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(product)
}

// PATCH — точечное обновление costPrice (себестоимости) одного товара.
// Лёгкая ручка для страницы массовой простановки себеса (/admin/cost-fix),
// чтобы не гонять тяжёлый PUT products со всеми полями/категориями.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  // Точечный PATCH: costPrice (себес), archived (архив/возврат), totalStock (остаток).
  const data: any = {}

  if ('costPrice' in body) {
    if (body.costPrice === null || body.costPrice === '') {
      data.costPrice = null
    } else {
      const n = Number(body.costPrice)
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: 'costPrice должен быть числом >= 0' }, { status: 400 })
      }
      data.costPrice = Math.round(n * 100) / 100 // до копеек
    }
  }
  if ('archived' in body) {
    data.archived = Boolean(body.archived)
  }

  const exists = await prisma.product.findUnique({
    where: { id: params.id },
    select: { id: true, reservedStock: true },
  })
  if (!exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if ('totalStock' in body) {
    const v = Math.max(0, Math.round(Number(body.totalStock)))
    if (!Number.isFinite(v)) {
      return NextResponse.json({ error: 'totalStock должен быть числом >= 0' }, { status: 400 })
    }
    data.totalStock = v
    // inStock по ДОСТУПНОМУ остатку (склад − бронь), а не просто склад>0:
    // при складе 2 и брони 2 доступно 0 → НЕ в наличии.
    data.inStock = (v - (exists.reservedStock ?? 0)) > 0
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'нечего обновлять (costPrice / archived / totalStock)' }, { status: 400 })
  }

  const updated = await prisma.product.update({
    where: { id: params.id },
    data,
    select: { id: true, costPrice: true, archived: true, totalStock: true, inStock: true },
  })


  return NextResponse.json({ ok: true, ...updated })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiLimiter } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: (session.user as any).id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          oldPrice: true,
          inStock: true,
          images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { url: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(favorites)
}

export async function POST(request: NextRequest) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { productId } = await request.json()

  if (!productId || typeof productId !== 'string') {
    return NextResponse.json({ error: 'productId обязателен' }, { status: 400 })
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } })
  if (!product) {
    return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })
  }

  await prisma.favorite.upsert({
    where: { userId_productId: { userId: (session.user as any).id, productId } },
    create: { userId: (session.user as any).id, productId },
    update: {},
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const productId = request.nextUrl.searchParams.get('productId')
  if (!productId) {
    return NextResponse.json({ error: 'productId обязателен' }, { status: 400 })
  }

  await prisma.favorite.deleteMany({
    where: { userId: (session.user as any).id, productId },
  })

  return NextResponse.json({ ok: true })
}

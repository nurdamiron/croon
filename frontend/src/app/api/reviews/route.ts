import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiLimiter } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const productId = request.nextUrl.searchParams.get('productId')
  if (!productId) {
    return NextResponse.json({ error: 'productId обязателен' }, { status: 400 })
  }

  const reviews = await prisma.review.findMany({
    where: { productId, isApproved: true },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(reviews)
}

export async function POST(request: NextRequest) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { productId, rating, text } = await request.json()

  if (!productId || !rating || !text) {
    return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 })
  }
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Оценка от 1 до 5' }, { status: 400 })
  }
  if (typeof text !== 'string' || text.length < 10 || text.length > 2000) {
    return NextResponse.json({ error: 'Отзыв от 10 до 2000 символов' }, { status: 400 })
  }

  const userId = (session.user as any).id as string

  // Only buyers (DELIVERED or PICKED_UP orders) can review
  const purchase = await prisma.orderItem.findFirst({
    where: {
      productId,
      order: {
        userId,
        status: { in: ['DELIVERED', 'PICKED_UP'] },
      },
    },
  })

  if (!purchase) {
    return NextResponse.json(
      { error: 'Только покупатели могут оставлять отзывы' },
      { status: 403 }
    )
  }

  // One review per user per product
  const existing = await prisma.review.findUnique({
    where: { userId_productId: { userId, productId } },
  })
  if (existing) {
    return NextResponse.json({ error: 'Вы уже оставили отзыв на этот товар' }, { status: 400 })
  }

  const review = await prisma.review.create({
    data: { userId, productId, rating, text, isApproved: false },
  })

  return NextResponse.json(
    { id: review.id, message: 'Отзыв отправлен на модерацию' },
    { status: 201 }
  )
}

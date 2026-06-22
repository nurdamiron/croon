import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiLimiter } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { productIds } = await request.json()

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return NextResponse.json({ synced: 0 })
  }

  const safeIds = productIds.slice(0, 100).filter((id): id is string => typeof id === 'string')

  const existing = await prisma.product.findMany({
    where: { id: { in: safeIds } },
    select: { id: true },
  })
  const validIds = existing.map(p => p.id)

  if (validIds.length === 0) {
    return NextResponse.json({ synced: 0 })
  }

  const result = await prisma.favorite.createMany({
    data: validIds.map(productId => ({ userId: (session.user as any).id, productId })),
    skipDuplicates: true,
  })

  return NextResponse.json({ synced: result.count })
}

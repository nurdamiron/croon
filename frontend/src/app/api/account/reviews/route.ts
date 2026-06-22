import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json([], { status: 200 })

  const reviews = await prisma.review.findMany({
    where: { userId: (session.user as any).id },
    select: { productId: true },
  })

  return NextResponse.json(reviews.map(r => r.productId))
}

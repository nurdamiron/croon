import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isApprovedParam = request.nextUrl.searchParams.get('isApproved')
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1'))
  const take = 20
  const skip = (page - 1) * take

  const where =
    isApprovedParam === 'true'
      ? { isApproved: true }
      : isApprovedParam === 'false'
      ? { isApproved: false }
      : {}

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        product: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.review.count({ where }),
  ])

  return NextResponse.json({ reviews, total, page, pages: Math.ceil(total / take) })
}

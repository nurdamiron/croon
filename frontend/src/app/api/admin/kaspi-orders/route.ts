import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// GET /api/admin/kaspi-orders?status=&q= — список импортированных Kaspi-заказов.
export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sp = request.nextUrl.searchParams
  const status = sp.get('status') || ''
  const q = (sp.get('q') || '').trim()

  const where: any = {}
  if (status) where.status = status
  if (q) {
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q } },
    ]
  }

  const orders = await prisma.kaspiOrder.findMany({
    where,
    orderBy: { creationDate: 'desc' },
    take: 200,
    include: {
      items: {
        include: { product: { select: { id: true, name: true, slug: true } } },
      },
    },
  })
  return NextResponse.json({ orders })
}

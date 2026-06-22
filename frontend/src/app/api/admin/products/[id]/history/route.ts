import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const field = request.nextUrl.searchParams.get('field') // "price" | "stock" | null (all)

  const where: any = { productId: id }
  if (field === 'price') where.field = { in: ['price', 'oldPrice'] }
  else if (field === 'stock') where.field = { in: ['totalStock', 'stock'] }

  const logs = await prisma.productChangeLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return NextResponse.json(logs)
}

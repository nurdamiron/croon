import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SATU_OPEN_STATUSES } from '@/lib/satu-constants'

export const dynamic = 'force-dynamic'

// Кол-во открытых заказов Satu — для бейджа в меню.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const count = await prisma.satuOrder.count({
    where: { status: { in: SATU_OPEN_STATUSES } },
  })
  return NextResponse.json({ count })
}

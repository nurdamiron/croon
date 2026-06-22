import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Кол-во НОВЫХ (ещё не принятых в работу) Kaspi-заказов — бейдж в меню.
// Только APPROVED_BY_BANK = «Каспи оплатил, продавец ещё не подтвердил».
// ACCEPTED_BY_MERCHANT уже принят/упакован/отдан в доставку → НЕ считаем.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const count = await prisma.kaspiOrder.count({
    where: { status: 'APPROVED_BY_BANK' },
  })
  return NextResponse.json({ count })
}

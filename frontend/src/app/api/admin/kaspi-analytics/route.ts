// Аналитика продаж Kaspi — JSON-эндпоинт (admin-only). Вторичный путь: основной рендер
// идёт через серверный компонент /admin/kaspi-analytics. Здесь — на случай клиентского рефетча.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { computeKaspiAnalytics, resolveRange } from '@/lib/kaspi-analytics'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const { from, to } = resolveRange(sp.get('from'), sp.get('to'))
  const data = await computeKaspiAnalytics({ from, to })
  return NextResponse.json(data)
}

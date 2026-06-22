import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncSatuOrders } from '@/lib/satu-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// POST /api/admin/satu-orders/sync?days=30 — ручной импорт заказов Satu.
export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const daysParam = Number(request.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(90, daysParam) : 30
  const result = await syncSatuOrders(days)
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}

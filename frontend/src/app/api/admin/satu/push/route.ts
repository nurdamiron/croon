import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { pushSatuStock } from '@/lib/satu-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// POST /api/admin/satu/push?dry=1 — отправить остатки Alash в Satu.
// dry=1 — пробный прогон (ничего не шлёт, только считает).
export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const result = await pushSatuStock(dry)
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}

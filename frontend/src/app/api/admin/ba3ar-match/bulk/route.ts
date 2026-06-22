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

// POST /api/admin/ba3ar-match/bulk
// body: { ids: string[], status } — массово, ИЛИ { action:'confirm-high', minScore } —
// подтвердить все matched со score >= minScore.
export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()

  if (body.action === 'confirm-high') {
    const min = Number(body.minScore) || 0.85
    const r = await prisma.ba3arMatch.updateMany({
      where: { kind: 'matched', status: 'pending', score: { gte: min } },
      data: { status: 'confirmed' },
    })
    return NextResponse.json({ ok: true, affected: r.count })
  }

  const ids: string[] = Array.isArray(body.ids) ? body.ids : []
  const status = body.status
  if (!ids.length || !['confirmed', 'rejected', 'pending'].includes(status)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }
  const r = await prisma.ba3arMatch.updateMany({ where: { id: { in: ids } }, data: { status } })
  return NextResponse.json({ ok: true, affected: r.count })
}

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

// PATCH /api/admin/ba3ar-match/:id — подтвердить/отклонить матч.
// body: { status: 'confirmed' | 'rejected' | 'pending' }
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const data: any = {}
  if (body.status !== undefined) {
    if (!['confirmed', 'rejected', 'pending', 'not_in_alash'].includes(body.status)) {
      return NextResponse.json({ error: 'bad status' }, { status: 400 })
    }
    data.status = body.status
  }
  if (body.stockQty !== undefined) {
    const v = body.stockQty
    data.stockQty = v === null || v === '' ? null : Math.max(0, Math.round(Number(v)))
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  const m = await prisma.ba3arMatch.update({ where: { id: params.id }, data })
  return NextResponse.json({ match: m })
}

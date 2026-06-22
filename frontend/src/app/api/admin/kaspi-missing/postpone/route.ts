// Отложить / вернуть товар на странице «Нет на Kaspi» (B2B и т.п., которые не выкладываем).
// Хранится списком productId в AppSetting (kaspi_missing_postponed) — без изменения схемы.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setPostponed } from '@/lib/app-settings'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// POST { productId: string, postponed: boolean }
export async function POST(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const productId = typeof body.productId === 'string' ? body.productId : ''
  if (!productId) return NextResponse.json({ error: 'productId обязателен' }, { status: 400 })
  const postponed = body.postponed !== false // по умолчанию — отложить
  const list = await setPostponed(productId, postponed)
  return NextResponse.json({ ok: true, postponed, count: list.length })
}

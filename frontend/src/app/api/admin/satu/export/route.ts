import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSatuExportCandidatesEx, getSatuExportCandidates, exportProductsToSatu } from '@/lib/satu-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function authorized(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions)
  if (session?.user && (session.user as any).role === 'ADMIN') return true
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qs = req.nextUrl.searchParams.get('secret')
    if (auth === `Bearer ${secret}` || qs === secret) return true
  }
  return false
}

// GET — список товаров Alash, которых нет на Satu (кандидаты на выгрузку).
// Плюс nameCollisions — совпали по имени с карточкой Satu без артикула (дубль-риск).
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { candidates, nameCollisions } = await getSatuExportCandidatesEx(2000)
  return NextResponse.json({
    count: candidates.length,
    collisionsCount: nameCollisions.length,
    candidates,
    nameCollisions,
  })
}

// POST — выгрузить товары на Satu. Тело: { ids: string[] }.
// Без ids — берём первую партию кандидатов (limit, по умолч. 20).
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let ids: string[] = []
  try {
    const body = await req.json().catch(() => ({}))
    if (Array.isArray(body?.ids)) ids = body.ids.map((s: unknown) => String(s)).filter(Boolean)
    if (!ids.length) {
      const limit = Math.min(100, Math.max(1, Number(body?.limit) || 20))
      const candidates = await getSatuExportCandidates(limit)
      ids = candidates.map(c => c.id)
    }
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 })
  }

  if (!ids.length) return NextResponse.json({ error: 'Нет товаров для выгрузки' }, { status: 400 })

  const result = await exportProductsToSatu(ids)
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}

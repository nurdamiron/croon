import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { importSatuProducts } from '@/lib/satu-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Доступ: админ-сессия ИЛИ ?secret=<CRON_SECRET> (запуск без UI).
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

// POST /api/admin/satu/import — импорт товаров Satu + авто-связь по SKU
// + чистка зеркала от удалённых на Satu товаров.
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const result = await importSatuProducts()
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}

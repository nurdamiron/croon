import { NextRequest, NextResponse } from 'next/server'
import { syncKaspiOrders } from '@/lib/kaspi-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Эндпоинт для cron (EC2) — дёргается по расписанию.
// Защита секретом: заголовок Authorization: Bearer <CRON_SECRET>
// или ?secret=<CRON_SECRET>. Если CRON_SECRET не задан — 503 (чтобы не оставить
// открытый эндпоинт без защиты).
export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET не задан на сервере' }, { status: 503 })
  }
  const auth = request.headers.get('authorization')
  const qsSecret = request.nextUrl.searchParams.get('secret')
  const ok = auth === `Bearer ${secret}` || qsSecret === secret
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days'))
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(90, daysParam) : 30
  const result = await syncKaspiOrders(days)
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}

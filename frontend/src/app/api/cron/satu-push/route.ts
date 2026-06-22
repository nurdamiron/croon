import { NextRequest, NextResponse } from 'next/server'
import { pushSatuDirty } from '@/lib/satu-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Воркер очереди остатков Satu. Дёргается cron'ом раз в минуту.
// Пушит в Satu только товары с satuDirty=true. Защита секретом CRON_SECRET.
export async function GET(request: NextRequest) { return handle(request) }
export async function POST(request: NextRequest) { return handle(request) }

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET не задан' }, { status: 503 })
  const auth = request.headers.get('authorization')
  const qs = request.nextUrl.searchParams.get('secret')
  if (auth !== `Bearer ${secret}` && qs !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await pushSatuDirty()
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}

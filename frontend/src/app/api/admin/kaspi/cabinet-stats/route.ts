// Приём реальных счётчиков из кабинета Kaspi (в продаже / снято) от браузера или
// воркера с кабинетной сессией. Сервер сам в кабинет не ходит (IP заблокирован),
// поэтому число «на Kaspi» поставляется снаружи и хранится в AppSetting.
//
// Аутентификация: Authorization: Bearer <CRON_SECRET> или поле secret в теле (не query).
// Тело: { active: number, archived?: number }
import { NextRequest, NextResponse } from 'next/server'
import { setNumber, setString } from '@/lib/app-settings'
import { KASPI_CABINET_ACTIVE, KASPI_CABINET_ARCHIVED, KASPI_CABINET_AT } from '@/lib/app-settings'

export const dynamic = 'force-dynamic'

function authed(req: NextRequest, bodySecret?: unknown): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}` || bodySecret === secret
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!authed(req, body.secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const active = Number(body.active)
  const archived = Number(body.archived)
  if (!Number.isFinite(active) || active < 0) return NextResponse.json({ error: 'active некорректен' }, { status: 400 })

  await setNumber(KASPI_CABINET_ACTIVE, active)
  if (Number.isFinite(archived) && archived >= 0) await setNumber(KASPI_CABINET_ARCHIVED, archived)
  await setString(KASPI_CABINET_AT, new Date().toISOString())

  return NextResponse.json({ ok: true, active, archived: Number.isFinite(archived) ? archived : null })
}

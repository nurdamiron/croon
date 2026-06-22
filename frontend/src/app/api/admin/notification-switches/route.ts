import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getFlag, setFlag,
  NOTIFY_ALASH, NOTIFY_KASPI, NOTIFY_SATU, NOTIFY_BA3AR,
} from '@/lib/app-settings'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

async function readAll() {
  return {
    alash: await getFlag(NOTIFY_ALASH),
    kaspi: await getFlag(NOTIFY_KASPI),
    satu: await getFlag(NOTIFY_SATU),
    ba3ar: await getFlag(NOTIFY_BA3AR),
  }
}

export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await readAll())
}

// PATCH { alash?: boolean, kaspi?: boolean, satu?: boolean, ba3ar?: boolean }
export async function PATCH(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Некорректное тело' }, { status: 400 }) }
  if (typeof body.alash === 'boolean') await setFlag(NOTIFY_ALASH, body.alash)
  if (typeof body.kaspi === 'boolean') await setFlag(NOTIFY_KASPI, body.kaspi)
  if (typeof body.satu === 'boolean') await setFlag(NOTIFY_SATU, body.satu)
  if (typeof body.ba3ar === 'boolean') await setFlag(NOTIFY_BA3AR, body.ba3ar)
  return NextResponse.json(await readAll())
}

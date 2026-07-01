import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getFlag, setFlag,
  NOTIFY_ALASH, NOTIFY_KASPI,
} from '@/lib/app-settings'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

async function readAll() {
  return {
    croon: await getFlag(NOTIFY_ALASH),
    kaspi: await getFlag(NOTIFY_KASPI),
  }
}

export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await readAll())
}

// PATCH { croon?: boolean, kaspi?: boolean }
export async function PATCH(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Некорректное тело' }, { status: 400 }) }
  if (typeof body.croon === 'boolean') await setFlag(NOTIFY_ALASH, body.croon)
  if (typeof body.kaspi === 'boolean') await setFlag(NOTIFY_KASPI, body.kaspi)
  return NextResponse.json(await readAll())
}

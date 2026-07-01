import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getFlag, setFlag, getNumber, setNumber,
  KASPI_FEED_ENABLED, KASPI_SITE_BLOCKS_ENABLED,
  KASPI_COMMISSION_MULT, KASPI_COMMISSION_MULT_DEFAULT,
  getKaspiEconomics,
  KASPI_ECON_COMMISSION_PCT, KASPI_ECON_PAY_PCT, KASPI_ECON_TAX_PCT,
  KASPI_ECON_DELIVERY_TENGE, KASPI_ECON_DELIVERY_THRESHOLD,
} from '@/lib/app-settings'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

async function state() {
  const [flags, econ] = await Promise.all([
    Promise.all([
      getFlag(KASPI_FEED_ENABLED),
      getFlag(KASPI_SITE_BLOCKS_ENABLED),
      getNumber(KASPI_COMMISSION_MULT, KASPI_COMMISSION_MULT_DEFAULT),
    ]),
    getKaspiEconomics(),
  ])
  const [feedEnabled, siteBlocksEnabled, commissionMult] = flags
  return { feedEnabled, siteBlocksEnabled, commissionMult, econ }
}

// GET — текущее состояние тумблеров + множитель комиссии.
export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await state())
}

// PATCH { feedEnabled?, siteBlocksEnabled?, commissionMult?: number }
export async function PATCH(req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Некорректное тело' }, { status: 400 }) }
  if (typeof body.feedEnabled === 'boolean') await setFlag(KASPI_FEED_ENABLED, body.feedEnabled)
  if (typeof body.siteBlocksEnabled === 'boolean') await setFlag(KASPI_SITE_BLOCKS_ENABLED, body.siteBlocksEnabled)
  if (body.commissionMult !== undefined) {
    const n = Number(body.commissionMult)
    if (Number.isFinite(n) && n > 0 && n < 100) await setNumber(KASPI_COMMISSION_MULT, n)
  }
  // Ставки экономики Kaspi (для аналитики прибыли). Принимаем ≥ 0; проценты < 100, доставка/порог любые.
  const econMap: Array<[string, string, number]> = [
    ['commissionPct', KASPI_ECON_COMMISSION_PCT, 100],
    ['payPct', KASPI_ECON_PAY_PCT, 100],
    ['taxPct', KASPI_ECON_TAX_PCT, 100],
    ['deliveryTenge', KASPI_ECON_DELIVERY_TENGE, Infinity],
    ['deliveryThreshold', KASPI_ECON_DELIVERY_THRESHOLD, Infinity],
  ]
  for (const [field, key, max] of econMap) {
    if (body[field] !== undefined) {
      const n = Number(body[field])
      if (Number.isFinite(n) && n >= 0 && n < max) await setNumber(key, n)
    }
  }
  return NextResponse.json(await state())
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { autoLinkKaspiOffersBySku } from '@/lib/kaspi-autolink'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// GET — dry-run: сколько привяжется, без изменений.
export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const result = await autoLinkKaspiOffersBySku({ apply: false })
  return NextResponse.json(result)
}

// POST — применить автопривязку каталога Kaspi к товарам по артикулу.
export async function POST(_req: NextRequest) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const result = await autoLinkKaspiOffersBySku({ apply: true })
  return NextResponse.json(result)
}

// Привязка «потерянных» позиций Kaspi-заказов (productId=null) к товарам.
//   GET  — dry-run: показать, сколько привяжется и по чему (SKU/название), не меняя БД.
//   POST — применить привязку.
// Admin-only. Логика — в lib/kaspi-relink.ts (переиспользует resolveProductId из kaspi-sync).
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { relinkKaspiItems } from '@/lib/kaspi-relink'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET() {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const result = await relinkKaspiItems({ apply: false })
  return NextResponse.json(result)
}

export async function POST() {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const result = await relinkKaspiItems({ apply: true })
  return NextResponse.json(result)
}

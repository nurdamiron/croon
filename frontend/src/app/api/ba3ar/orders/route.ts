import { NextRequest, NextResponse } from 'next/server'
import { createBa3arOrder, type Ba3arOrderInput } from '@/lib/ba3ar-orders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/ba3ar/orders — приём заказа с ba3ar.kz (единый склад).
// Защита: заголовок Authorization: Bearer <BA3AR_API_SECRET> или ?secret=.
// Тело: { ba3arOrderId, customerName, customerPhone, email, deliveryName,
//         address, comment, items:[{sku,name,quantity,price}] }
function authorized(req: NextRequest): boolean {
  const secret = process.env.BA3AR_API_SECRET || process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const qs = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || qs === secret
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: Ba3arOrderInput
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Некорректное тело' }, { status: 400 }) }
  if (!body?.ba3arOrderId || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'ba3arOrderId и items обязательны' }, { status: 400 })
  }
  const result = await createBa3arOrder(body)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}

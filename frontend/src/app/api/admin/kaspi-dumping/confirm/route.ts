// Подтверждение применённых кабинетным воркером цен.
// Воркер меняет цену в кабинете Kaspi (pricefeed/process), затем шлёт сюда список
// успешно применённых {offerId, newPrice} — сервер записывает цену в БД (чтобы фид/
// админка/маржа были синхронны с тем, что реально ушло в Kaspi) + лог.
//
// Аутентификация секретом: ?secret=CRON_SECRET или Bearer.
//
// Тело: { applied: [{ offerId, newPrice, status?, position?, competitorCount?, firstPlacePrice? }] }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const qs = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || qs === secret
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const applied: any[] = Array.isArray(body.applied) ? body.applied : []
  if (!applied.length) return NextResponse.json({ ok: true, written: 0 })

  const ids = applied.map((a) => String(a.offerId)).filter(Boolean)
  const offers = await prisma.kaspiOffer.findMany({
    where: { id: { in: ids } },
    select: { id: true, productId: true, priceTenge: true },
  })
  const byId = new Map(offers.map((o) => [o.id, o]))

  let written = 0
  for (const a of applied) {
    const o = byId.get(String(a.offerId))
    if (!o) continue
    const newPrice = Math.round(Number(a.newPrice))
    if (!Number.isFinite(newPrice) || newPrice < 1) continue
    const oldPrice = o.priceTenge

    await prisma.$transaction([
      prisma.kaspiOffer.update({
        where: { id: o.id },
        data: {
          priceTenge: newPrice,
          firstPlacePrice: a.firstPlacePrice ?? undefined,
          ourPosition: a.position ?? undefined,
          competitorCount: a.competitorCount ?? undefined,
          lastDumpCheckAt: new Date(),
          lastDumpError: null,
        },
      }),
      prisma.productChangeLog.create({
        data: {
          productId: o.productId,
          field: 'price',
          oldValue: Number(oldPrice) || 0,
          newValue: Number(newPrice) || 0,
          source: 'kaspi-dumping-cabinet',
          detail: `демпинг через кабинет (${a.status || '?'}): ${oldPrice}→${newPrice}₸`,
        },
      }),
    ])
    written++
  }

  return NextResponse.json({ ok: true, written })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids : []
  const action: string = body.action || ''
  // value — для действий, требующих параметр (set-preorder, set-stock, set-price, markup)
  const value = body.value

  if (!ids.length) return NextResponse.json({ error: 'ids пуст' }, { status: 400 })

  const where = { id: { in: ids } }
  let affected = 0
  switch (action) {
    case 'activate':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { active: true } }))
      break
    case 'deactivate':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { active: false } }))
      break
    case 'delete':
      ({ count: affected } = await prisma.kaspiOffer.deleteMany({ where }))
      break
    case 'available-yes':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { availableOverride: true } }))
      break
    case 'available-no':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { availableOverride: false } }))
      break
    case 'available-auto':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { availableOverride: null } }))
      break
    // Показ блока на сайте: yes/no/auto (auto = null, наследует active)
    case 'site-yes':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { showOnSite: true } }))
      break
    case 'site-no':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { showOnSite: false } }))
      break
    case 'site-auto':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { showOnSite: null } }))
      break
    // Установить кол-во дней предзаказа (0–30 по доке Kaspi)
    case 'set-preorder': {
      let v = Math.round(Number(value))
      if (!Number.isFinite(v) || v < 0) v = 0
      if (v > 30) v = 30
      ;({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { preOrder: v } }))
      break
    }
    // Установить stockCount: число ≥0, либо null/'' = auto (берётся Product.totalStock)
    case 'set-stock': {
      let v: number | null
      if (value === null || value === '' || value === undefined) v = null
      else { v = Math.max(0, Math.round(Number(value))); if (!Number.isFinite(v)) v = null }
      ;({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { stockOverride: v } }))
      break
    }
    // Установить цену для всех выбранных
    case 'set-price': {
      const v = Math.round(Number(value))
      if (!Number.isFinite(v) || v < 1) return NextResponse.json({ error: 'Некорректная цена' }, { status: 400 })
      ;({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { priceTenge: v } }))
      break
    }
    // %-наценка: priceTenge = round(priceTenge * (1 + pct/100)).
    // updateMany не умеет вычисления, поэтому обновляем по одному в транзакции.
    case 'markup': {
      const pct = Number(value)
      if (!Number.isFinite(pct)) return NextResponse.json({ error: 'Некорректный процент' }, { status: 400 })
      const offers = await prisma.kaspiOffer.findMany({ where, select: { id: true, priceTenge: true } })
      await prisma.$transaction(
        offers.map(o => prisma.kaspiOffer.update({
          where: { id: o.id },
          data: { priceTenge: Math.max(1, Math.round(o.priceTenge * (1 + pct / 100))) },
        }))
      )
      affected = offers.length
      break
    }

    default:
      return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, affected })
}

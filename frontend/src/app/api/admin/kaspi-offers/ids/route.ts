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

// Возвращает id всех KaspiOffer по фильтру — для массового выделения «всё»,
// а не только видимой страницы (страница ограничена 500 строками каталога).
// ?scope=all — все офферы; ?scope=active — только активные (default all).
// ?q= — фильтр по имени/бренду/SKU оффера или связанного товара.
export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const sp = request.nextUrl.searchParams
  const scope = sp.get('scope') || 'all'
  const q = (sp.get('q') || '').trim()

  const where: any = {}
  // scope=active — ровно то, что реально уходит в фид: active=true И заполнен
  // kaspiName (фид отбрасывает офферы без имени). Иначе число выделенных не
  // совпадало бы с «Активных в фиде».
  if (scope === 'active') {
    where.active = true
    where.kaspiName = { not: null }
    where.NOT = { kaspiName: '' }
  }
  if (q) {
    where.OR = [
      { kaspiName: { contains: q, mode: 'insensitive' } },
      { kaspiBrand: { contains: q, mode: 'insensitive' } },
      { kaspiSku: { contains: q } },
      { product: { name: { contains: q, mode: 'insensitive' } } },
    ]
  }

  // Демпинг-фильтры (совпадают с page.tsx) — чтобы «Выбрать всё» учитывало
  // активный фильтр по позиции/конкурентам/тумблерам для массовых изменений.
  const pos = sp.get('pos')         // '1'..'4' | 'alone'
  const comp = sp.get('comp')       // 'on'
  const down = sp.get('down')       // 'yes' | 'no'
  const up = sp.get('up')           // 'yes' | 'no'
  const nofloor = sp.get('nofloor') // 'on'
  if (pos === 'alone') where.competitorCount = 0
  else if (pos && ['1', '2', '3', '4'].includes(pos)) where.ourPosition = Number(pos)
  if (comp === 'on') where.competitorCount = { gt: 0 }
  if (down === 'yes') where.autoDownscale = true
  if (down === 'no') where.autoDownscale = false
  if (up === 'yes') where.autoUpscale = true
  if (up === 'no') where.autoUpscale = false
  if (nofloor === 'on') { where.autoDownscale = true; where.minPriceTenge = null }

  // Расширенные фильтры (совпадают с page.tsx) — те, что выражаются в SQL-where:
  const pain = sp.get('pain')
  const alonenoceil = sp.get('alonenoceil')
  if (pain === 'on') { where.autoDownscale = true; where.minPriceTenge = null; where.competitorCount = { gt: 0 }; where.ourPosition = { not: 1 } }
  if (alonenoceil === 'on') { where.competitorCount = 0; where.maxPriceTenge = null; where.lastDumpCheckAt = { not: null } }
  // notvisible: конкуренты есть, но нас нет в выдаче (ourPosition пуст) — дорого/глубоко.
  if (sp.get('notvisible') === 'on') { where.competitorCount = { gt: 0 }; where.ourPosition = null; where.lastDumpCheckAt = { not: null } }
  // nocost: нет закупочной цены (costPrice пуст/0) — товар привязан, но безубыток не посчитать.
  if (sp.get('nocost') === 'on') {
    where.product = { OR: [{ costPrice: null }, { costPrice: { lte: 0 } }] }
  }

  // Вычисляемые фильтры (loss/expensive/underdump/stale) — нужны rivalPrice/costPrice,
  // фильтруем после выборки в JS.
  const loss = sp.get('loss') === 'on'
  const expensive = sp.get('expensive') === 'on'
  const underdump = sp.get('underdump') === 'on'
  const stale = sp.get('stale') === 'on'
  const needCalc = loss || expensive || underdump || stale

  if (!needCalc) {
    const offers = await prisma.kaspiOffer.findMany({ where, select: { id: true } })
    return NextResponse.json({ ids: offers.map(o => o.id), count: offers.length })
  }

  const { getKaspiCommissionMult } = await import('@/lib/app-settings')
  const mult = await getKaspiCommissionMult()
  const offers = await prisma.kaspiOffer.findMany({
    where,
    select: { id: true, priceTenge: true, rivalPrice: true, dumpingStep: true, lastDumpCheckAt: true,
      product: { select: { costPrice: true } } },
  })
  const now = Date.now()
  const filtered = offers.filter(o => {
    const rival = o.rivalPrice
    const cost = o.product?.costPrice ?? null
    if (loss) {
      const target = rival != null ? rival - (o.dumpingStep || 2) : null
      const breakeven = cost != null && cost > 0 ? cost * mult : null
      if (!(target != null && breakeven != null && target < breakeven)) return false
    }
    if (expensive && !(rival != null && rival > 0 && o.priceTenge > rival * 1.5)) return false
    if (underdump && !(rival != null && rival > 0 && o.priceTenge > 0 && o.priceTenge * 1.5 < rival)) return false
    if (stale) {
      const ms = o.lastDumpCheckAt ? new Date(o.lastDumpCheckAt).getTime() : 0
      if (!(!ms || now - ms > 24 * 3600 * 1000)) return false
    }
    return true
  })
  return NextResponse.json({ ids: filtered.map(o => o.id), count: filtered.length })
}

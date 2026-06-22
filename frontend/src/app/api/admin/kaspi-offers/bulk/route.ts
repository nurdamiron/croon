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
    // --- Демпинг: bulk-тумблеры и параметры ---
    case 'dump-down-on':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { autoDownscale: true } }))
      break
    case 'dump-down-off':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { autoDownscale: false } }))
      break
    case 'dump-up-on':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { autoUpscale: true } }))
      break
    case 'dump-up-off':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { autoUpscale: false } }))
      break
    case 'set-dump-step': {
      let v = Math.round(Number(value))
      if (!Number.isFinite(v) || v < 1) v = 1
      ;({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { dumpingStep: v } }))
      break
    }
    case 'set-dump-strategy': {
      const allowed = ['BECOME_FIRST', 'MATCH_FIRST', 'HOLD_SECOND', 'FIRST_MIN_GAP']
      const s = String(value)
      if (!allowed.includes(s)) return NextResponse.json({ error: 'Неизвестная стратегия' }, { status: 400 })
      ;({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { strategy: s } }))
      break
    }
    // Установить минимальную цену (floor) числом для всех выбранных. ''/null = сброс.
    case 'set-min-price': {
      let v: number | null
      if (value === null || value === '' || value === undefined) v = null
      else { v = Math.max(1, Math.round(Number(value))); if (!Number.isFinite(v)) v = null }
      ;({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { minPriceTenge: v } }))
      break
    }
    case 'set-max-price': {
      let v: number | null
      if (value === null || value === '' || value === undefined) v = null
      else { v = Math.max(1, Math.round(Number(value))); if (!Number.isFinite(v)) v = null }
      ;({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { maxPriceTenge: v } }))
      break
    }
    // Авто-floor от закупа: minPriceTenge = round(costPrice × mult). value = доп.
    // наценка в % сверх безубытка (опционально, по умолчанию 0). Берём costPrice
    // товара; у кого его нет — пропускаем.
    case 'set-floor-auto': {
      const { getKaspiCommissionMult } = await import('@/lib/app-settings')
      const mult = await getKaspiCommissionMult()
      const extraPct = Number(value)
      const factor = mult * (1 + (Number.isFinite(extraPct) ? extraPct : 0) / 100)
      const offers = await prisma.kaspiOffer.findMany({
        where, select: { id: true, product: { select: { costPrice: true } } },
      })
      const toUpdate = offers.filter(o => o.product?.costPrice && o.product.costPrice > 0)
      await prisma.$transaction(
        toUpdate.map(o => prisma.kaspiOffer.update({
          where: { id: o.id },
          data: { minPriceTenge: Math.max(1, Math.round((o.product!.costPrice as number) * factor)) },
        }))
      )
      affected = toUpdate.length
      break
    }
    // Floor = текущая цена оффера − N% (НЕ от закупа — закуп на цену не влияет).
    // value = процент скидки (напр. 15 → floor = цена×0.85). Главное лекарство для
    // товаров без закупа: разблокирует снижение, не дав уйти слишком низко.
    case 'set-floor-pct': {
      const pct = Number(value)
      if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return NextResponse.json({ error: 'Процент 0–99' }, { status: 400 })
      const offers = await prisma.kaspiOffer.findMany({ where, select: { id: true, priceTenge: true } })
      await prisma.$transaction(
        offers.map(o => prisma.kaspiOffer.update({
          where: { id: o.id },
          data: { minPriceTenge: Math.max(1, Math.round(o.priceTenge * (1 - pct / 100))) },
        }))
      )
      affected = offers.length
      break
    }
    // Ceiling = текущая цена + N%. value = процент. Для товаров без конкурентов,
    // чтобы автоповышение поднимало цену «пока конкурентов нет».
    case 'set-ceiling-pct': {
      const pct = Number(value)
      if (!Number.isFinite(pct) || pct < 0) return NextResponse.json({ error: 'Процент ≥0' }, { status: 400 })
      const offers = await prisma.kaspiOffer.findMany({ where, select: { id: true, priceTenge: true } })
      await prisma.$transaction(
        offers.map(o => prisma.kaspiOffer.update({
          where: { id: o.id },
          data: { maxPriceTenge: Math.max(1, Math.round(o.priceTenge * (1 + pct / 100))) },
        }))
      )
      affected = offers.length
      break
    }
    // «⚡ Выйти в топ сейчас»: разово ставим цену = rivalPrice − dumpingStep, не
    // дожидаясь авто-прогона. Защита: не ниже floor (если задан) и не ниже 1.
    // Пропускаем офферы без снятого rivalPrice (нет данных о конкуренте).
    case 'beat-now': {
      const offers = await prisma.kaspiOffer.findMany({
        where, select: { id: true, priceTenge: true, rivalPrice: true, dumpingStep: true, minPriceTenge: true, productId: true },
      })
      const toUpdate = offers.filter(o => o.rivalPrice != null && o.rivalPrice > 1)
      await prisma.$transaction(
        toUpdate.flatMap(o => {
          let target = (o.rivalPrice as number) - (o.dumpingStep || 2)
          if (o.minPriceTenge != null && target < o.minPriceTenge) target = o.minPriceTenge
          target = Math.max(1, Math.round(target))
          if (target === o.priceTenge) return []
          return [
            prisma.kaspiOffer.update({ where: { id: o.id }, data: { priceTenge: target } }),
            prisma.productChangeLog.create({
              data: { productId: o.productId, field: 'price', oldValue: Number(o.priceTenge) || 0, newValue: Number(target) || 0,
                source: 'kaspi-dumping', detail: `выйти в топ сейчас: ${o.priceTenge}→${target}₸ (конкурент ${o.rivalPrice})` },
            }),
          ]
        })
      )
      affected = toUpdate.length
      break
    }
    // Игнор-лист продавца: добавить/убрать merchantId из ignoreMerchants[]. value =
    // строка (имя ИЛИ id продавца). Движок исключает их из конкурентов (не воюем
    // сами с собой / с партнёром). updateMany не умеет массивы → по одному.
    case 'ignore-merchant-add':
    case 'ignore-merchant-remove': {
      const m = String(value || '').trim()
      if (!m) return NextResponse.json({ error: 'Не указан продавец' }, { status: 400 })
      const offers = await prisma.kaspiOffer.findMany({ where, select: { id: true, ignoreMerchants: true } })
      await prisma.$transaction(
        offers.map(o => {
          const set = new Set(o.ignoreMerchants || [])
          if (action === 'ignore-merchant-add') set.add(m); else set.delete(m)
          return prisma.kaspiOffer.update({ where: { id: o.id }, data: { ignoreMerchants: Array.from(set) } })
        })
      )
      affected = offers.length
      break
    }
    // Пауза демпинга: выключить оба тумблера, сохранив floor/ceiling/strategy.
    // Резюм: включить только автоснижение (основной режим выхода в топ).
    case 'dump-pause':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { autoDownscale: false, autoUpscale: false } }))
      break
    case 'dump-resume':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({ where, data: { autoDownscale: true } }))
      break
    // Полный сброс демпинг-настроек (тумблеры выкл, floor/ceiling/игнор очищены,
    // стратегия по умолчанию). Метрики (позиция/цены) НЕ трогаем.
    case 'dump-reset':
      ({ count: affected } = await prisma.kaspiOffer.updateMany({
        where, data: { autoDownscale: false, autoUpscale: false, minPriceTenge: null, maxPriceTenge: null, ignoreMerchants: [], strategy: 'BECOME_FIRST', dumpingStep: 2 },
      }))
      break
    // ⚡ Просчитать min/max по формуле за один проход. value = { kMin, kMax, kRival }.
    //   min  = round(costPrice × kMin)            — нет себеса → ПРОПУСК
    //   max  = competitorCount>0 && rivalPrice    → round(rivalPrice × kRival)  (есть конкуренты)
    //          иначе (мы одни в карточке)         → round(price_сайта × kMax)
    //   min > max → ПРОПУСК (показываем списком). Перезаписывает существующие min/max.
    // Конкуренты — из последнего скана воркера (competitorCount/rivalPrice).
    case 'set-minmax-formula': {
      const v = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
      const kMin = Number(v.kMin)
      const kMax = Number(v.kMax)
      const kRival = Number(v.kRival)
      if (![kMin, kMax, kRival].every((x) => Number.isFinite(x) && x > 0)) {
        return NextResponse.json({ error: 'Множители kMin/kMax/kRival должны быть числами > 0' }, { status: 400 })
      }
      const offers = await prisma.kaspiOffer.findMany({
        where,
        select: {
          id: true, priceTenge: true, rivalPrice: true, competitorCount: true,
          kaspiSku: true, kaspiName: true,
          product: { select: { costPrice: true, price: true, name: true, sku: true } },
        },
      })
      const updates: { id: string; min: number; max: number }[] = []
      const skippedNoCost: string[] = []
      const skippedMinGtMax: string[] = []
      for (const o of offers) {
        const cost = o.product?.costPrice
        const label = o.product?.sku || o.kaspiSku || o.product?.name || o.id
        if (cost == null || cost <= 0) { skippedNoCost.push(String(label)); continue }
        const min = Math.max(1, Math.round(cost * kMin))
        const hasRival = (o.competitorCount ?? 0) > 0 && o.rivalPrice != null && o.rivalPrice > 1
        const sitePrice = o.product?.price ?? o.priceTenge
        const max = hasRival
          ? Math.max(1, Math.round((o.rivalPrice as number) * kRival))
          : Math.max(1, Math.round(sitePrice * kMax))
        if (min > max) { skippedMinGtMax.push(`${label} (min ${min} > max ${max})`); continue }
        updates.push({ id: o.id, min, max })
      }
      if (updates.length) {
        await prisma.$transaction(
          updates.map((u) => prisma.kaspiOffer.update({
            where: { id: u.id }, data: { minPriceTenge: u.min, maxPriceTenge: u.max },
          }))
        )
      }
      return NextResponse.json({
        ok: true,
        affected: updates.length,
        skippedNoCost: skippedNoCost.length,
        skippedMinGtMax: skippedMinGtMax.length,
        skippedNoCostSamples: skippedNoCost.slice(0, 30),
        skippedMinGtMaxSamples: skippedMinGtMax.slice(0, 30),
      })
    }
    // 🔄 «Скан + просчёт min/max»: ставим отложенный запрос формулы. Воркер на маке
    // при ближайшем прогоне снимет свежие цены конкурентов и применит формулу
    // (см. ingest). value = { kMin, kMax, kRival }.
    case 'scan-minmax-formula': {
      const v = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
      const kMin = Number(v.kMin), kMax = Number(v.kMax), kRival = Number(v.kRival)
      if (![kMin, kMax, kRival].every((x) => Number.isFinite(x) && x > 0)) {
        return NextResponse.json({ error: 'Множители kMin/kMax/kRival должны быть числами > 0' }, { status: 400 })
      }
      const { addMinMaxPending } = await import('@/lib/app-settings')
      await addMinMaxPending(ids, { kMin, kMax, kRival })
      return NextResponse.json({ ok: true, affected: ids.length, queued: true })
    }
    default:
      return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
  }

  return NextResponse.json({ ok: true, affected })
}

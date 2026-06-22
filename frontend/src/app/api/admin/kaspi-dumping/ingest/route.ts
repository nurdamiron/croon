// Приём снятых цен конкурентов от внешнего воркера демпинга.
// Воркер (на резидентном IP) снимает offer-view и шлёт сюда массив результатов;
// сервер считает целевую цену (computeTargetPrice) и применяет (applyDumping →
// KaspiOffer.priceTenge → фид). Сервер сам в Kaspi НЕ ходит (его IP заблокирован).
//
// Аутентификация секретом: ?secret=CRON_SECRET или Bearer.
//
// Тело: { dryRun?: boolean, results: [{ offerId, offers: [{price, merchantId, merchantName?, rating?, reviews?, kaspiDelivery?, deliveryDuration?}], error?: string }] }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFlag, KASPI_DUMPING_ENABLED, getMinMaxPending, clearMinMaxPending } from '@/lib/app-settings'
import { computeTargetPrice, applyDumping, type DumpingConfig, type CompetitorOffer } from '@/lib/kaspi-dumping'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
  const dryRun = !!body.dryRun
  // scan-режим: только снять позицию/цену лидера для ВСЕХ офферов, цену НЕ менять,
  // глобальный флаг демпинга НЕ требуется (наполняем колонку «Поз.» в админке).
  const scan = body.scan === true

  const enabled = await getFlag(KASPI_DUMPING_ENABLED, false)
  if (!enabled && !scan) return NextResponse.json({ ok: true, skipped: true, reason: 'KASPI_DUMPING_ENABLED=false' })
  // applyHere=true (по умолчанию, фид-режим): сервер пишет цену в БД сразу (фид отдаст).
  // applyHere=false (кабинет-режим): сервер только СЧИТАЕТ target и возвращает changes
  //   с sku/model/stock; цену применяет воркер в кабинете, в БД пишем после подтверждения
  //   (POST /confirm). Так цена в БД не разъезжается с тем, что реально ушло в Kaspi.
  const applyHere = body.applyHere !== false
  const results: any[] = Array.isArray(body.results) ? body.results : []
  if (!results.length) return NextResponse.json({ error: 'results пуст' }, { status: 400 })

  // Грузим конфиги нужных офферов одним запросом.
  const ids = results.map((r) => String(r.offerId)).filter(Boolean)
  const offers = await prisma.kaspiOffer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, productId: true, priceTenge: true, kaspiSku: true, kaspiName: true,
      stockOverride: true,
      product: { select: { totalStock: true, reservedStock: true, price: true, costPrice: true } },
      autoDownscale: true, autoUpscale: true, minPriceTenge: true, maxPriceTenge: true,
      dumpingStep: true, strategy: true, ignoreMerchants: true,
    },
  })
  const byId = new Map(offers.map((o) => [o.id, o]))

  // Множитель комиссии Kaspi — для маржинальной цены «один в карточке» (сайт×mult).
  const { getKaspiCommissionMult } = await import('@/lib/app-settings')
  const commissionMult = await getKaspiCommissionMult()

  // Отложенные запросы «скан + просчёт min/max» по формуле (из кнопки в админке).
  const minmaxPending = await getMinMaxPending()
  const minmaxApplied: string[] = [] // offerId, которым выставили min/max — снимем из pending

  let checked = 0, changed = 0, errors = 0
  const changes: any[] = []

  for (const r of results) {
    const o = byId.get(String(r.offerId))
    if (!o) continue
    checked++

    // Воркер сообщил об ошибке снятия — фиксируем, цену не трогаем.
    if (r.error) {
      errors++
      await prisma.kaspiOffer.update({
        where: { id: o.id },
        data: { lastDumpCheckAt: new Date(), lastDumpError: String(r.error) },
      }).catch(() => {})
      continue
    }

    const rawOffers: any[] = Array.isArray(r.offers) ? r.offers : []
    const competitorOffers: CompetitorOffer[] = rawOffers
      .map((x) => ({
        price: Math.round(Number(x.price)),
        merchantId: String(x.merchantId ?? ''),
        merchantName: String(x.merchantName ?? ''),
        rating: x.rating != null ? Number(x.rating) : null,
        reviews: x.reviews != null ? Number(x.reviews) : null,
        kaspiDelivery: !!x.kaspiDelivery,
        deliveryDuration: x.deliveryDuration != null ? String(x.deliveryDuration) : null,
      }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0)
      .sort((a, b) => a.price - b.price)

    // ⚡ «Скан + просчёт min/max»: если по офферу есть отложенный запрос формулы,
    // считаем min/max ПО СВЕЖИМ ценам конкурентов (только что снятым воркером) и
    // пишем их в оффер. Дальше computeTargetPrice уже использует новые границы.
    const formula = minmaxPending[o.id]
    if (formula) {
      const cost = o.product?.costPrice
      if (cost != null && cost > 0) {
        const min = Math.max(1, Math.round(cost * formula.kMin))
        // конкурент = самый дешёвый из снятых (кроме нас — воркер уже не включает себя);
        // «мы одни», если конкурентов в выдаче нет.
        const rival = competitorOffers.length > 0 ? competitorOffers[0].price : null
        const sitePrice = o.product?.price ?? o.priceTenge
        const max = rival != null
          ? Math.max(1, Math.round(rival * formula.kRival))
          : Math.max(1, Math.round(sitePrice * formula.kMax))
        if (min <= max) {
          await prisma.kaspiOffer.update({
            where: { id: o.id }, data: { minPriceTenge: min, maxPriceTenge: max },
          }).catch(() => {})
          // обновим локальную копию, чтобы computeTargetPrice ниже взял новые границы
          o.minPriceTenge = min
          o.maxPriceTenge = max
        }
        // min>max → не трогаем (конкурент ниже нашего пола); запрос всё равно снимаем
      }
      minmaxApplied.push(o.id) // снять запрос (даже если пропущен по себесу/конфликту)
    }

    const config: DumpingConfig = {
      currentPrice: o.priceTenge,
      autoDownscale: o.autoDownscale,
      autoUpscale: o.autoUpscale,
      minPriceTenge: o.minPriceTenge,
      maxPriceTenge: o.maxPriceTenge,
      dumpingStep: o.dumpingStep,
      strategy: o.strategy,
      ignoreMerchants: o.ignoreMerchants,
      sitePrice: o.product?.price ?? null,   // цена на сайте → ×mult когда нет конкурентов
      costPrice: o.product?.costPrice ?? null, // закуп → floor одиночного (не ниже costPrice×mult)
      commissionMult,
    }

    const result = computeTargetPrice(config, competitorOffers)
    const stock = o.stockOverride != null
      ? Math.max(0, o.stockOverride)
      : Math.max(0, (o.product?.totalStock ?? 0) - (o.product?.reservedStock ?? 0))

    if (scan) {
      // Только метрики: позиция/цена лидера/число конкурентов. Цену НЕ трогаем.
      await applyDumping({ offerId: o.id, productId: o.productId,
        result: { ...result, target: null }, dryRun: false, error: null })
      continue
    }

    if (applyHere) {
      // Фид-режим: пишем цену в БД сразу (фид отдаст Kaspi через ~час).
      const applied = await applyDumping({ offerId: o.id, productId: o.productId, result, dryRun, error: null })
      if (applied.changed) {
        changed++
        changes.push({ offerId: o.id, sku: o.kaspiSku, model: o.kaspiName || '', stock,
          old: o.priceTenge, new: applied.newPrice, status: result.status, position: result.ourPosition })
      } else {
        // обновим метрики даже если цена не менялась — applyDumping это сделал
      }
    } else {
      // Кабинет-режим: НЕ пишем цену в БД, только метрики; target возвращаем воркеру.
      await applyDumping({ offerId: o.id, productId: o.productId,
        result: { ...result, target: null }, dryRun: false, error: null }) // metrics only
      if (result.target != null && result.target !== o.priceTenge) {
        changed++
        changes.push({ offerId: o.id, sku: o.kaspiSku, model: o.kaspiName || '', stock,
          old: o.priceTenge, new: result.target, status: result.status, position: result.ourPosition })
      }
    }
  }

  // снять отложенные запросы формулы по обработанным офферам
  if (minmaxApplied.length) await clearMinMaxPending(minmaxApplied).catch(() => {})

  return NextResponse.json({ ok: true, dryRun, applyHere, checked, changed, errors, minmaxApplied: minmaxApplied.length, changes: changes.slice(0, 200) })
}

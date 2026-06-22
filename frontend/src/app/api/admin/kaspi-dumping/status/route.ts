// Сводка статуса демпинга для дашборда (по секрету ?secret=CRON_SECRET или Bearer).
// Агрегаты позиций/готовности из БД + глобальный флаг + last-seen воркера.
// Лёгкий (только count'ы), безопасно дёргать раз в 10-30с с локального дашборда.
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getFlag, setFlag, getString, KASPI_DUMPING_ENABLED, KASPI_WORKER_LAST_SEEN, getKaspiCommissionMult } from '@/lib/app-settings'

export const dynamic = 'force-dynamic'

// Constant-time сравнение секрета. Предпочитаем заголовок Authorization: Bearer;
// query ?secret= оставлен фолбэком для совместимости с остальным демпинг-протоколом
// (tasks/ingest/confirm так устроены, воркер дёргает через query). Дашборд шлёт header.
function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return safeEq(auth.slice(7), secret)
  const qs = req.nextUrl.searchParams.get('secret')
  return qs ? safeEq(qs, secret) : false
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const A = { active: true } as const
  const [
    active, downOn, upOn, downNoFloor, withComp, alone,
    pos1, pos2, pos3, pos4plus, noCost, notChecked, stale24h,
    enabled, lastSeen, mult,
  ] = await Promise.all([
    prisma.kaspiOffer.count({ where: A }),
    prisma.kaspiOffer.count({ where: { ...A, autoDownscale: true } }),
    prisma.kaspiOffer.count({ where: { ...A, autoUpscale: true } }),
    prisma.kaspiOffer.count({ where: { ...A, autoDownscale: true, minPriceTenge: null } }),
    prisma.kaspiOffer.count({ where: { ...A, competitorCount: { gt: 0 } } }),
    prisma.kaspiOffer.count({ where: { ...A, competitorCount: 0, lastDumpCheckAt: { not: null } } }),
    prisma.kaspiOffer.count({ where: { ...A, ourPosition: 1 } }),
    prisma.kaspiOffer.count({ where: { ...A, ourPosition: 2 } }),
    prisma.kaspiOffer.count({ where: { ...A, ourPosition: 3 } }),
    prisma.kaspiOffer.count({ where: { ...A, ourPosition: { gte: 4 } } }),
    prisma.kaspiOffer.count({ where: { ...A, product: { OR: [{ costPrice: null }, { costPrice: { lte: 0 } }] } } }),
    prisma.kaspiOffer.count({ where: { ...A, lastDumpCheckAt: null } }),
    prisma.kaspiOffer.count({ where: { ...A, lastDumpCheckAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    getFlag(KASPI_DUMPING_ENABLED, false),
    getString(KASPI_WORKER_LAST_SEEN),
    getKaspiCommissionMult(),
  ])

  // Разводим «тоталы» явно (чтобы числа на дашборде читались однозначно):
  //  onSale     — «в продаже» как в кабинете Kaspi = активный оффер + товар в наличии.
  //               (kaspiUrl/slug НЕ требуем — это про витрину нашего сайта, а не про
  //               факт продажи на Kaspi; иначе счётчик занижался на ~6-8 товаров.)
  //  outOfStock — есть активный оффер, но склад 0 (Kaspi не показывает → «не вижу товар»)
  //  notVisible — конкуренты есть, но мы не в выдаче (дорого/глубоко) — зона роста
  const feedRows = await prisma.kaspiOffer.findMany({
    where: { active: true },
    select: {
      stockOverride: true, availableOverride: true, ourPosition: true, competitorCount: true,
      product: { select: { totalStock: true, reservedStock: true, inStock: true } },
    },
  })
  let onSale = 0, outOfStock = 0, notVisible = 0
  for (const o of feedRows) {
    const avail = Math.max(0, (o.product?.totalStock ?? 0) - (o.product?.reservedStock ?? 0))
    const stock = o.stockOverride != null ? Math.max(0, o.stockOverride) : avail
    const inStock = o.availableOverride != null ? !!o.availableOverride : !!(o.product?.inStock && stock > 0)
    if (inStock) onSale++
    else outOfStock++
    if ((o.competitorCount ?? 0) > 0 && o.ourPosition == null) notVisible++
  }

  // карта kaspiSku → реальная ссылка на карточку Kaspi (для коротких артикулов
  // вроде «905», по которым прямую ссылку из PID не построить — берём из БД).
  const urlRows = await prisma.kaspiOffer.findMany({
    where: { active: true, kaspiUrl: { not: null } },
    select: { kaspiSku: true, kaspiUrl: true },
  })
  const skuUrl: Record<string, string> = {}
  for (const u of urlRows) if (u.kaspiSku && u.kaspiUrl) skuUrl[u.kaspiSku] = u.kaspiUrl

  // последние применённые цены (из лога изменений)
  const recentLog = await prisma.productChangeLog.findMany({
    where: { source: 'kaspi-dumping', field: 'price' },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { createdAt: true, oldValue: true, newValue: true, detail: true,
      product: { select: { name: true, sku: true } } },
  })

  return NextResponse.json({
    enabled,
    workerLastSeen: lastSeen,
    commissionMult: mult,
    offers: { active, onSale, outOfStock, notVisible, downOn, upOn, downNoFloor, withComp, alone, noCost, notChecked, stale24h },
    positions: { pos1, pos2, pos3, pos4plus, alone },
    skuUrl,
    recentLog: recentLog.map(r => ({
      at: r.createdAt.toISOString(),
      name: r.product?.name?.slice(0, 40) ?? null,
      sku: r.product?.sku ?? null,
      old: r.oldValue, new: r.newValue, detail: r.detail,
    })),
    generatedAt: new Date().toISOString(),
  })
}

// POST { enabled: boolean } — переключить глобальный флаг демпинга (для дашборда,
// по Bearer-секрету). Отдельно от /switches (там cookie-сессия ADMIN).
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled:boolean обязателен' }, { status: 400 })
  await setFlag(KASPI_DUMPING_ENABLED, body.enabled)
  return NextResponse.json({ ok: true, enabled: body.enabled })
}

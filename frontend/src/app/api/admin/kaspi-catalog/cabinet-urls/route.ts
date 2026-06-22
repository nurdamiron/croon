// Приём маппинга артикул → Kaspi PID/ссылка из кабинета продавца.
// Кабинет (offer-view/list) отдаёт по каждому офферу: sku (наш артикул) → masterSku
// (Kaspi product-id) + shopLink. Скрипт на маке (где залогинен кабинет) снимает это
// и шлёт сюда; сервер заполняет KaspiCatalogEntry (pid/url) и создаёт/обновляет
// KaspiOffer, привязывая к товару по артикулу. Прод сам в кабинет не ходит (IP заблокирован).
//
// Аутентификация секретом: ?secret=CRON_SECRET или Bearer.
//
// Тело: { items: [{ sku: "1490", pid: "476632361", shopLink?: "https://kaspi.kz/shop/p/-476632361/" }] }
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const qs = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || qs === secret
}

function urlFromPid(pid: string): string {
  return `https://kaspi.kz/shop/p/-${pid}/?c=750000000`
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const items: Array<{ sku?: string; pid?: string; shopLink?: string }> = Array.isArray(body.items) ? body.items : []
  if (!items.length) return NextResponse.json({ error: 'items пуст' }, { status: 400 })

  let catalogUpdated = 0, offersLinked = 0, skippedNoProduct = 0, skippedNoPid = 0
  const linkedSkus: string[] = []
  const noProductSkus: string[] = []

  for (const it of items) {
    const sku = String(it.sku ?? '').trim()
    const pid = String(it.pid ?? '').trim()
    if (!sku) continue
    if (!pid || !/^\d{5,}$/.test(pid)) { skippedNoPid++; continue }
    const url = (it.shopLink && /^https?:\/\//.test(it.shopLink)) ? it.shopLink : urlFromPid(pid)

    // 1) заполнить каталог (pid/url) по артикулу-карточке
    const cat = await prisma.kaspiCatalogEntry.findUnique({ where: { kaspiSku: sku }, select: { id: true, name: true, priceTenge: true, brand: true, storeId: true, cityId: true, available: true } })
    if (cat) {
      await prisma.kaspiCatalogEntry.update({
        where: { kaspiSku: sku },
        data: { kaspiProductId: pid, kaspiUrl: url },
      })
      catalogUpdated++
    }

    // 2) товар по артикулу
    const prod = await prisma.product.findFirst({ where: { sku, archived: false }, select: { id: true, name: true, price: true } })
    if (!prod) { skippedNoProduct++; if (noProductSkus.length < 50) noProductSkus.push(sku); continue }

    // 3) защита от дублей: один pid не должен висеть на другом товаре
    const conflict = await prisma.kaspiOffer.findFirst({
      where: { productId: { not: prod.id }, OR: [{ kaspiSku: pid }, { kaspiSku: { startsWith: pid + '_' } }] },
      select: { id: true },
    })
    if (conflict) { continue }

    // 4) создать/обновить оффер по артикулу (биндим к товару, ставим url)
    const price = cat?.priceTenge && cat.priceTenge > 0 ? cat.priceTenge : (prod.price || 1)
    await prisma.kaspiOffer.upsert({
      where: { kaspiSku: sku },
      create: {
        kaspiSku: sku,
        productId: prod.id,
        priceTenge: Math.max(1, price),
        kaspiUrl: url,
        kaspiStoreId: cat?.storeId || '30383258_PP1',
        cityId: cat?.cityId || '750000000',
        kaspiName: cat?.name || prod.name || null,
        kaspiBrand: cat?.brand ?? null,
        active: cat?.available ?? true,
      },
      update: {
        productId: prod.id,
        kaspiUrl: url,
        ...(cat?.name ? { kaspiName: cat.name } : {}),
      },
    })
    offersLinked++
    if (linkedSkus.length < 50) linkedSkus.push(sku)
  }

  return NextResponse.json({
    ok: true,
    received: items.length,
    catalogUpdated,
    offersLinked,
    skippedNoProduct,
    skippedNoPid,
    linkedSkus,
    noProductSkus,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/admin/kaspi-sync-offers — полная синхронизация офферов из кабинета Kaspi.
// Принимает массив офферов с полными данными (SKU, имя, картинки, цена, остаток, PID).
// Создаёт/обновляет KaspiCatalogEntry, KaspiOffer, привязывает к Product по SKU,
// синхронизирует изображения.
//
// Auth: ?secret=CRON_SECRET или Bearer <CRON_SECRET>
// Body: { offers: [{ sku, name, brand, pid, shopLink, price, stock, images[], active }] }
//        force?: boolean — перезаписать картинки даже если уже есть

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const qs = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || qs === secret
}

interface OfferInput {
  sku: string
  name?: string
  brand?: string | null
  pid?: string
  shopLink?: string
  price?: number
  stock?: number
  images?: string[]
  active?: boolean
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const offers: OfferInput[] = Array.isArray(body.offers) ? body.offers : []
  const force = !!body.force

  if (!offers.length) return NextResponse.json({ error: 'offers пуст' }, { status: 400 })

  let catalogUpserted = 0, offersLinked = 0, imagesSynced = 0, skipped = 0

  for (const o of offers) {
    const sku = String(o.sku ?? '').trim()
    if (!sku) { skipped++; continue }

    // 1) KaspiCatalogEntry — upsert
    try {
      await prisma.kaspiCatalogEntry.upsert({
        where: { kaspiSku: sku },
        create: {
          kaspiSku: sku,
          kaspiProductId: o.pid || null,
          kaspiUrl: o.shopLink || (o.pid ? `https://kaspi.kz/shop/p/-${o.pid}/` : null),
          name: o.name || sku,
          brand: o.brand || null,
          priceTenge: o.price || 0,
        },
        update: {
          ...(o.pid ? { kaspiProductId: o.pid } : {}),
          ...(o.shopLink || o.pid ? { kaspiUrl: o.shopLink || `https://kaspi.kz/shop/p/-${o.pid}/` } : {}),
          ...(o.name ? { name: o.name } : {}),
          ...(o.brand !== undefined ? { kaspiBrand: o.brand } : {}),
          ...(o.price ? { priceTenge: o.price } : {}),
        },
      })
      catalogUpserted++
    } catch {}

    // 2) Product — найти по SKU
    const product = await prisma.product.findFirst({
      where: { sku, archived: false },
      select: { id: true, name: true, price: true },
    })
    if (!product) { skipped++; continue }

    // 3) KaspiOffer — upsert с привязкой к товару
    try {
      const kaspiUrl = o.shopLink || (o.pid ? `https://kaspi.kz/shop/p/-${o.pid}/` : null)
      await prisma.kaspiOffer.upsert({
        where: { kaspiSku: sku },
        create: {
          kaspiSku: sku,
          productId: product.id,
          priceTenge: o.price || product.price || 1,
          kaspiUrl,
          active: o.active !== false,
          kaspiName: o.name || product.name,
          kaspiBrand: o.brand || null,
        },
        update: {
          productId: product.id,
          ...(kaspiUrl ? { kaspiUrl } : {}),
          ...(o.name ? { kaspiName: o.name } : {}),
          ...(o.price ? { priceTenge: o.price } : {}),
          ...(o.active !== undefined ? { active: o.active } : {}),
        },
      })
      offersLinked++
    } catch {}

    // 4) Images — синхронизировать если переданы
    if (Array.isArray(o.images) && o.images.length > 0) {
      try {
        const existing = await prisma.productImage.findMany({
          where: { productId: product.id },
          select: { id: true, url: true },
        })
        const hasOnlyPlaceholder = existing.length === 0 ||
          existing.every(img => img.url.includes('icon-192x192') || img.url.includes('placeholder'))

        if (hasOnlyPlaceholder || force) {
          await prisma.$transaction([
            prisma.productImage.deleteMany({ where: { productId: product.id } }),
            prisma.productImage.createMany({
              data: o.images.map((url, idx) => ({
                productId: product.id,
                url,
                alt: o.name || product.name,
                sortOrder: idx,
              })),
            }),
          ])
          imagesSynced++
        }
      } catch {}
    }
  }

  return NextResponse.json({
    ok: true,
    received: offers.length,
    catalogUpserted,
    offersLinked,
    imagesSynced,
    skipped,
  })
}

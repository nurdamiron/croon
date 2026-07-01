import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST /api/admin/kaspi-images — принять маппинг SKU→картинки и сохранить в БД.
// Вызывается локальным скриптом kaspi-sync-images.mjs (запускать на маке).
// Защита: ADMIN session или ?secret=CRON_SECRET.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  const qsSecret = request.nextUrl.searchParams.get('secret')
  
  // Проверяем либо admin-сессию, либо secret
  const isSecretOk = secret && (auth === `Bearer ${secret}` || qsSecret === secret)
  
  if (!isSecretOk) {
    // TODO: проверить admin session через NextAuth
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { items, force } = body as {
      items: Array<{ sku: string; images: string[]; kaspiUrl?: string }>
      force?: boolean
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array required' }, { status: 400 })
    }

    let updated = 0, skipped = 0, errors = 0

    for (const item of items) {
      try {
        // Находим товар по SKU
        const product = await prisma.product.findFirst({
          where: { sku: item.sku },
          include: { images: true },
        })

        if (!product) { skipped++; continue }

        // Пропускаем если уже есть картинки и не force
        if (!force) {
          const hasOnlyPlaceholder = product.images.length === 0 ||
            product.images.every(img => 
              img.url.includes('icon-192x192.png') || img.url.includes('placeholder.svg')
            )
          if (!hasOnlyPlaceholder) { skipped++; continue }
        }

        // Записываем картинки
        await prisma.$transaction([
          prisma.productImage.deleteMany({ where: { productId: product.id } }),
          prisma.productImage.createMany({
            data: item.images.map((url, idx) => ({
              productId: product.id,
              url,
              alt: product.name,
              sortOrder: idx,
            })),
          }),
        ])

        // Обновляем kaspiUrl если передан
        if (item.kaspiUrl) {
          await prisma.kaspiOffer.updateMany({
            where: { kaspiSku: item.sku },
            data: { kaspiUrl: item.kaspiUrl },
          })
        }

        updated++
      } catch (e: any) {
        console.error(`Error for SKU ${item.sku}:`, e.message)
        errors++
      }
    }

    return NextResponse.json({ updated, skipped, errors, total: items.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

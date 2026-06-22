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

// Извлечь kaspi SKU из URL вида https://kaspi.kz/shop/p/...-121012404/
// Последовательность цифр (минимум 6) перед опциональным завершающим слешем.
function extractKaspiSku(input: string): string | null {
  const s = input.trim()
  // Сначала пробуем извлечь из URL последний "-<digits>" перед / или концом строки
  const urlMatch = s.match(/-(\d{6,})(?:[/?#]|$)/)
  if (urlMatch) return urlMatch[1]
  // Если введён просто SKU (только цифры/_)
  if (/^[\d_]+$/.test(s) && s.length >= 6) return s
  return null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const offers = await prisma.kaspiOffer.findMany({
    where: { productId: params.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ offers })
}

// Bulk-обновление офферов товара.
// Принимает: { items: [{ id?, url|kaspiSku, priceTenge, active? }] }
// Логика: для каждого item с валидным kaspiSku — upsert.
// Офферы которых нет в items — деактивируются (active=false), не удаляются.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const product = await prisma.product.findUnique({ where: { id: params.id }, select: { id: true, name: true } })
  if (!product) return NextResponse.json({ error: 'Product не найден' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const items: Array<{
    url?: string; kaspiSku?: string; priceTenge: number | string; active?: boolean; kaspiName?: string; kaspiBrand?: string
    // Поштучные настройки демпинга (опционально)
    autoDownscale?: boolean; autoUpscale?: boolean
    minPriceTenge?: number | string | null; maxPriceTenge?: number | string | null
    dumpingStep?: number | string; strategy?: string; dumpPriority?: boolean
    ignoreMerchants?: string[]
  }> = body.items || []

  // Парс числа цены/шага: '' → null, иначе целое >= 0 (или undefined чтобы не трогать).
  const intOrNull = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined
    if (v === null || v === '') return null
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const VALID_STRATEGIES = new Set(['BECOME_FIRST', 'FIRST_MIN_GAP', 'MATCH_FIRST', 'HOLD_SECOND'])

  const errors: string[] = []
  const keepSkus = new Set<string>()

  for (const it of items) {
    const url = (it.url ?? '').toString().trim()
    const raw = (it.kaspiSku ?? url ?? '').toString().trim()
    if (!raw) continue
    const pid = extractKaspiSku(raw)
    if (!pid) {
      errors.push(`Не удалось извлечь SKU из "${raw}"`)
      continue
    }
    // ВАЖНО: Kaspi для модерации ждёт merchant offer SKU из ACTIVE.xml,
    // а не kaspi product id из URL. Ищем merchant SKU в каталоге по
    // kaspiProductId, либо точному совпадению (для simple SKU).
    const catalog = await prisma.kaspiCatalogEntry.findFirst({
      where: { OR: [{ kaspiProductId: pid }, { kaspiSku: pid }] },
    })
    const sku = catalog?.kaspiSku || pid
    if (!catalog) {
      errors.push(`SKU ${pid}: не найден в каталоге Kaspi. Загрузите свежий ACTIVE.xml на /admin/kaspi.`)
    }
    const price = Math.round(Number(it.priceTenge))
    if (!Number.isFinite(price) || price < 1) {
      errors.push(`Цена обязательна для ${sku}`)
      continue
    }
    // Защита от дублей: одна Kaspi-карточка (product-id) не может висеть на
    // нескольких товарах Сайт. Разные карточки на один товар — ок.
    const conflict = await prisma.kaspiOffer.findFirst({
      where: {
        productId: { not: product.id },
        OR: [{ kaspiSku: pid }, { kaspiSku: { startsWith: pid + '_' } }],
      },
      select: { product: { select: { name: true } } },
    })
    if (conflict) {
      errors.push(`Карточка Kaspi ${pid} уже привязана к товару «${conflict.product?.name ?? '?'}». Сначала отвяжите её там.`)
      continue
    }
    const kaspiUrl = url.startsWith('http') ? url : (catalog?.kaspiUrl ?? null)
    keepSkus.add(sku)

    // Поштучные настройки демпинга — пишем только то, что прислали (undefined не трогаем).
    const dump: Record<string, unknown> = {}
    if (it.autoDownscale !== undefined) dump.autoDownscale = !!it.autoDownscale
    if (it.autoUpscale !== undefined) dump.autoUpscale = !!it.autoUpscale
    if (it.dumpPriority !== undefined) dump.dumpPriority = !!it.dumpPriority
    const minP = intOrNull(it.minPriceTenge)
    if (minP !== undefined) dump.minPriceTenge = minP
    const maxP = intOrNull(it.maxPriceTenge)
    if (maxP !== undefined) dump.maxPriceTenge = maxP
    const step = intOrNull(it.dumpingStep)
    if (step !== undefined && step !== null) dump.dumpingStep = step
    if (it.strategy !== undefined && VALID_STRATEGIES.has(it.strategy)) dump.strategy = it.strategy
    if (Array.isArray(it.ignoreMerchants)) dump.ignoreMerchants = it.ignoreMerchants.filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim())

    try {
      await prisma.kaspiOffer.upsert({
        where: { kaspiSku: sku },
        update: {
          productId: product.id,
          priceTenge: price,
          active: it.active !== false,
          kaspiName: it.kaspiName ?? catalog?.name ?? undefined,
          kaspiBrand: it.kaspiBrand ?? catalog?.brand ?? undefined,
          kaspiUrl: kaspiUrl ?? undefined,
          ...dump,
        },
        create: {
          kaspiSku: sku,
          productId: product.id,
          priceTenge: price,
          active: it.active !== false,
          kaspiName: it.kaspiName || catalog?.name || null,
          kaspiBrand: it.kaspiBrand || catalog?.brand || null,
          kaspiUrl,
          ...dump,
        },
      })
    } catch (e) {
      errors.push(`SKU ${sku}: ${(e as Error).message}`)
    }
  }

  // Деактивировать оффера товара, которых нет в новом списке
  await prisma.kaspiOffer.updateMany({
    where: { productId: product.id, kaspiSku: { notIn: Array.from(keepSkus) } },
    data: { active: false },
  })

  const offers = await prisma.kaspiOffer.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ offers, errors })
}

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

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const offers = await prisma.kaspiOffer.findMany({
    include: {
      product: { select: { id: true, name: true, slug: true, totalStock: true, inStock: true, price: true } },
    },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ offers })
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const { kaspiSku, productId, priceTenge, kaspiStoreId, kaspiName, kaspiBrand, cityId } = body || {}
  if (!kaspiSku || !productId) {
    return NextResponse.json({ error: 'kaspiSku и productId обязательны' }, { status: 400 })
  }
  const product = await prisma.product.findUnique({ where: { id: String(productId) }, select: { id: true, price: true } })
  if (!product) {
    return NextResponse.json({ error: 'Product не найден' }, { status: 404 })
  }

  // Подтянуть данные из KaspiCatalogEntry если не переданы явно
  const sku = String(kaspiSku).trim()
  const catalog = await prisma.kaspiCatalogEntry.findUnique({ where: { kaspiSku: sku } })

  // Защита от дублей: одна Kaspi-карточка (kaspi product-id) не может быть
  // привязана к нескольким товарам Alash. Несколько РАЗНЫХ карточек на один
  // товар — разрешены. Сравниваем по product-id (часть SKU до "_").
  //
  // ВАЖНО: только для СОСТАВНЫХ SKU вида "PID_storeId". Короткий числовой
  // артикул (напр. "109") НЕ является kaspi product-id — нельзя ловить дубль
  // через startsWith("109_"), т.к. LIKE '109\_%' ложно матчит длинные PID с
  // тем же числовым префиксом (напр. "109074052_..."). Для коротких артикулов
  // дубль = строго точное совпадение kaspiSku.
  const isComposite = /_/.test(sku)
  const conflict = isComposite
    ? await prisma.kaspiOffer.findFirst({
        where: {
          productId: { not: product.id },
          OR: [{ kaspiSku: sku.split('_')[0] }, { kaspiSku: { startsWith: sku.split('_')[0] + '_' } }],
        },
        select: { kaspiSku: true, productId: true, product: { select: { name: true } } },
      })
    : await prisma.kaspiOffer.findFirst({
        where: { productId: { not: product.id }, kaspiSku: sku },
        select: { kaspiSku: true, productId: true, product: { select: { name: true } } },
      })
  if (conflict) {
    const pidLabel = isComposite ? sku.split('_')[0] : sku
    return NextResponse.json({
      error: `Эта карточка Kaspi (${pidLabel}) уже привязана к товару «${conflict.product?.name ?? conflict.productId}». Одну карточку нельзя привязать к разным товарам — сначала отвяжите её там.`,
    }, { status: 409 })
  }

  // Цена: переданная → из каталога → из товара Alash (для офферов без цены в XML).
  const finalPrice = priceTenge
    ? Math.round(Number(priceTenge))
    : (catalog?.priceTenge && catalog.priceTenge > 0 ? catalog.priceTenge : Math.round(product.price || 0))
  if (!finalPrice) {
    return NextResponse.json({ error: 'Цена не задана: нет ни в каталоге Kaspi, ни у товара на сайте. Укажите цену товара.' }, { status: 400 })
  }

  const offer = await prisma.kaspiOffer.upsert({
    where: { kaspiSku: sku },
    create: {
      kaspiSku: sku,
      productId: product.id,
      priceTenge: finalPrice,
      kaspiStoreId: kaspiStoreId || catalog?.storeId || '30383258_PP1',
      cityId: cityId || catalog?.cityId || '750000000',
      kaspiName: kaspiName ?? catalog?.name ?? null,
      kaspiBrand: kaspiBrand ?? catalog?.brand ?? null,
      kaspiUrl: catalog?.kaspiUrl ?? null,
      active: true,
    },
    update: {
      productId: product.id,
      priceTenge: finalPrice,
      kaspiName: kaspiName ?? catalog?.name ?? undefined,
      kaspiBrand: kaspiBrand ?? catalog?.brand ?? undefined,
      kaspiUrl: catalog?.kaspiUrl ?? undefined,
    },
  })
  return NextResponse.json({ offer })
}

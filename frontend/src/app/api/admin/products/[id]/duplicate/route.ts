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

// Транслит рус/каз → латиница для slug (как в редакторе товара).
const SLUG_MAP: Record<string, string> = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
  'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
  'у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y',
  'ь':'','э':'e','ю':'yu','я':'ya','ә':'a','і':'i','ң':'n','ғ':'g','ү':'u','ұ':'u',
  'қ':'q','ө':'o','һ':'h',
}
function toSlug(str: string): string {
  return str.toLowerCase().split('').map((c) => SLUG_MAP[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Уникальный slug: base, base-2, base-3 … пока не свободен.
async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'tovar'
  let slug = root
  let i = 2
  while (await prisma.product.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${i++}`
  }
  return slug
}

// Дублировать товар: копируем ВСЁ кроме name/sku (их задаёт админ) и slug (генерим).
// Остатки/брони НЕ копируем (новый товар — склад 0, не в наличии). Офферы каналов
// (Kaspi/Satu/Ba3ar) НЕ копируем — это привязки конкретного товара/SKU.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const skuRaw = body.sku == null ? '' : String(body.sku).trim()
  if (!name) return NextResponse.json({ error: 'Укажите название дубликата' }, { status: 400 })

  const src = await prisma.product.findUnique({
    where: { id: params.id },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      categories: { select: { id: true } },
    },
  })
  if (!src) return NextResponse.json({ error: 'Исходный товар не найден' }, { status: 404 })

  // sku: если задан — проверяем уникальность; пусто → null (товар без артикула допустим)
  const sku = skuRaw || null
  if (sku) {
    const taken = await prisma.product.findFirst({ where: { sku }, select: { id: true, name: true } })
    if (taken) return NextResponse.json({ error: `Артикул «${sku}» уже занят товаром «${taken.name}»` }, { status: 409 })
  }

  const slug = await uniqueSlug(toSlug(name))
  // id товара генерим как в обычном создании (p_<ts>), с уникализацией на случай
  // двух дублей в одну миллисекунду.
  let newId = `p_${Date.now()}`
  let attempt = 0
  while (await prisma.product.findUnique({ where: { id: newId }, select: { id: true } })) {
    newId = `p_${Date.now()}_${++attempt}`
  }

  const created = await prisma.product.create({
    data: {
      id: newId,
      name,
      slug,
      sku,
      // копируем коммерческие/контентные поля
      description: src.description,
      price: src.price,
      oldPrice: src.oldPrice,
      costPrice: src.costPrice,
      weight: src.weight,
      metaTitle: src.metaTitle,
      metaDescription: src.metaDescription,
      badgeText: src.badgeText,
      variantAttributes: src.variantAttributes,
      categoryId: src.categoryId,
      // новый товар: склад/бронь с нуля, не в наличии
      totalStock: 0,
      reservedStock: 0,
      inStock: false,
      archived: false,
      // вторичные категории (many-to-many)
      ...(src.categories.length
        ? { categories: { connect: src.categories.map((c) => ({ id: c.id })) } }
        : {}),
      // фото копируем (тот же S3-url, новый порядок)
      ...(src.images.length
        ? {
            images: {
              create: src.images.map((im, idx) => ({
                url: im.url,
                alt: name,
                sortOrder: im.sortOrder ?? idx,
              })),
            },
          }
        : {}),
    },
    select: { id: true, slug: true, name: true },
  })

  return NextResponse.json({ ok: true, id: created.id, slug: created.slug, name: created.name })
}

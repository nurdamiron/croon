import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { searchProducts } from '@/lib/data'
import { pingIndexNow, productUrl } from '@/lib/indexnow'
import { markSatuDirty } from '@/lib/satu-sync'

async function checkAdmin() {
  if (process.env.NODE_ENV === 'development') {
    return {
      user: {
        id: 'dev-admin-id',
        email: 'admin@alash-electronics.kz',
        name: 'Dev Admin',
        role: 'ADMIN',
      }
    }
  }
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const search = request.nextUrl.searchParams.get('search') || ''
  const categoryId = request.nextUrl.searchParams.get('categoryId') || ''
  const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '25')
  const sortBy = request.nextUrl.searchParams.get('sortBy') || 'sku'
  const sortDir = request.nextUrl.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

  const searchTrim = search.trim()
  const archivedView = request.nextUrl.searchParams.get('archived') === 'on'
  // Сайтовый умный поиск (SKU, нормализация ESP32↔esp32, транслит, раскладка) — без дублей в searchLog.
  // В режиме «Архив» smart-search не используем: searchProducts жёстко фильтрует archived=false.
  const useSmartSearch =
    searchTrim.length > 0 &&
    !categoryId &&
    !archivedView &&
    (searchTrim.length >= 2 || /^\d+$/.test(searchTrim))
  if (useSmartSearch) {
    const { products: spProducts, total, pages } = await searchProducts(searchTrim, page, limit, {
      skipSearchLog: true,
      adminPicker: true,
    })
    const orderedIds = spProducts.map(p => p.id)
    if (orderedIds.length === 0) {
      return NextResponse.json({ products: [], total: 0, pages: 0 })
    }
    const fetched = await prisma.product.findMany({
      where: { id: { in: orderedIds } },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { select: { name: true } },
      },
    })
    const products = orderedIds.map(id => fetched.find(p => p.id === id)!).filter(Boolean)
    return NextResponse.json({ products, total, pages })
  }

  // Фильтр архива: по умолчанию скрываем архивные; ?archived=on → ТОЛЬКО архивные.
  const archivedFilter = request.nextUrl.searchParams.get('archived') === 'on'

  const conditions: any[] = []
  conditions.push({ archived: archivedFilter })

  if (search) {
    conditions.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ],
    })
  }

  // Include all descendant categories when filtering
  let categoryIds: string[] = []
  if (categoryId) {
    const allCats = await prisma.category.findMany({ select: { id: true, parentId: true } })
    const collectDescendants = (parentId: string, ids: string[]) => {
      ids.push(parentId)
      for (const c of allCats) {
        if (c.parentId === parentId) collectDescendants(c.id, ids)
      }
    }
    collectDescendants(categoryId, categoryIds)
    conditions.push({
      OR: [
        { categoryId: categoryIds.length === 1 ? categoryId : { in: categoryIds } },
        { categories: { some: { id: { in: categoryIds } } } },
      ],
    })
  }

  const where: any = conditions.length > 0 ? { AND: conditions } : {}

  const total = await prisma.product.count({ where })

  let products: any[]

  if (sortBy === 'sku') {
    // SKU теперь на Product (источник истины). Числовой каст для правильной сортировки.
    let sql = `
      SELECT p.id, (CASE WHEN p.sku ~ '^\\d+$' THEN CAST(p.sku AS BIGINT) ELSE NULL END) AS sku_num
      FROM "Product" p
      WHERE p."archived" = ${archivedFilter ? 'true' : 'false'}
    `
    const params: any[] = []

    if (search) {
      params.push(`%${search}%`)
      sql += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`
    }
    if (categoryId) {
      sql += ` AND (p."categoryId" IN (${categoryIds.map((_, i) => `$${params.length + i + 1}`).join(',')}) OR p.id IN (SELECT "B" FROM "_ProductCategories" WHERE "A" IN (${categoryIds.map((_, i) => `$${params.length + categoryIds.length + i + 1}`).join(',')})))`
      params.push(...categoryIds, ...categoryIds)
    }

    sql += ` GROUP BY p.id`
    sql += ` ORDER BY sku_num ${sortDir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`

    params.push(limit)
    sql += ` LIMIT $${params.length}`
    params.push((page - 1) * limit)
    sql += ` OFFSET $${params.length}`

    const sortedIds: any[] = await prisma.$queryRawUnsafe(sql, ...params)
    const ids = sortedIds.map((r: any) => r.id)

    const fetched = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { select: { name: true } },
      },
    })

    // Preserve SQL order
    products = ids.map(id => fetched.find(p => p.id === id)!).filter(Boolean)
  } else {
    // Direct Prisma sort for product fields
    const orderByMap: Record<string, any> = {
      name: { name: sortDir },
      price: { price: sortDir },
      oldPrice: { oldPrice: sortDir },
      totalStock: { totalStock: sortDir },
    }

    products = await prisma.product.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        category: { select: { name: true } },
      },
      orderBy: orderByMap[sortBy] || { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    })
  }

  return NextResponse.json({ products, total, pages: Math.ceil(total / limit) })
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, slug, description, price, oldPrice, costPrice, categoryId, categoryIds, inStock, totalStock, images, weight, metaTitle, metaDescription, badgeText, variants, variantAttributes } = body

  const resolvedCategoryId = categoryId || (categoryIds?.length ? categoryIds[0] : null)
  // Источник истины cost/weight/price — Product (модель «1 карточка = 1 товар»).
  // Тех-вариант ЗЕРКАЛИТ их (на варианте живёт только sku — по нему биндятся каналы).
  // Форсим эти поля в вариант из Product, игнорируя присланные v.* — так рассинхрон
  // невозможен независимо от клиента (форма/скрипт/импорт).
  const mPrice = parseFloat(price) || 0
  const mCost = costPrice ? parseFloat(costPrice) : null
  const mOldPrice = oldPrice ? parseFloat(oldPrice) : null
  const mWeight = weight ? parseFloat(weight) : null
  // SKU теперь и на Product (источник истины для привязок/поиска). Форма кладёт его
  // в variants[0].sku — берём оттуда (или из body.sku) и пишем в Product + зеркалим в вариант.
  const mSku = (body.sku ?? variants?.[0]?.sku) || null
  const productId = `p_${Date.now()}`
  const product = await prisma.product.create({
    data: {
      id: productId,
      name,
      slug,
      description: description || null,
      price: mPrice,
      oldPrice: mOldPrice,
      costPrice: mCost,
      sku: mSku,
      categoryId: resolvedCategoryId || null,
      // новый товар: брони ещё нет → inStock по складу
      inStock: (parseInt(totalStock) || 0) > 0,
      totalStock: parseInt(totalStock) || 0,
      weight: mWeight,
      metaTitle: metaTitle || null,
      metaDescription: metaDescription || null,
      badgeText: (badgeText && String(badgeText).trim()) || null,
      variantAttributes: Array.isArray(variantAttributes) ? variantAttributes : [],
      ...(Array.isArray(categoryIds) && categoryIds.length > 0 && {
        categories: { connect: categoryIds.map((cid: string) => ({ id: cid })) },
      }),
      images: images?.length
        ? {
            create: images.map((url: string, i: number) => ({
              url,
              alt: name,
              sortOrder: i,
            })),
          }
        : undefined,
      // ProductVariant больше не создаётся (миграция «1 карточка = 1 товар»):
      // sku/price/cost/weight/stock живут на Product.
    },
  })

  void pingIndexNow([productUrl(product.slug)])
  return NextResponse.json(product, { status: 201 })
}

export async function PUT(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const session = await getServerSession(authOptions)
    const userName = session?.user?.name || 'Admin'
    const body = await request.json()
    const { id, name, slug, description, price, oldPrice, costPrice, categoryId, categoryIds, inStock, totalStock, images, weight, metaTitle, metaDescription, badgeText, variants, variantAttributes } = body

    // Fetch current product to detect changes
    const current = await prisma.product.findUnique({ where: { id }, select: { price: true, oldPrice: true, totalStock: true, reservedStock: true } })
    // inStock считаем по ДОСТУПНОМУ остатку (склад − бронь), а не по присланному
    // флагу: иначе при складе 2 и брони 2 сайт ошибочно показывал «в наличии».
    const mTotalStock = parseInt(totalStock) || 0
    const reserved = current?.reservedStock ?? 0
    const computedInStock = (mTotalStock - reserved) > 0

    const resolvedCategoryId = categoryId || (categoryIds?.length ? categoryIds[0] : null)
    // Источник истины sku/cost/weight/price — Product. Тех-вариант зеркалит (см. POST).
    const mPrice = parseFloat(price) || 0
    const mCost = costPrice ? parseFloat(costPrice) : null
    const mOldPrice = oldPrice ? parseFloat(oldPrice) : null
    const mWeight = weight ? parseFloat(weight) : null
    const mSku = (body.sku ?? variants?.[0]?.sku) || null
    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        slug,
        description: description || null,
        price: mPrice,
        oldPrice: mOldPrice,
        costPrice: mCost,
        sku: mSku,
        categoryId: resolvedCategoryId || null,
        ...(Array.isArray(categoryIds) && {
          categories: { set: categoryIds.map((cid: string) => ({ id: cid })) },
        }),
        inStock: computedInStock,
        totalStock: mTotalStock,
        weight: weight ? parseFloat(weight) : null,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        badgeText: (badgeText && String(badgeText).trim()) || null,
        ...(Array.isArray(variantAttributes) && { variantAttributes }),
      },
    })

    // Log price/stock changes
    if (current) {
      const logs: { productId: string; field: string; oldValue: number; newValue: number; source: string; detail: string }[] = []
      const newPrice = parseFloat(price) || 0
      const newOldPrice = oldPrice ? (parseFloat(oldPrice) || 0) : 0
      const newTotalStock = parseInt(totalStock) || 0
      if (current.price !== newPrice) logs.push({ productId: id, field: 'price', oldValue: current.price, newValue: newPrice, source: 'admin', detail: `пользователем ${userName}` })
      if ((current.oldPrice || 0) !== newOldPrice) logs.push({ productId: id, field: 'oldPrice', oldValue: current.oldPrice || 0, newValue: newOldPrice, source: 'admin', detail: `пользователем ${userName}` })
      if (current.totalStock !== newTotalStock) logs.push({ productId: id, field: 'totalStock', oldValue: current.totalStock, newValue: newTotalStock, source: 'admin', detail: `пользователем ${userName}` })
      if (logs.length > 0) await prisma.productChangeLog.createMany({ data: logs })
      // Остаток правили вручную → синхронизировать с Satu.
      if (current.totalStock !== newTotalStock) await markSatuDirty([id]).catch(() => {})
    }

    if (Array.isArray(images)) {
      await prisma.$transaction([
        prisma.productImage.deleteMany({ where: { productId: id } }),
        ...(images.length > 0
          ? [prisma.productImage.createMany({
              data: images.map((url: string, i: number) => ({
                productId: id,
                url,
                alt: name,
                sortOrder: i,
              })),
            })]
          : []),
      ])
    }

    // ProductVariant больше не пересоздаётся (миграция «1 карточка = 1 товар»):
    // sku/price/cost/weight/stock живут на Product (обновлены выше в product.update).

    void pingIndexNow([productUrl(product.slug)])
    return NextResponse.json(product)
  } catch (err: any) {
    console.error('PUT /api/admin/products error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, permanent } = await request.json()
  if (!id) return NextResponse.json({ error: 'id обязателен' }, { status: 400 })

  try {
    // По умолчанию «Удалить» = АРХИВ (для ЛЮБОГО товара): скрыть с сайта/Google/каналов,
    // деактивировать офферы. Ничего физически не удаляется, всё можно вернуть.
    // permanent:true (кнопка «удалить навсегда» в архиве) → физическое удаление.
    if (!permanent) {
      await prisma.$transaction([
        prisma.product.update({ where: { id }, data: { archived: true, inStock: false } }),
        prisma.kaspiOffer.updateMany({ where: { productId: id }, data: { active: false } }),
        prisma.satuProduct.updateMany({ where: { productId: id }, data: { active: false } }),
      ])
      return NextResponse.json({
        ok: true,
        archived: true,
        message: 'Товар отправлен в архив (скрыт с сайта, Google и каналов). Вернуть — в админке через фильтр «Архив».',
      })
    }

    // permanent: физическое удаление. История продаж на сайте (OrderItem, NOT NULL)
    // удалить нельзя без потери аналитики → такой товар оставляем в архиве.
    const soldOnSite = await prisma.orderItem.count({ where: { productId: id } })
    if (soldOnSite > 0) {
      return NextResponse.json({
        error: `Нельзя удалить навсегда: по товару есть ${soldOnSite} продаж на сайте (история заказов). Он останется в архиве — удаление сломало бы аналитику.`,
      }, { status: 409 })
    }

    await prisma.$transaction([
      // обнуляем привязки в истории заказов каналов (productId nullable)
      prisma.kaspiOrderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
      prisma.satuOrderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
      prisma.ba3arOrderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
      prisma.ba3arOrderViewedProduct.updateMany({ where: { productId: id }, data: { productId: null } }),
      prisma.orderViewedProduct.deleteMany({ where: { productId: id } }),
      // привязки-настройки каналов — удаляем
      prisma.satuProduct.deleteMany({ where: { productId: id } }),
      // сам товар (каскад уберёт variants/images/changeLogs/kaspiOffers/favorites)
      prisma.product.delete({ where: { id } }),
    ])

    return NextResponse.json({ ok: true, deleted: true })
  } catch (err: any) {
    console.error('DELETE /api/admin/products error:', err)
    return NextResponse.json({ error: err?.message || 'Не удалось удалить товар' }, { status: 500 })
  }
}

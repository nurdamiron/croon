import { prisma } from './prisma'
import { getFlag, KASPI_SITE_BLOCKS_ENABLED } from './app-settings'

export async function getCategories() {
  return prisma.category.findMany({
    where: { isHidden: false },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      parentId: true,
    },
  })
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({
    where: { slug },
    include: {
      children: {
        where: { isHidden: false },
        orderBy: { sortOrder: 'asc' },
        include: {
          children: {
            where: { isHidden: false },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true, name: true, slug: true,
              children: {
                where: { isHidden: false },
                orderBy: { sortOrder: 'asc' },
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      },
      parent: true,
    },
  })
}

// Collect all descendant IDs from children (including grandchildren)
export function getAllDescendantIds(
  children: { id: string; children?: { id: string }[] }[]
): string[] {
  const ids: string[] = []
  for (const child of children) {
    ids.push(child.id)
    if (child.children) {
      ids.push(...child.children.map(gc => gc.id))
    }
  }
  return ids
}

// Collect ALL descendant category IDs using a single recursive CTE (any depth, including hidden)
// Replaces the old N+1 recursive approach — 1 query instead of O(n) queries
export async function getAllDescendantCategoryIds(parentId: string): Promise<string[]> {
  const result = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM "Category" WHERE "parentId" = ${parentId}
      UNION ALL
      SELECT c.id FROM "Category" c
      INNER JOIN descendants d ON c."parentId" = d.id
    )
    SELECT id::text FROM descendants
  `
  return result.map(r => r.id)
}

export async function getProductsByCategory(
  categoryId: string,
  childIds: string[],
  page: number = 1,
  limit: number = 24,
  sort: string = 'default'
) {
  const allCategoryIds = [categoryId, ...childIds].filter(Boolean)

  const orderBy: any = (() => {
    switch (sort) {
      case 'price_asc': return { price: 'asc' as const }
      case 'price_desc': return { price: 'desc' as const }
      case 'name_asc': return { name: 'asc' as const }
      case 'name_desc': return { name: 'desc' as const }
      default: return { createdAt: 'desc' as const }
    }
  })()

  const where = {
    archived: false, // архивные товары не показываем на сайте
    OR: [
      { categoryId: { in: allCategoryIds } },
      { categories: { some: { id: { in: allCategoryIds } } } },
    ],
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { images: { orderBy: { sortOrder: 'asc' }, take: 2 } },
      orderBy: [{ inStock: 'desc' }, orderBy],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])

  return { products, total, pages: Math.ceil(total / limit) }
}

export async function getProductBySlug(slug: string) {
  // findFirst (не findUnique) — чтобы добавить archived:false: архивный товар → null → 404.
  return prisma.product.findFirst({
    where: { slug, archived: false },
    include: {
      images: { orderBy: { sortOrder: 'asc' } },
      category: {
        include: { parent: { include: { parent: true } } },
      },
      _count: { select: { reviews: { where: { isApproved: true } } } },
    },
  })
}

// Handles old InSales slugs (longer) that no longer exist after migration.
// Finds the current product whose slug is the longest prefix of the given old slug.
// Used to 301-redirect old URLs to their current equivalents.
export async function findProductSlugByOldSlug(oldSlug: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ slug: string }[]>`
    SELECT slug FROM "Product"
    WHERE ${oldSlug} LIKE slug || '%'
      AND slug != ${oldSlug}
    ORDER BY length(slug) DESC
    LIMIT 1
  `
  return rows[0]?.slug ?? null
}

export async function getProductReviewStats(productId: string) {
  const agg = await prisma.review.aggregate({
    where: { productId, isApproved: true },
    _avg: { rating: true },
    _count: { rating: true },
  })
  if (!agg._count.rating) return null
  return { avg: agg._avg.rating!, count: agg._count.rating }
}

export async function getRelatedProducts(productId: string, categoryId: string | null, limit: number = 16) {
  if (!categoryId) return []
  return prisma.product.findMany({
    where: {
      id: { not: productId },
      inStock: true,
      archived: false,
      OR: [
        { categoryId },
        { categories: { some: { id: categoryId } } },
      ],
    },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 2 } },
    take: limit,
  })
}

// «Сопутствующие» — товары из соседних категорий (тот же родитель/раздел).
// Если соседей мало, добираем из той же категории, чтобы блок не пустовал.
export async function getSimilarProducts(
  productId: string,
  categoryId: string | null,
  limit: number = 16,
  excludeIds: string[] = [],
) {
  if (!categoryId) return []
  const include = { images: { orderBy: { sortOrder: 'asc' as const }, take: 2 } }
  const skipIds = new Set([productId, ...excludeIds])

  // 1) Sibling categories first (same parent).
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { parentId: true },
  })
  const parentId = category?.parentId
  let siblingIds: string[] = []
  if (parentId) {
    const siblings = await prisma.category.findMany({
      where: { parentId },
      select: { id: true },
    })
    siblingIds = siblings.map(s => s.id).filter(id => id !== categoryId)
  }

  const fromSiblings = siblingIds.length > 0
    ? await prisma.product.findMany({
        where: {
          categoryId: { in: siblingIds },
          id: { notIn: Array.from(skipIds) },
          inStock: true,
          archived: false,
        },
        include,
        take: limit,
      })
    : []

  if (fromSiblings.length >= limit) return fromSiblings

  // 2) Top up from the same category if siblings didn't fill the block.
  for (const p of fromSiblings) skipIds.add(p.id)
  const sameCategory = await prisma.product.findMany({
    where: {
      id: { notIn: Array.from(skipIds) },
      inStock: true,
      archived: false,
      OR: [
        { categoryId },
        { categories: { some: { id: categoryId } } },
      ],
    },
    include,
    take: limit - fromSiblings.length,
  })

  return [...fromSiblings, ...sameCategory]
}

export async function getPopularProducts(limit: number = 16) {
  return getProductsByCategorySlug('popular', limit)
}

export async function getNewProducts(limit: number = 16) {
  return getProductsByCategorySlug('new', limit)
}

// Keyboard layout mapping: ЙЦУКЕН ↔ QWERTY (wrong layout fix)
// Physical key positions: typing "Фквгштщ" on RU layout = "Arduino" on EN layout
const ruToEn: Record<string, string> = {
  'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p','х':'[','ъ':']',
  'ф':'a','ы':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k','д':'l','ж':';','э':"'",
  'я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m','б':',','ю':'.','.':'/',
}
const enToRu: Record<string, string> = {}
for (const [ru, en] of Object.entries(ruToEn)) enToRu[en] = ru

// Cyrillic ↔ Latin transliteration for search (Ардуино → Arduino, Arduino → Ардуино)
const cyrToLat: Record<string, string> = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
  'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
  'у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'',
  'э':'e','ю':'yu','я':'ya',
}
const latToCyr: Record<string, string> = {
  'a':'а','b':'б','c':'к','d':'д','e':'е','f':'ф','g':'г','h':'х','i':'и','j':'дж',
  'k':'к','l':'л','m':'м','n':'н','o':'о','p':'п','q':'к','r':'р','s':'с','t':'т',
  'u':'у','v':'в','w':'в','x':'кс','y':'й','z':'з',
}
const latDigraphs: [string, string][] = [
  ['sh','ш'],['ch','ч'],['zh','ж'],['sch','щ'],['ts','ц'],['yu','ю'],['ya','я'],['yo','ё'],
]

export function switchLayout(text: string): string | null {
  const lower = text.toLowerCase()
  const hasCyr = /[а-яё]/.test(lower)
  const hasLat = /[a-z]/.test(lower)
  // Only switch if text is purely one script (mixed = intentional)
  if (hasCyr && !hasLat) {
    let switched = ''
    for (const ch of lower) switched += ruToEn[ch] ?? ch
    // Verify it actually changed and looks like Latin
    if (switched !== lower && /[a-z]/.test(switched)) return switched
  }
  if (hasLat && !hasCyr) {
    let switched = ''
    for (const ch of lower) switched += enToRu[ch] ?? ch
    if (switched !== lower && /[а-яё]/.test(switched)) return switched
  }
  return null
}

export function transliterate(text: string): string[] {
  const lower = text.toLowerCase()
  const results: string[] = []

  const cyrCount = (lower.match(/[а-яё]/g) || []).length
  const latCount = (lower.match(/[a-z]/g) || []).length

  if (cyrCount > 0) {
    let lat = ''
    for (const ch of lower) lat += cyrToLat[ch] ?? ch
    if (lat !== lower) results.push(lat)
  }

  if (latCount > 0) {
    let cyr = lower
    for (const [from, to] of latDigraphs) cyr = cyr.split(from).join(to)
    let out = ''
    for (const ch of cyr) out += latToCyr[ch] ?? ch
    if (out !== lower) results.push(out)
  }

  return results
}

export async function searchProducts(
  query: string,
  page: number = 1,
  limit: number = 24,
  options?: { skipSearchLog?: boolean; adminPicker?: boolean; stock?: 'all' | 'instock' | 'outofstock'; categoryId?: string }
) {
  const stockFilter = options?.stock ?? 'all'
  const categoryId = options?.categoryId
  // Если задана категория — собираем ВСЕ её дочерние ID (рекурсивно) + саму её id.
  // getAllDescendantCategoryIds возвращает только потомков; если категория листовая,
  // вернётся пустой массив — поэтому добавляем сам id явно, иначе фильтр не сработает.
  const categoryIds = categoryId
    ? [categoryId, ...await getAllDescendantCategoryIds(categoryId).catch(() => [])]
    : []
  const trimmed = query.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  const normalizedQuery = trimmed.replace(/[-_\s]+/g, '')
  const translit = transliterate(trimmed)
  // Wrong keyboard layout: "Фквгштщ" → "arduino", "fhlebyj" → "ардуино"
  const layoutSwitch = switchLayout(trimmed)
  if (layoutSwitch) {
    translit.push(layoutSwitch)
    // Also transliterate the layout-switched version
    translit.push(...transliterate(layoutSwitch))
  }

  // Build patterns for SQL
  const exactPattern = `%${trimmed}%`
  const normalizedPattern = `%${normalizedQuery}%`

  // Build WHERE with SKU search via subquery
  let whereClause = `(p.name ILIKE $1 OR p.description ILIKE $1`
  whereClause += ` OR REPLACE(REPLACE(REPLACE(p.name, '-', ''), ' ', ''), '_', '') ILIKE $2`
  whereClause += ` OR REPLACE(REPLACE(REPLACE(p.description, '-', ''), ' ', ''), '_', '') ILIKE $2`
  whereClause += ` OR p.sku ILIKE $1`
  const params: any[] = [exactPattern, normalizedPattern]

  // Add transliterated variants (Ардуино ↔ Arduino)
  for (const t of translit) {
    params.push(`%${t}%`)
    whereClause += ` OR p.name ILIKE $${params.length} OR p.description ILIKE $${params.length}`
    const tNorm = t.replace(/[-_\s]+/g, '')
    if (tNorm !== t) {
      params.push(`%${tNorm}%`)
      whereClause += ` OR REPLACE(REPLACE(REPLACE(p.name, '-', ''), ' ', ''), '_', '') ILIKE $${params.length}`
    }
  }

  // Add individual word matching, track param indices for multi-word scoring.
  // Short words (< 4 chars, e.g. "ик", "esp") use a whole-word regex ~* to avoid matching
  // them as suffixes inside longer words ("датч**ик**", "dec**esp**" etc.).
  // Longer words use fast ILIKE substring matching.
  const wordParamIdxs: number[] = []
  const wordParamIsRegex: boolean[] = []
  if (words.length > 1) {
    for (const w of words) {
      const isShort = w.length < 4
      if (isShort) {
        // Whole-word boundary regex: won't match "ик" inside "датчик"
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        params.push(`(^|[^а-яёА-ЯЁa-zA-Z0-9])${escaped}([^а-яёА-ЯЁa-zA-Z0-9]|$)`)
        whereClause += ` OR p.name ~* $${params.length} OR p.description ~* $${params.length}`
      } else {
        params.push(`%${w}%`)
        whereClause += ` OR p.name ILIKE $${params.length} OR p.description ILIKE $${params.length}`
      }
      wordParamIdxs.push(params.length)
      wordParamIsRegex.push(isShort)
    }
  }
  whereClause += `)`

  // Архивные товары скрываем в публичном поиске. В админ-пикере (adminPicker)
  // тоже не нужны (архив — отдельный фильтр на странице товаров, не в поиске).
  whereClause += ` AND p."archived" = false`

  // Stock filter (если задан) — сужает выборку ДО подсчёта total, поэтому
  // пагинация и счётчик «Найдено: N» отражают именно отфильтрованное число.
  if (stockFilter === 'instock') whereClause += ` AND p."inStock" = true`
  else if (stockFilter === 'outofstock') whereClause += ` AND p."inStock" = false`

  // Сужение по категории (primary p."categoryId" ИЛИ many-to-many _ProductCategories).
  if (categoryIds.length > 0) {
    // массив id передаём как один параметр через PostgreSQL ANY($n::text[])
    params.push(categoryIds)
    const paramIdx = params.length
    whereClause += ` AND (
      p."categoryId" = ANY($${paramIdx}::text[])
      OR EXISTS (SELECT 1 FROM "_ProductCategories" pc WHERE pc."B" = p.id AND pc."A" = ANY($${paramIdx}::text[]))
    )`
  }

  // Count
  const countResult: { count: bigint }[] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as count FROM "Product" p WHERE ${whereClause}`,
    ...params
  )
  const total = Number(countResult[0].count)

  // Helper: build the right SQL comparison per word (regex ~* for short, ILIKE for long)
  const wordCmp = (i: number, idx: number, col: string) =>
    wordParamIsRegex[idx] ? `${col} ~* $${i}` : `${col} ILIKE $${i}`

  // Multi-word scoring expressions (only meaningful when words.length > 1)
  // allInName: all query words appear in name → best name match
  // allAnywhere: all words appear somewhere (name OR desc) → good overall match
  // wordCountInName: how many words matched in name → secondary sort
  const allInName = wordParamIdxs.length > 0
    ? wordParamIdxs.map((i, idx) => wordCmp(i, idx, 'p.name')).join(' AND ')
    : 'false'
  const allAnywhere = wordParamIdxs.length > 0
    ? wordParamIdxs.map((i, idx) => `(${wordCmp(i, idx, 'p.name')} OR ${wordCmp(i, idx, 'p.description')})`).join(' AND ')
    : 'false'
  const wordCountInName = wordParamIdxs.length > 0
    ? wordParamIdxs.map((i, idx) => `(CASE WHEN ${wordCmp(i, idx, 'p.name')} THEN 1 ELSE 0 END)`).join(' + ')
    : '0'

  // Blended relevance + stock scoring:
  // Exact matches (SKU / full name) always surface first regardless of stock status.
  // Partial / fuzzy matches prefer in-stock items over out-of-stock ones.
  // Score bands:
  //   0 — exact SKU match (any stock)
  //   1 — exact name or all-words-in-name, IN stock
  //   2 — normalized name match, IN stock
  //   3 — all-words anywhere or exact in description, IN stock
  //   4 — exact name or all-words-in-name, OUT of stock
  //   5 — normalized name match, OUT of stock
  //   6 — all-words anywhere or exact in description, OUT of stock
  //   7 — partial match, IN stock
  //   8 — partial match, OUT of stock
  // adminPicker: сначала совпадение в названии (не только в описании), затем остальная логика
  const adminOrderPrefix = options?.adminPicker
    ? `CASE WHEN p.name ILIKE $1 THEN 0 ELSE 1 END,`
    : ''
  const orderClause = `
    ORDER BY
      ${adminOrderPrefix}
      CASE
        WHEN p.sku ILIKE $1 THEN 0
        WHEN ((${allInName}) OR p.name ILIKE $1) AND p."inStock" THEN 1
        WHEN REPLACE(REPLACE(REPLACE(p.name, '-', ''), ' ', ''), '_', '') ILIKE $2 AND p."inStock" THEN 2
        WHEN ((${allAnywhere}) OR p.description ILIKE $1) AND p."inStock" THEN 3
        WHEN (${allInName}) OR p.name ILIKE $1 THEN 4
        WHEN REPLACE(REPLACE(REPLACE(p.name, '-', ''), ' ', ''), '_', '') ILIKE $2 THEN 5
        WHEN (${allAnywhere}) OR p.description ILIKE $1 THEN 6
        WHEN p."inStock" THEN 7
        ELSE 8
      END,
      ${wordParamIdxs.length > 0 ? `-(${wordCountInName})` : 'LENGTH(p.name)'},
      LENGTH(p.name) ASC,
      p."createdAt" DESC
  `

  params.push(limit, (page - 1) * limit)
  const sortedIds: { id: string }[] = await prisma.$queryRawUnsafe(
    `SELECT p.id FROM "Product" p WHERE ${whereClause} ${orderClause} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    ...params
  )
  const ids = sortedIds.map(r => r.id)

  const fetched = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 2 } },
  })

  const products = ids.map(id => fetched.find(p => p.id === id)!).filter(Boolean)

  // If few results, suggest a corrected query via pg_trgm similarity (не для админ-подбора товара)
  let suggestion: string | null = null
  if (!options?.adminPicker && total <= 2 && trimmed.length >= 3) {
    try {
      const suggestions: { word: string; sim: number }[] = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT lower(word) as word, similarity(lower(word), lower($1)) as sim
        FROM (
          SELECT unnest(string_to_array(regexp_replace(name, '[^a-zA-Zа-яА-ЯёЁ0-9 ]', ' ', 'g'), ' ')) as word
          FROM "Product"
        ) words
        WHERE length(word) > 2 AND similarity(lower(word), lower($1)) > 0.25 AND lower(word) != lower($1)
        ORDER BY sim DESC
        LIMIT 1
      `, trimmed)
      if (suggestions.length > 0) {
        suggestion = suggestions[0].word
      }
    } catch {
      // pg_trgm might not be available, skip
    }
  }

  // Log search query asynchronously (don't block response; skip for internal/admin tools)
  if (!options?.skipSearchLog) {
    prisma.searchLog.create({
      data: { query: trimmed.slice(0, 200), resultsCount: total },
    }).catch(() => {})
  }

  return { products, total, pages: Math.ceil(total / limit), suggestion }
}

export async function getProductsByCategorySlug(slug: string, limit: number = 16) {
  const category = await prisma.category.findUnique({
    where: { slug },
    include: { children: { select: { id: true } } },
  })
  if (!category) return []
  const categoryIds = [category.id, ...category.children.map(c => c.id)]
  return prisma.product.findMany({
    where: {
      OR: [
        { categoryId: { in: categoryIds } },
        { categories: { some: { id: { in: categoryIds } } } },
      ],
      inStock: true,
      archived: false,
    },
    include: { images: { orderBy: { sortOrder: 'asc' }, take: 2 } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

export async function getPage(slug: string) {
  return prisma.page.findUnique({ where: { slug } })
}

export async function getBlogPost(slug: string) {
  return prisma.blogPost.findUnique({ where: { slug } })
}

export async function getAllProductSlugs() {
  return prisma.product.findMany({
    where: { archived: false }, // архивные не в sitemap (Google перестанет показывать)
    select: { slug: true, updatedAt: true },
  })
}

export async function getAllCategorySlugs() {
  return prisma.category.findMany({
    where: { isHidden: false },
    select: { slug: true },
  })
}

export async function getAllPageSlugs() {
  return prisma.page.findMany({
    select: { slug: true },
  })
}

export async function getAllBlogPosts() {
  return prisma.blogPost.findMany({
    select: { slug: true, blogSlug: true },
  })
}

export async function getBlogPostsByBlog(blogSlug: string) {
  return prisma.blogPost.findMany({
    where: { blogSlug },
    select: { slug: true, blogSlug: true, title: true, content: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
}

// Данные для блока «Купить на Kaspi.kz» на странице товара.
// Показ управляется полем KaspiOffer.showOnSite:
//   showOnSite = null  → авто: показываем если товар реально доступен на Kaspi,
//                        т.е. active (в фиде) И available (avl=yes). Так блок не
//                        ведёт на карточку, где товара по факту нет.
//   showOnSite = true  → показываем всегда (даже если снят с фида/недоступен)
//   showOnSite = false → не показываем
// Плюс нужны заполненный kaspiName и ссылка на карточку Kaspi (из оффера или
// из каталога KaspiCatalogEntry по merchant SKU). Возвращает { url } или null.
export async function getKaspiBuyData(productId: string): Promise<{ url: string } | null> {
  // АВАРИЙНЫЙ ТУМБЛЕР: если выключен — убираем блок «Купить на Kaspi» со ВСЕХ
  // карточек сайта одним нажатием. Включение возвращает всё как было.
  if (!(await getFlag(KASPI_SITE_BLOCKS_ENABLED))) return null

  const offer = await prisma.kaspiOffer.findFirst({
    where: {
      productId,
      kaspiName: { not: null },
      NOT: { kaspiName: '' },
    },
    select: {
      kaspiSku: true, kaspiUrl: true, active: true, showOnSite: true,
      availableOverride: true, stockOverride: true,
      product: { select: { totalStock: true, reservedStock: true, inStock: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  if (!offer) return null

  // Доступность как в фиде: availableOverride важнее, иначе stock>0 && inStock.
  const stock = offer.stockOverride != null
    ? Math.max(0, offer.stockOverride)
    : Math.max(0, offer.product.totalStock - offer.product.reservedStock)
  const available = offer.availableOverride != null
    ? offer.availableOverride
    : (stock > 0 && offer.product.inStock)

  // Решение показа: явный showOnSite важнее. auto = active И available.
  const show = offer.showOnSite ?? (offer.active && available)
  if (!show) return null

  if (offer.kaspiUrl) return { url: offer.kaspiUrl }

  // URL не в оффере — ищем в каталоге по merchant SKU
  const cat = await prisma.kaspiCatalogEntry.findFirst({
    where: { kaspiSku: offer.kaspiSku, kaspiUrl: { not: null } },
    select: { kaspiUrl: true },
  })
  if (cat?.kaspiUrl) return { url: cat.kaspiUrl }

  return null
}

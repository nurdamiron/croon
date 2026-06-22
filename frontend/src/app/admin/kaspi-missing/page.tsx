import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { getPostponedProductIds } from '@/lib/app-settings'
import KaspiMissingClient from './KaspiMissingClient'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

// Товары, которых НЕТ на Kaspi = у Product нет НИ ОДНОГО активного KaspiOffer.
// Отсюда привязываем существующую карточку Kaspi (вставить URL → создаётся оффер).
// «Отложенные» (B2B и т.п.) скрыты из основного списка, доступны в виде view=postponed.
type SortKey = 'name' | 'price' | 'stock' | 'sum'

export default async function KaspiMissingPage({
  searchParams,
}: {
  searchParams: { q?: string; stock?: string; page?: string; sort?: string; dir?: string; view?: string }
}) {
  await requireAdmin()
  const q = (searchParams.q || '').trim()
  const stockOnly = searchParams.stock === 'yes' // только товары в наличии
  const view = searchParams.view === 'postponed' ? 'postponed' : 'active'
  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  const sort: SortKey = (['name', 'price', 'stock', 'sum'] as const).includes(searchParams.sort as SortKey)
    ? (searchParams.sort as SortKey)
    : 'sum' // дефолт — по сумме (Цена × Остаток), чтобы крупные «залежи» сверху
  const dir: 'asc' | 'desc' = searchParams.dir === 'asc' ? 'asc' : 'desc'

  const postponedIds = await getPostponedProductIds()

  const where: any = {
    // нет активного оффера Kaspi
    NOT: { kaspiOffers: { some: { active: true } } },
  }
  // Основной список — без отложенных; вид «Отложенные» — только они.
  if (view === 'postponed') {
    where.id = { in: postponedIds.length ? postponedIds : ['__none__'] }
  } else if (postponedIds.length) {
    where.id = { notIn: postponedIds }
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (stockOnly) {
    where.totalStock = { gt: 0 }
  }

  // Грузим ВСЕ товары без оффера (обычно сотни) — сортировка по «Сумме» (Цена×Остаток)
  // вычисляемая, в Prisma orderBy её не выразить, поэтому считаем и сортируем в JS.
  const products = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      totalStock: true,
      reservedStock: true,
      inStock: true,
      sku: true,
      images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      _count: { select: { kaspiOffers: true } },
    },
  })

  const allRows = products.map((p) => {
    const available = Math.max(0, p.totalStock - (p.reservedStock ?? 0))
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      price: p.price,
      sku: p.sku ?? null,
      imageUrl: p.images[0]?.url ?? null,
      available,
      sum: p.price * available, // реальный объём товара в деньгах
      inStock: p.inStock,
      hadOffer: p._count.kaspiOffers > 0, // были офферы, но все неактивны
      postponed: view === 'postponed', // в виде «Отложенные» — все отложены
    }
  })

  // Сортировка по выбранной колонке.
  const mult = dir === 'asc' ? 1 : -1
  allRows.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'ru') * mult
    const av = sort === 'price' ? a.price : sort === 'stock' ? a.available : a.sum
    const bv = sort === 'price' ? b.price : sort === 'stock' ? b.available : b.sum
    return (av - bv) * mult
  })

  const total = allRows.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const rows = allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Нет на Kaspi</h1>
        <p className="text-sm text-gray-500 mt-1">
          Товары сайта без активного оффера на Kaspi. Вставьте ссылку на карточку Kaspi и нажмите «Выложить» —
          товар начнёт продаваться от нас. Карточка должна уже существовать на Kaspi (есть в каталоге ACTIVE.xml).
        </p>
      </div>
      <KaspiMissingClient
        rows={rows}
        q={q}
        stockOnly={stockOnly}
        page={page}
        totalPages={totalPages}
        total={total}
        sort={sort}
        dir={dir}
        view={view}
        postponedCount={postponedIds.length}
      />
    </div>
  )
}

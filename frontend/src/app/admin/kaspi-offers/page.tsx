import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import KaspiOffersClient from './KaspiOffersClient'

export const dynamic = 'force-dynamic'

export default async function KaspiOffersPage() {
  await requireAdmin()
  const offers = await prisma.kaspiOffer.findMany({
    include: {
      product: { select: { id: true, name: true, slug: true, totalStock: true, inStock: true, price: true } },
    },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
  })

  const total = offers.length
  const active = offers.filter(o => o.active).length
  const outOfStock = offers.filter(o => o.active && o.product.totalStock <= 0).length

  const serialized = offers.map(o => ({
    id: o.id,
    kaspiSku: o.kaspiSku,
    kaspiName: o.kaspiName,
    kaspiBrand: o.kaspiBrand,
    kaspiStoreId: o.kaspiStoreId,
    cityId: o.cityId,
    priceTenge: o.priceTenge,
    active: o.active,
    productId: o.productId,
    productName: o.product.name,
    productSlug: o.product.slug,
    productPrice: o.product.price,
    totalStock: o.product.totalStock,
    inStock: o.product.inStock,
    stockOverride: o.stockOverride,
    availableOverride: o.availableOverride,
    preOrder: o.preOrder,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kaspi офферы</h1>
          <p className="text-sm text-gray-500 mt-1">
            Связь карточек Kaspi с товарами сайта. Фид: <code className="bg-gray-100 px-1.5 py-0.5 rounded">/api/kaspi/feed.xml</code>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Всего офферов</div>
          <div className="text-2xl font-bold mt-1">{total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Активных</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{active}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Без остатка</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{outOfStock}</div>
        </div>
      </div>

      <KaspiOffersClient offers={serialized} />
    </div>
  )
}

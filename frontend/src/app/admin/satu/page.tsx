import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import SatuClient from './SatuClient'

export const dynamic = 'force-dynamic'

export default async function SatuPage({ searchParams }: { searchParams: { q?: string; link?: string } }) {
  await requireAdmin()
  const q = (searchParams.q || '').trim()
  const link = searchParams.link // undefined | 'yes' | 'no'

  const where: any = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q } },
    ]
  }
  if (link === 'yes') where.productId = { not: null }
  if (link === 'no') where.productId = null

  const products = await prisma.satuProduct.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500,
    include: {
      product: { select: { id: true, name: true, slug: true, totalStock: true, reservedStock: true, inStock: true } },
    },
  })

  const total = await prisma.satuProduct.count()
  const linked = await prisma.satuProduct.count({ where: { productId: { not: null } } })

  const rows = products.map(s => ({
    id: s.id,
    satuId: s.satuId,
    sku: s.sku,
    name: s.name,
    presence: s.presence,
    price: s.price,
    active: s.active,
    lastPushedAt: s.lastPushedAt ? s.lastPushedAt.toISOString() : null,
    product: s.product ? {
      id: s.product.id,
      name: s.product.name,
      slug: s.product.slug,
      available: Math.max(0, s.product.totalStock - s.product.reservedStock),
      inStock: s.product.inStock,
    } : null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Satu.kz</h1>
        <p className="text-sm text-gray-500 mt-1">
          Товары Satu и привязка к товарам Alash. Остатки отправляются в Satu (push).
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Товаров Satu</div>
          <div className="text-2xl font-bold mt-1">{total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Привязано к Alash</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{linked}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Без привязки</div>
          <div className="text-2xl font-bold mt-1 text-gray-400">{total - linked}</div>
        </div>
      </div>

      <SatuClient rows={rows} q={q} link={link} total={total} linked={linked} />
    </div>
  )
}

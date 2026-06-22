import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import SatuOrdersClient from './SatuOrdersClient'
import { SATU_OPEN_STATUSES, SATU_CLOSED_STATUSES } from '@/lib/satu-constants'

export const dynamic = 'force-dynamic'

export default async function SatuOrdersPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  await requireAdmin()
  const status = (searchParams.status || '').trim()
  const q = (searchParams.q || '').trim()

  const where: any = {}
  if (status === 'open') where.status = { in: SATU_OPEN_STATUSES }
  else if (status === 'closed') where.status = { in: SATU_CLOSED_STATUSES }
  else if (status) where.status = status
  if (q) {
    where.OR = [
      { satuOrderId: { contains: q } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q } },
    ]
  }

  const orders = await prisma.satuOrder.findMany({
    where,
    orderBy: { creationDate: 'desc' },
    take: 200,
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true, name: true,
              images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          },
        },
      },
    },
  })

  const grouped = await prisma.satuOrder.groupBy({ by: ['status'], _count: { _all: true } })
  const counts: Record<string, number> = {}
  let total = 0
  for (const g of grouped) { counts[g.status] = g._count._all; total += g._count._all }
  counts.open = SATU_OPEN_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)
  counts.closed = SATU_CLOSED_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)

  const rows = orders.map(o => ({
    id: o.id,
    satuOrderId: o.satuOrderId,
    status: o.status,
    stockApplied: o.stockApplied,
    totalPrice: o.totalPrice,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    creationDate: o.creationDate ? o.creationDate.toISOString() : null,
    items: o.items.map(it => ({
      id: it.id, sku: it.sku, name: it.name, quantity: it.quantity, price: it.price,
      product: it.product ? { id: it.product.id, name: it.product.name } : null,
      imageUrl: it.product?.images?.[0]?.url ?? null,
    })),
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-600 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white">Satu</span>
        <h1 className="text-xl font-semibold text-gray-900">Заказы Satu</h1>
      </div>
      <SatuOrdersClient rows={rows} status={status} q={q} counts={counts} total={total} />
    </div>
  )
}

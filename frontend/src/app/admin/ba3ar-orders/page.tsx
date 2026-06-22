import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import Ba3arOrdersClient from './Ba3arOrdersClient'
import { BA3AR_OPEN_STATUSES, BA3AR_CLOSED_STATUSES } from '@/lib/ba3ar-constants'

export const dynamic = 'force-dynamic'

export default async function Ba3arOrdersPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  await requireAdmin()
  const status = (searchParams.status || '').trim()
  const q = (searchParams.q || '').trim()

  const where: any = {}
  if (status === 'open') where.status = { in: [...BA3AR_OPEN_STATUSES] }
  else if (status === 'closed') where.status = { in: [...BA3AR_CLOSED_STATUSES] }
  else if (status) where.status = status
  if (q) {
    where.OR = [
      { ba3arOrderId: { contains: q } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q } },
    ]
    const qNum = parseInt(q, 10)
    if (Number.isFinite(qNum)) where.OR.push({ orderNumber: qNum })
  }

  const orders = await prisma.ba3arOrder.findMany({
    where,
    orderBy: { createdAt: 'desc' },
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

  const grouped = await prisma.ba3arOrder.groupBy({ by: ['status'], _count: { _all: true } })
  const counts: Record<string, number> = {}
  let total = 0
  for (const g of grouped) { counts[g.status] = g._count._all; total += g._count._all }
  counts.open = BA3AR_OPEN_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)
  counts.closed = BA3AR_CLOSED_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0)

  const rows = orders.map(o => ({
    id: o.id,
    ba3arOrderId: o.ba3arOrderId,
    orderNumber: o.orderNumber,
    status: o.status,
    stockApplied: o.stockApplied,
    isPreorder: o.isPreorder,
    totalPrice: o.totalPrice,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    email: o.email,
    deliveryName: o.deliveryName,
    paymentName: o.paymentName,
    address: o.address,
    comment: o.comment,
    createdAt: o.createdAt.toISOString(),
    items: o.items.map(it => ({
      id: it.id, sku: it.sku, name: it.name, quantity: it.quantity, price: it.price,
      product: it.product ? { id: it.product.id, name: it.product.name } : null,
      imageUrl: it.product?.images?.[0]?.url ?? null,
    })),
  }))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          Ba3ar
        </span>
        <h1 className="text-xl font-semibold text-gray-900">Заказы Ba3ar</h1>
      </div>
      <Ba3arOrdersClient rows={rows} status={status} q={q} counts={counts} total={total} />
    </div>
  )
}

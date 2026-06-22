import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { KASPI_UI_ORDER, kaspiUiStatusToWhere, type KaspiUiStatus } from '@/lib/kaspi-ui-status'
import KaspiOrdersClient from './KaspiOrdersClient'

export const dynamic = 'force-dynamic'

export default async function KaspiOrdersPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  await requireAdmin()
  const status = (searchParams.status || '').trim()  // UI-статус: OPLACHEN/UPAKOVKA/...
  const q = (searchParams.q || '').trim()

  const where: any = {}
  if (status) Object.assign(where, kaspiUiStatusToWhere(status))
  if (q) {
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q } },
    ]
  }

  const orders = await prisma.kaspiOrder.findMany({
    where,
    orderBy: { creationDate: 'desc' },
    take: 200,
    include: {
      items: { include: { product: { select: { id: true, name: true, slug: true } } } },
    },
  })

  // Сводка по UI-статусам (UPAKOVKA/PEREDACHA различаются по raw.assembled,
  // поэтому считаем 6 раздельных count — простой и точный путь).
  const countEntries = await Promise.all(
    KASPI_UI_ORDER.map(async (ui) => [ui, await prisma.kaspiOrder.count({ where: kaspiUiStatusToWhere(ui) })] as const)
  )
  const counts: Record<string, number> = {}
  let total = 0
  for (const [ui, n] of countEntries) { counts[ui] = n; total += n }

  const rows = orders.map(o => ({
    id: o.id,
    code: o.code,
    state: o.state,
    status: o.status,
    assembled: !!(o.raw && typeof o.raw === 'object' && (o.raw as Record<string, unknown>).assembled === true),
    stockApplied: o.stockApplied,
    totalPrice: o.totalPrice,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryMode: o.deliveryMode,
    isPreorder: o.isPreorder,
    isKaspiDelivery: o.isKaspiDelivery,
    creationDate: o.creationDate ? o.creationDate.toISOString() : null,
    items: o.items.map(it => ({
      id: it.id,
      kaspiSku: it.kaspiSku,
      kaspiName: it.kaspiName,
      quantity: it.quantity,
      price: it.price,
      product: it.product,
    })),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kaspi заказы</h1>
        <p className="text-sm text-gray-500 mt-1">
          Заказы с Kaspi.kz. Бронь и списание остатков синхронизируются автоматически по статусу заказа.
        </p>
      </div>
      <KaspiOrdersClient rows={rows} status={status} q={q} counts={counts} total={total} />
    </div>
  )
}

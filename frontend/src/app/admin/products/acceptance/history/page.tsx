import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import AcceptanceHistoryClient from './AcceptanceHistoryClient'

export const dynamic = 'force-dynamic'

export default async function AcceptanceHistoryPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  await requireAdmin()

  const page = Math.max(1, parseInt(searchParams.page || '1', 10) || 1)
  const PAGE_SIZE = 20

  const [receipts, total] = await Promise.all([
    prisma.stockReceipt.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        supplier: { select: { id: true, name: true } },
        changeLogs: {
          where: { field: 'totalStock' },
          select: {
            id: true,
            productId: true,
            field: true,
            oldValue: true,
            newValue: true,
            detail: true,
            product: {
              select: {
                name: true,
                sku: true,
                images: { select: { url: true }, take: 1 },
              },
            },
          },
        },
      },
    }),
    prisma.stockReceipt.count(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const rows = receipts.map((r) => ({
    id: r.id,
    batchNumber: r.batchNumber,
    name: r.name,
    supplierName: r.supplier?.name || null,
    notes: r.notes,
    totalItems: r.totalItems,
    totalQty: r.totalQty,
    totalCost: r.totalCost,
    createdAt: r.createdAt.toISOString(),
    items: r.changeLogs.map((log) => ({
      id: log.id,
      productId: log.productId,
      productName: log.product.name,
      productSku: log.product.sku,
      imageUrl: log.product.images[0]?.url || null,
      oldValue: log.oldValue,
      newValue: log.newValue,
      detail: log.detail,
    })),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 leading-tight">История приёмок</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Все операции поступления товаров на склад. Всего партий: {total}
          </p>
        </div>
        <a
          href="/admin/products/acceptance"
          className="bg-admin hover:bg-admin-hover text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
        >
          Новая приёмка
        </a>
      </div>
      <AcceptanceHistoryClient rows={rows} page={page} totalPages={totalPages} total={total} />
    </div>
  )
}

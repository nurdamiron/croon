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
  const PAGE_SIZE = 50

  const [logs, total] = await Promise.all([
    prisma.productChangeLog.findMany({
      where: { source: 'acceptance' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            sku: true,
            images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        },
      },
    }),
    prisma.productChangeLog.count({ where: { source: 'acceptance' } }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const rows = logs.map((log) => ({
    id: log.id,
    productId: log.productId,
    productName: log.product.name,
    productSlug: log.product.slug,
    productSku: log.product.sku,
    imageUrl: log.product.images[0]?.url || null,
    field: log.field,
    oldValue: log.oldValue,
    newValue: log.newValue,
    detail: log.detail,
    createdAt: log.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-gray-900 leading-tight">История приёмок</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Все операции поступления товаров на склад. Всего записей: {total}
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

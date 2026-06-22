import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import SuppliersClient from './SuppliersClient'

export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  await requireAdmin()

  const raw = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { receipts: true } },
    },
  })

  const suppliers = raw.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[26px] font-bold text-gray-900 leading-tight">Поставщики</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          Справочник поставщиков для приёмки товаров. Всего: {suppliers.length}
        </p>
      </div>
      <SuppliersClient initialSuppliers={suppliers} />
    </div>
  )
}

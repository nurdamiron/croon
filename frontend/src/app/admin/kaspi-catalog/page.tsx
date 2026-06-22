import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import KaspiCatalogClient from './KaspiCatalogClient'

export const dynamic = 'force-dynamic'

export default async function KaspiCatalogPage({ searchParams }: { searchParams: { q?: string; bound?: string } }) {
  await requireAdmin()
  const q = (searchParams.q || '').trim()
  const bound = searchParams.bound // '' | 'yes' | 'no'

  const where: any = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { kaspiSku: { contains: q } },
    ]
  }

  const entries = await prisma.kaspiCatalogEntry.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 500,
  })

  // подтянуть привязки к KaspiOffer (по kaspiSku и prefix match)
  const allSkus = entries.map(e => e.kaspiSku)
  const offers = await prisma.kaspiOffer.findMany({
    where: {
      OR: [
        { kaspiSku: { in: allSkus } },
        ...allSkus.map(s => ({ kaspiSku: { startsWith: s.split('_')[0] + '_' } })),
      ],
    },
    include: { product: { select: { id: true, name: true } } },
  })
  const offerBySku = new Map(offers.map(o => [o.kaspiSku, o]))
  // также матчим по prefix (URL-product-id)
  const offerByPrefix = new Map<string, typeof offers[0]>()
  for (const o of offers) {
    const prefix = o.kaspiSku.split('_')[0]
    if (!offerByPrefix.has(prefix)) offerByPrefix.set(prefix, o)
  }

  const rows = entries.map(e => {
    const sku = e.kaspiSku
    const bound = offerBySku.get(sku) || offerByPrefix.get(sku.split('_')[0]) || null
    return {
      id: e.id,
      kaspiSku: sku,
      kaspiUrl: e.kaspiUrl,
      kaspiProductId: e.kaspiProductId,
      name: e.name,
      brand: e.brand,
      priceTenge: e.priceTenge,
      available: e.available,
      productId: bound?.productId || null,
      productName: bound?.product?.name || null,
      offerActive: bound?.active ?? null,
    }
  }).filter(r => {
    if (bound === 'yes') return !!r.productId
    if (bound === 'no') return !r.productId
    return true
  })

  const total = await prisma.kaspiCatalogEntry.count()
  const totalBound = rows.filter(r => r.productId).length
  const totalUnbound = rows.length - totalBound

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kaspi каталог</h1>
          <p className="text-sm text-gray-500 mt-1">
            Локальный справочник офферов Kaspi (источник — ваш ACTIVE/ARCHIVE.xml).
            Используется для автоподстановки названия/бренда/цены при добавлении ссылок в карточку товара.
          </p>
        </div>
        <Link href="/admin/kaspi-offers" className="text-sm text-admin hover:underline">К офферам →</Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Всего в каталоге</div>
          <div className="text-2xl font-bold mt-1">{total}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Привязано к Alash</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{totalBound}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Без привязки</div>
          <div className="text-2xl font-bold mt-1 text-gray-700">{totalUnbound}</div>
        </div>
      </div>

      <KaspiCatalogClient rows={rows} q={q} bound={bound} />
    </div>
  )
}

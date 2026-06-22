import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import CostFixClient from './CostFixClient'

export const dynamic = 'force-dynamic'

// Tinder-режим: большое фото, снизу цена/остаток/себес, поля ввода → сохранил → дальше.
// Два сценария на одной странице (фильтры в клиенте):
//   • простановка СЕБЕСА (товары без costPrice)
//   • простановка ОСТАТКА (товары с себесом, но нет в наличии)
// Архивные (удалённые) товары не показываем.

export default async function CostFixPage() {
  await requireAdmin()

  const products = await prisma.product.findMany({
    where: { archived: false },
    select: {
      id: true,
      name: true,
      slug: true,
      sku: true,
      price: true,
      costPrice: true,
      totalStock: true,
      reservedStock: true,
      inStock: true,
      category: { select: { name: true } },
      images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  })

  const rows = products.map((p) => {
    const available = Math.max(0, p.totalStock - (p.reservedStock ?? 0))
    const hasCost = p.costPrice != null && p.costPrice > 0
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku ?? null,
      price: p.price,
      cost: p.costPrice,
      ratio: hasCost && p.price > 0 ? p.price / (p.costPrice as number) : null,
      available,
      totalStock: p.totalStock,
      reservedStock: p.reservedStock ?? 0,
      inStock: p.inStock,
      hasCost,
      categoryName: p.category?.name ?? null,
      imageUrl: p.images[0]?.url ?? null,
    }
  })

  return <CostFixClient rows={rows} />
}

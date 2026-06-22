// Массовые операции над каталожными записями Kaspi (KaspiCatalogEntry).
// Нужно, чтобы удалять записи БЕЗ оффера (которые не удаляются через kaspi-offers/bulk).
// Удаление каталожной записи НЕ трогает товар Alash — только справочную запись Kaspi.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids : []
  const action: string = body.action || ''
  if (!ids.length) return NextResponse.json({ error: 'ids пуст' }, { status: 400 })

  if (action === 'delete') {
    // Берём SKU удаляемых каталожных записей, чтобы заодно убрать связанные офферы
    // (если вдруг есть) — иначе оффер останется сиротой и вернётся в фид.
    const entries = await prisma.kaspiCatalogEntry.findMany({
      where: { id: { in: ids } }, select: { kaspiSku: true },
    })
    const skus = entries.map(e => e.kaspiSku)
    const bareSkus = skus.map(s => s.split('_')[0])

    const result = await prisma.$transaction(async (tx) => {
      // удаляем офферы по этим SKU (полный или голый product-id)
      const offers = await tx.kaspiOffer.deleteMany({
        where: { kaspiSku: { in: [...skus, ...bareSkus] } },
      })
      // удаляем сами каталожные записи
      const cat = await tx.kaspiCatalogEntry.deleteMany({ where: { id: { in: ids } } })
      return { catalogDeleted: cat.count, offersDeleted: offers.count }
    })

    return NextResponse.json({ ok: true, ...result, affected: result.catalogDeleted })
  }

  return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 })
}

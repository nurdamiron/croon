import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function authorized(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions)
  if (session?.user && (session.user as any).role === 'ADMIN') return true
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const qs = req.nextUrl.searchParams.get('secret')
    if (auth === `Bearer ${secret}` || qs === secret) return true
  }
  return false
}

// Разбор: товары Alash vs Satu — почему есть разница, что можно выложить.
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // SKU/productId, уже представленные на Satu (зеркало)
  const mirror = await prisma.satuProduct.findMany({ select: { sku: true, productId: true } })
  const satuSkus = new Set<string>()
  const satuPids = new Set<string>()
  for (const m of mirror) {
    if (m.sku) satuSkus.add(m.sku.trim())
    if (m.productId) satuPids.add(m.productId)
  }

  // все товары Alash (SKU на Product)
  const products = await prisma.product.findMany({
    select: {
      id: true, inStock: true, sku: true,
    },
  })

  const s = {
    alashTotal: products.length,
    satuMirror: mirror.length,
    onSatuByLink: 0,        // товар Alash уже на Satu (по sku или productId)
    notOnSatu: 0,           // нет на Satu
    notOnSatu_inStock_withSku: 0,    // ← можно выложить
    notOnSatu_outOfStock: 0,         // нет в наличии
    notOnSatu_noSku: 0,              // нет артикула (нельзя связать)
    inStockTotal: 0,
    outOfStockTotal: 0,
    noSkuTotal: 0,
  }

  for (const p of products) {
    const sku = (p.sku || '').trim()
    if (!sku) s.noSkuTotal += 1
    if (p.inStock) s.inStockTotal += 1; else s.outOfStockTotal += 1

    const onSatu = (sku && satuSkus.has(sku)) || satuPids.has(p.id)
    if (onSatu) { s.onSatuByLink += 1; continue }

    s.notOnSatu += 1
    if (!sku) s.notOnSatu_noSku += 1
    else if (!p.inStock) s.notOnSatu_outOfStock += 1
    else s.notOnSatu_inStock_withSku += 1
  }

  return NextResponse.json(s)
}

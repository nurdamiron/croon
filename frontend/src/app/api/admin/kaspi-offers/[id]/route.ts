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

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const data: any = {}
  if (typeof body.active === 'boolean') data.active = body.active
  if (body.priceTenge !== undefined) data.priceTenge = Math.round(Number(body.priceTenge))
  if (body.productId !== undefined) {
    const product = await prisma.product.findUnique({ where: { id: String(body.productId) }, select: { id: true } })
    if (!product) return NextResponse.json({ error: 'Product не найден' }, { status: 404 })
    data.productId = product.id
  }
  if (body.kaspiStoreId !== undefined) data.kaspiStoreId = String(body.kaspiStoreId)
  if (body.cityId !== undefined) data.cityId = String(body.cityId)
  if (body.kaspiName !== undefined) data.kaspiName = body.kaspiName ? String(body.kaspiName) : null
  if (body.kaspiBrand !== undefined) data.kaspiBrand = body.kaspiBrand ? String(body.kaspiBrand) : null
  if (body.stockOverride !== undefined) {
    const v = body.stockOverride
    data.stockOverride = v === null || v === '' ? null : Math.max(0, Math.round(Number(v)))
  }
  if (body.availableOverride !== undefined) {
    data.availableOverride = body.availableOverride === null ? null : Boolean(body.availableOverride)
  }
  if (body.preOrder !== undefined) {
    let v = Math.round(Number(body.preOrder))
    if (!Number.isFinite(v) || v < 0) v = 0
    if (v > 30) v = 30
    data.preOrder = v
  }
  if (body.showOnSite !== undefined) {
    data.showOnSite = body.showOnSite === null ? null : Boolean(body.showOnSite)
  }

  // --- Демпинг ---
  if (body.autoDownscale !== undefined) data.autoDownscale = Boolean(body.autoDownscale)
  if (body.autoUpscale !== undefined) data.autoUpscale = Boolean(body.autoUpscale)
  if (body.dumpPriority !== undefined) data.dumpPriority = Boolean(body.dumpPriority)
  if (body.minPriceTenge !== undefined) {
    const v = body.minPriceTenge
    data.minPriceTenge = v === null || v === '' ? null : Math.max(1, Math.round(Number(v)))
  }
  if (body.maxPriceTenge !== undefined) {
    const v = body.maxPriceTenge
    data.maxPriceTenge = v === null || v === '' ? null : Math.max(1, Math.round(Number(v)))
  }
  if (body.dumpingStep !== undefined) {
    let v = Math.round(Number(body.dumpingStep))
    if (!Number.isFinite(v) || v < 1) v = 1
    data.dumpingStep = v
  }
  if (body.strategy !== undefined) {
    const allowed = ['BECOME_FIRST', 'MATCH_FIRST', 'HOLD_SECOND', 'FIRST_MIN_GAP']
    if (allowed.includes(String(body.strategy))) data.strategy = String(body.strategy)
  }
  if (body.ignoreMerchants !== undefined) {
    data.ignoreMerchants = Array.isArray(body.ignoreMerchants)
      ? body.ignoreMerchants.map((m: any) => String(m)).filter(Boolean)
      : []
  }

  const offer = await prisma.kaspiOffer.update({ where: { id: params.id }, data })
  return NextResponse.json({ offer })
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await prisma.kaspiOffer.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}

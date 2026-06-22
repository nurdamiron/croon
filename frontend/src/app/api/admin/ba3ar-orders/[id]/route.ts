import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { setBa3arOrderStatus } from '@/lib/ba3ar-orders'
import { BA3AR_STATUSES } from '@/lib/ba3ar-constants'

export const dynamic = 'force-dynamic'

async function requireAdminSession() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// GET /api/admin/ba3ar-orders/:id — карточка заказа с позициями и историей.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const order = await prisma.ba3arOrder.findUnique({
    where: { id: params.id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true, name: true, slug: true, totalStock: true, sku: true,
              images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          },
        },
      },
      statusLogs: { orderBy: { createdAt: 'asc' } },
      viewedProducts: {
        include: {
          product: {
            select: {
              id: true, name: true, slug: true, price: true,
              images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
            },
          },
        },
      },
    },
  })
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  return NextResponse.json({
    id: order.id,
    ba3arOrderId: order.ba3arOrderId,
    orderNumber: order.orderNumber,
    status: order.status,
    stockApplied: order.stockApplied,
    isPreorder: order.isPreorder,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    email: order.email,
    deliveryName: order.deliveryName,
    paymentName: order.paymentName,
    address: order.address,
    comment: order.comment,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map(it => ({
      id: it.id, sku: it.sku, name: it.name, quantity: it.quantity, price: it.price,
      product: it.product
        ? {
            id: it.product.id, name: it.product.name, slug: it.product.slug,
            totalStock: it.product.totalStock,
            imageUrl: it.product.images[0]?.url ?? null,
            sku: it.product.sku ?? null,
          }
        : null,
      imageUrl: it.product?.images?.[0]?.url ?? null,
    })),
    statusLogs: order.statusLogs.map(l => ({
      id: l.id, fromStatus: l.fromStatus, toStatus: l.toStatus, note: l.note, createdAt: l.createdAt.toISOString(),
    })),
    viewedProducts: order.viewedProducts.map(v => ({
      id: v.id,
      name: v.product?.name ?? v.name,
      slug: v.product?.slug ?? null,
      price: v.product?.price ?? null,
      imageUrl: v.product?.images?.[0]?.url ?? null,
    })),
  })
}

// PATCH /api/admin/ba3ar-orders/:id — смена статуса (остатки + история) ИЛИ
// правка способа оплаты/доставки (для бухгалтерии и аналитики).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Некорректное тело' }, { status: 400 }) }

  // Правка оплаты/доставки (без смены статуса) — простое обновление полей.
  if (body?.status === undefined && (body?.paymentName !== undefined || body?.deliveryName !== undefined)) {
    const data: { paymentName?: string | null; deliveryName?: string | null } = {}
    if (body.paymentName !== undefined) data.paymentName = body.paymentName ? String(body.paymentName) : null
    if (body.deliveryName !== undefined) data.deliveryName = body.deliveryName ? String(body.deliveryName) : null
    const updated = await prisma.ba3arOrder.update({ where: { id: params.id }, data })
    return NextResponse.json({ ok: true, paymentName: updated.paymentName, deliveryName: updated.deliveryName })
  }

  if (!BA3AR_STATUSES.includes(body?.status)) {
    return NextResponse.json({ error: `Можно: ${BA3AR_STATUSES.join(', ')}` }, { status: 400 })
  }
  const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : undefined
  const result = await setBa3arOrderStatus(params.id, body.status, note)
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}

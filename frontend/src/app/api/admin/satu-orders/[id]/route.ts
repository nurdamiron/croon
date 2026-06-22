import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { setSatuOrderStatusAndStock } from '@/lib/satu-sync'
import type { SatuSettableStatus, SatuCancelReason } from '@/lib/satu-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// GET /api/admin/satu-orders/:id — карточка заказа с позициями и историей.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const order = await prisma.satuOrder.findUnique({
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
    },
  })
  if (!order) return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  return NextResponse.json({
    id: order.id,
    satuOrderId: order.satuOrderId,
    status: order.status,
    stockApplied: order.stockApplied,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    email: order.email,
    deliveryName: order.deliveryName,
    creationDate: order.creationDate ? order.creationDate.toISOString() : null,
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
  })
}

const ALLOWED: SatuSettableStatus[] = ['paid', 'delivered', 'received', 'canceled']

// PATCH /api/admin/satu-orders/:id — сменить статус заказа Satu.
// Тело: { status: 'paid'|'delivered'|'received'|'canceled', reason?: string }
// Пишет статус в Satu + обновляет нашу БД + остатки. pending задать нельзя.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Некорректное тело' }, { status: 400 }) }

  const status = body?.status as SatuSettableStatus
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: `Недопустимый статус. Можно: ${ALLOWED.join(', ')}` }, { status: 400 })
  }
  const reason = (body?.reason === 'duplicate' ? 'duplicate' : 'not_available') as SatuCancelReason

  const result = await setSatuOrderStatusAndStock(params.id, status, reason)
  return NextResponse.json(result, { status: result.ok ? 200 : 207 })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return null
  }
  return session
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const status = request.nextUrl.searchParams.get('status')
  const search = request.nextUrl.searchParams.get('search')
  const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20')

  const where: any = {}
  if (status === 'open') {
    where.status = { in: ['NEW', 'CONFIRMED', 'PROCESSING'] }
  } else if (status === 'closed') {
    where.status = { in: ['SHIPPED', 'DELIVERED', 'PICKED_UP', 'CANCELLED'] }
  } else if (status) {
    where.status = status
  }
  if (search) {
    const num = parseInt(search)
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      ...(Number.isInteger(num) ? [{ orderNumber: num }] : []),
    ]
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: {
          include: { product: { select: { name: true, slug: true } } },
        },
        user: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ])

  return NextResponse.json({ orders, total, pages: Math.ceil(total / limit) })
}

// Restore stock when order is cancelled (only for non-preorder orders)
async function restoreStockIfCancelled(orderId: string, newStatus: string) {
  if (newStatus !== 'CANCELLED') return

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      isPreorder: true,
      items: { select: { productId: true, quantity: true } },
    },
  })

  // Skip if: already cancelled, is a preorder (stock was never decremented), or doesn't exist
  if (!order || order.isPreorder || order.status === 'CANCELLED') return

  for (const item of order.items) {
    await prisma.$executeRaw`
      UPDATE "Product"
      SET
        "totalStock" = "totalStock" + ${item.quantity},
        "inStock"    = true,
        "updatedAt"  = now()
      WHERE id = ${item.productId}
    `
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, ids, status, paymentMethod, deliveryMethod } = await request.json()

  // Bulk status update
  if (ids && Array.isArray(ids) && status) {
    // Restore stock for each order being cancelled
    if (status === 'CANCELLED') {
      for (const orderId of ids) {
        await restoreStockIfCancelled(orderId, status)
      }
    }
    await prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { status },
    })
    return NextResponse.json({ updated: ids.length })
  }

  // Single field update
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  if (status === 'CANCELLED') {
    await restoreStockIfCancelled(id, status)
  }

  const data: any = {}
  if (status) data.status = status
  if (paymentMethod !== undefined) data.paymentMethod = paymentMethod
  if (deliveryMethod !== undefined) data.deliveryMethod = deliveryMethod

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const current = status
      ? await prisma.order.findUnique({ where: { id }, select: { status: true } })
      : null

    const order = await prisma.order.update({ where: { id }, data })

    // Log status change
    if (status && current && status !== current.status) {
      await prisma.orderStatusLog.create({
        data: { orderId: id, status, prevStatus: current.status },
      })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Order update error:', error)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { ids } = await request.json()
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } }),
    prisma.order.deleteMany({ where: { id: { in: ids } } }),
  ])

  return NextResponse.json({ deleted: ids.length })
}

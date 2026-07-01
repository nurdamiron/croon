import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const search = request.nextUrl.searchParams.get('search') || ''
  const page = parseInt(request.nextUrl.searchParams.get('page') || '1')
  const limit = 20

  // Get all Kaspi orders grouped by phone
  const orderWhere: any = {}
  if (search) {
    orderWhere.OR = [
      { customerName: { contains: search, mode: 'insensitive' } },
      { customerPhone: { contains: search } },
    ]
  }

  const orders = await prisma.kaspiOrder.findMany({
    where: orderWhere,
    select: {
      id: true,
      code: true,
      customerName: true,
      customerPhone: true,
      totalPrice: true,
      status: true,
      creationDate: true,
    },
    orderBy: { creationDate: 'desc' },
  })

  // Group by normalized phone
  const normalizePhone = (phone: string) => phone.replace(/[^0-9+]/g, '')
  const clientMap = new Map<string, {
    id: string
    name: string
    phone: string
    email: string | null
    userId: string | null
    firstOrderDate: Date
    lastOrderDate: Date
    orders: { id: string; orderNumber: string | null; total: number; status: string; createdAt: Date }[]
    orderCount: number
    totalSpent: number
  }>()

  for (const order of orders) {
    if (!order.customerPhone) continue
    const key = normalizePhone(order.customerPhone)
    const isCancelled = order.status === 'CANCELLED' || order.status === 'CANCELLING'
    const orderDate = order.creationDate || new Date()
    const existing = clientMap.get(key)
    if (existing) {
      existing.orders.push({
        id: order.id,
        orderNumber: order.code,
        total: order.totalPrice,
        status: order.status,
        createdAt: orderDate,
      })
      existing.orderCount++
      if (!isCancelled) existing.totalSpent += order.totalPrice
      if (orderDate < existing.firstOrderDate) existing.firstOrderDate = orderDate
      if (orderDate > existing.lastOrderDate) {
        existing.lastOrderDate = orderDate
        if (order.customerName) existing.name = order.customerName
      }
    } else {
      clientMap.set(key, {
        id: key,
        name: order.customerName || 'Без имени',
        phone: order.customerPhone,
        email: null,
        userId: null,
        firstOrderDate: orderDate,
        lastOrderDate: orderDate,
        orders: [{
          id: order.id,
          orderNumber: order.code,
          total: order.totalPrice,
          status: order.status,
          createdAt: orderDate,
        }],
        orderCount: 1,
        totalSpent: isCancelled ? 0 : order.totalPrice,
      })
    }
  }

  // Sort by most recent order date
  const allClients = Array.from(clientMap.values())
    .sort((a, b) => b.lastOrderDate.getTime() - a.lastOrderDate.getTime())

  const total = allClients.length
  const paginated = allClients.slice((page - 1) * limit, page * limit)

  // Normalize field names for client response
  const normalizedClients = paginated.map(c => ({
    ...c,
    firstOrder: c.firstOrderDate,
    lastOrder: c.lastOrderDate,
  }))

  return NextResponse.json({
    clients: normalizedClients,
    total,
    pages: Math.ceil(total / limit),
  })
}

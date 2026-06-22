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

  // Get all orders grouped by phone (primary identifier for clients)
  // phone is String (non-nullable) on Order, so no null filter needed
  const orderWhere: any = {}
  if (search) {
    orderWhere.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
    ]
  }

  // Get unique phones with aggregated data using raw grouping
  const orders = await prisma.order.findMany({
    where: orderWhere,
    select: {
      id: true,
      orderNumber: true,
      name: true,
      phone: true,
      email: true,
      total: true,
      status: true,
      createdAt: true,
      userId: true,
    },
    orderBy: { createdAt: 'desc' },
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
    orders: { id: string; orderNumber: number | null; total: number; status: string; createdAt: Date }[]
    orderCount: number
    totalSpent: number  // only non-cancelled orders
  }>()

  for (const order of orders) {
    if (!order.phone) continue
    const key = normalizePhone(order.phone)
    const isCancelled = order.status === 'CANCELLED'
    const existing = clientMap.get(key)
    if (existing) {
      existing.orders.push({
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      })
      existing.orderCount++
      if (!isCancelled) existing.totalSpent += order.total
      // Track oldest order (orders are sorted desc, so last processed = oldest)
      if (order.createdAt < existing.firstOrderDate) existing.firstOrderDate = order.createdAt
      // Use most recent name/email
      if (order.createdAt > existing.lastOrderDate) {
        existing.lastOrderDate = order.createdAt
        if (order.name) existing.name = order.name
        if (order.email) existing.email = order.email
        if (order.userId) existing.userId = order.userId
      }
    } else {
      clientMap.set(key, {
        id: key,
        name: order.name,
        phone: order.phone,
        email: order.email,
        userId: order.userId,
        firstOrderDate: order.createdAt,
        lastOrderDate: order.createdAt,
        orders: [{
          id: order.id,
          orderNumber: order.orderNumber,
          total: order.total,
          status: order.status,
          createdAt: order.createdAt,
        }],
        orderCount: 1,
        totalSpent: isCancelled ? 0 : order.total,
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

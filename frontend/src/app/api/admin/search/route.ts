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

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ orders: [], products: [], clients: [] })
  }

  const isNumeric = /^\d+$/.test(q)

  const [orders, products, clients] = await Promise.all([
    // Search orders by number or customer name
    prisma.order.findMany({
      where: isNumeric
        ? { orderNumber: parseInt(q) }
        : { name: { contains: q, mode: 'insensitive' } },
      select: { id: true, orderNumber: true, name: true, total: true, status: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
    // Search products by name or SKU
    prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { sku: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, price: true, totalStock: true, images: { take: 1, select: { url: true } } },
      take: 5,
    }),
    // Search clients by name, email, or phone
    prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: { id: true, name: true, email: true, phone: true },
      take: 5,
    }),
  ])

  return NextResponse.json({ orders, products, clients })
}

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

  const period = request.nextUrl.searchParams.get('period') || 'week'

  let rows: { label: string; revenue: number; count: number }[] = []

  if (period === 'week') {
    // Last 7 days, grouped by day
    const raw = await prisma.$queryRaw<{ day: Date; count: bigint; revenue: number }[]>`
      SELECT
        DATE_TRUNC('day', "createdAt") AS day,
        COUNT(*) AS count,
        COALESCE(SUM(total), 0) AS revenue
      FROM "Order"
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
        AND status != 'CANCELLED'
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY day ASC
    `
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const found = raw.find(r => r.day.toISOString().split('T')[0] === ds)
      rows.push({
        label: d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' }),
        revenue: found ? Number(found.revenue) : 0,
        count: found ? Number(found.count) : 0,
      })
    }
  } else if (period === 'month') {
    // Last 30 days, grouped by day
    const raw = await prisma.$queryRaw<{ day: Date; count: bigint; revenue: number }[]>`
      SELECT
        DATE_TRUNC('day', "createdAt") AS day,
        COUNT(*) AS count,
        COALESCE(SUM(total), 0) AS revenue
      FROM "Order"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        AND status != 'CANCELLED'
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY day ASC
    `
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      const found = raw.find(r => r.day.toISOString().split('T')[0] === ds)
      rows.push({
        label: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        revenue: found ? Number(found.revenue) : 0,
        count: found ? Number(found.count) : 0,
      })
    }
  } else if (period === 'year') {
    // Last 12 months, grouped by month
    const raw = await prisma.$queryRaw<{ month: Date; count: bigint; revenue: number }[]>`
      SELECT
        DATE_TRUNC('month', "createdAt") AS month,
        COUNT(*) AS count,
        COALESCE(SUM(total), 0) AS revenue
      FROM "Order"
      WHERE "createdAt" >= NOW() - INTERVAL '12 months'
        AND status != 'CANCELLED'
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY month ASC
    `
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const found = raw.find(r => {
        const rm = r.month
        return `${rm.getFullYear()}-${String(rm.getMonth() + 1).padStart(2, '0')}` === ms
      })
      rows.push({
        label: d.toLocaleDateString('ru-RU', { month: 'short', year: i > 0 ? undefined : 'numeric' }),
        revenue: found ? Number(found.revenue) : 0,
        count: found ? Number(found.count) : 0,
      })
    }
  }

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalOrders = rows.reduce((s, r) => s + r.count, 0)

  return NextResponse.json({ rows, totalRevenue, totalOrders })
}

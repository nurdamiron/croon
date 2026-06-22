import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Server-to-server revenue summary for the Biz platform. Auth via shared INTERNAL_API_KEY.
// Aggregates ALL FOUR sales channels (Сайт site, Kaspi, Satu, Ba3ar) over the last 12 months,
// excluding cancelled/returned orders. Each channel reports its own revenue + monthly series;
// `byMonth`/`totalRevenue` are the combined cross-channel totals.

type MonthRow = { month: string; revenue: number; count: bigint }
type ChannelSummary = { revenue: number; ordersCount: number; avgOrderValue: number; byMonth: Array<{ month: string; revenue: number; count: number }> }

function rollUp(rows: MonthRow[]): ChannelSummary {
  const byMonth = rows.map((r) => ({ month: r.month, revenue: r.revenue, count: Number(r.count) }))
  const revenue = byMonth.reduce((s, m) => s + m.revenue, 0)
  const ordersCount = byMonth.reduce((s, m) => s + m.count, 0)
  return { revenue, ordersCount, avgOrderValue: ordersCount ? revenue / ordersCount : 0, byMonth }
}

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key')
  if (!apiKey || apiKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // One monthly-aggregate query per channel. Status filters drop cancelled/returned orders.
  // No user input is interpolated — all SQL is static.
  const [site, kaspi, satu, ba3ar] = await Promise.all([
    prisma.$queryRaw<MonthRow[]>`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COALESCE(SUM("total"), 0)::float AS revenue, COUNT(*) AS count
      FROM "Order"
      WHERE "status" <> 'CANCELLED' AND "createdAt" >= (CURRENT_DATE - INTERVAL '12 months')
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<MonthRow[]>`
      SELECT to_char(date_trunc('month', COALESCE("creationDate", "createdAt")), 'YYYY-MM') AS month,
             COALESCE(SUM("totalPrice"), 0)::float AS revenue, COUNT(*) AS count
      FROM "KaspiOrder"
      WHERE "status" NOT ILIKE '%CANCEL%' AND "status" NOT ILIKE '%RETURN%'
        AND COALESCE("creationDate", "createdAt") >= (CURRENT_DATE - INTERVAL '12 months')
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<MonthRow[]>`
      SELECT to_char(date_trunc('month', COALESCE("creationDate", "createdAt")), 'YYYY-MM') AS month,
             COALESCE(SUM("totalPrice"), 0)::float AS revenue, COUNT(*) AS count
      FROM "SatuOrder"
      WHERE "status" NOT ILIKE '%CANCEL%' AND "status" NOT ILIKE '%REJECT%'
        AND COALESCE("creationDate", "createdAt") >= (CURRENT_DATE - INTERVAL '12 months')
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<MonthRow[]>`
      SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COALESCE(SUM("totalPrice"), 0)::float AS revenue, COUNT(*) AS count
      FROM "Ba3arOrder"
      WHERE "status" NOT ILIKE '%CANCEL%' AND "status" NOT ILIKE '%RETURN%'
        AND "createdAt" >= (CURRENT_DATE - INTERVAL '12 months')
      GROUP BY 1 ORDER BY 1`,
  ])

  const byChannel = { site: rollUp(site), kaspi: rollUp(kaspi), satu: rollUp(satu), ba3ar: rollUp(ba3ar) }

  // Combined cross-channel monthly series
  const combined = new Map<string, { revenue: number; count: number }>()
  for (const ch of Object.values(byChannel)) {
    for (const m of ch.byMonth) {
      const acc = combined.get(m.month) ?? { revenue: 0, count: 0 }
      acc.revenue += m.revenue
      acc.count += m.count
      combined.set(m.month, acc)
    }
  }
  const byMonth = Array.from(combined.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, revenue: v.revenue, count: v.count }))

  const totalRevenue = Object.values(byChannel).reduce((s, c) => s + c.revenue, 0)
  const ordersCount = Object.values(byChannel).reduce((s, c) => s + c.ordersCount, 0)

  return NextResponse.json({
    windowMonths: 12,
    totalRevenue,
    ordersCount,
    avgOrderValue: ordersCount ? totalRevenue / ordersCount : 0,
    byChannel,
    byMonth,
    generatedAt: new Date().toISOString(),
  })
}

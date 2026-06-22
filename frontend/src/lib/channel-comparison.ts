// Сравнение каналов продаж по товарам: Kaspi / Satu / Ba3ar / сайт.
// Для каждого товара — сколько продано и какая маржа на каждом канале за период.
//
// «Продажа» = завершённый заказ канала:
//   Kaspi → COMPLETED
//   Satu  → delivered
//   Ba3ar → delivered | picked_up
//   Сайт  → DELIVERED | PICKED_UP
//
// Маржа: (выручка − закуп − комиссии)/выручка.
//   Kaspi удерживает комиссию + Kaspi Pay + (налог) — берём из KaspiEconomics.
//   Satu/Ba3ar/сайт — свои каналы, маркетплейс-комиссии нет (0). Налог применяем
//   ко всем каналам одинаково (это налог продавца, а не канала).

import { prisma } from './prisma'
import { getKaspiEconomics } from './app-settings'

export type ChannelKey = 'kaspi' | 'satu' | 'ba3ar' | 'site'
export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  kaspi: 'Kaspi',
  satu: 'Satu',
  ba3ar: 'Ba3ar',
  site: 'Сайт',
}

export type ChannelCell = {
  qty: number
  revenue: number
  profit: number | null // null если нет себестоимости
  marginPct: number | null
}

export type ChannelProductRow = {
  productId: string
  name: string
  sku: string | null
  costPrice: number | null
  byChannel: Record<ChannelKey, ChannelCell>
  totalQty: number
  totalRevenue: number
  bestChannel: ChannelKey | null // где выше маржа (при наличии продаж и себеса)
}

export type ChannelTotals = Record<ChannelKey, { qty: number; revenue: number; profit: number; orders: number }>

export type ChannelComparison = {
  rows: ChannelProductRow[]
  totals: ChannelTotals
  generatedAt: string
}

const emptyCell = (): ChannelCell => ({ qty: 0, revenue: 0, profit: null, marginPct: null })

export async function computeChannelComparison({ from, to }: { from: Date; to: Date }): Promise<ChannelComparison> {
  const econ = await getKaspiEconomics()

  const [kaspiOrders, satuOrders, ba3arOrders, siteOrders] = await Promise.all([
    // «Продажа» = заказ поступил и не отменён/не возвращён (считаем сразу).
    prisma.kaspiOrder.findMany({
      where: {
        status: { notIn: ['CANCELLED', 'CANCELLING', 'KASPI_DELIVERY_RETURN_REQUESTED', 'RETURN_ACCEPTED_BY_MERCHANT', 'RETURNED', 'SIGN_REQUIRED'] },
        creationDate: { gte: from, lt: to },
      },
      select: { id: true, items: { select: { productId: true, quantity: true, price: true } } },
    }),
    prisma.satuOrder.findMany({
      where: { status: { notIn: ['canceled', 'cancelled', 'returned', 'refunded'] }, creationDate: { gte: from, lt: to } },
      select: { id: true, items: { select: { productId: true, quantity: true, price: true } } },
    }),
    prisma.ba3arOrder.findMany({
      where: { status: { notIn: ['canceled', 'cancelled', 'returned'] }, createdAt: { gte: from, lt: to } },
      select: { id: true, items: { select: { productId: true, quantity: true, price: true } } },
    }),
    prisma.order.findMany({
      where: { status: { notIn: ['CANCELLED'] }, createdAt: { gte: from, lt: to } },
      select: { id: true, items: { select: { productId: true, quantity: true, price: true } } },
    }),
  ])

  // productId → агрегат по каналам.
  const map = new Map<string, ChannelProductRow>()
  const productIds = new Set<string>()

  const ensureRow = (productId: string): ChannelProductRow => {
    let r = map.get(productId)
    if (!r) {
      r = {
        productId,
        name: productId,
        sku: null,
        costPrice: null,
        byChannel: { kaspi: emptyCell(), satu: emptyCell(), ba3ar: emptyCell(), site: emptyCell() },
        totalQty: 0,
        totalRevenue: 0,
        bestChannel: null,
      }
      map.set(productId, r)
    }
    return r
  }

  const totals: ChannelTotals = {
    kaspi: { qty: 0, revenue: 0, profit: 0, orders: 0 },
    satu: { qty: 0, revenue: 0, profit: 0, orders: 0 },
    ba3ar: { qty: 0, revenue: 0, profit: 0, orders: 0 },
    site: { qty: 0, revenue: 0, profit: 0, orders: 0 },
  }

  const ingest = (
    channel: ChannelKey,
    orders: { id: string; items: { productId: string | null; quantity: number; price: number }[] }[]
  ) => {
    for (const o of orders) {
      totals[channel].orders++
      for (const it of o.items) {
        if (!it.productId) continue
        productIds.add(it.productId)
        const row = ensureRow(it.productId)
        const cell = row.byChannel[channel]
        const line = it.price * it.quantity
        cell.qty += it.quantity
        cell.revenue += line
      }
    }
  }

  ingest('kaspi', kaspiOrders)
  ingest('satu', satuOrders)
  ingest('ba3ar', ba3arOrders)
  ingest('site', siteOrders)

  // Подтянуть имя/sku/себес товаров.
  const products = await prisma.product.findMany({
    where: { id: { in: Array.from(productIds) } },
    select: { id: true, name: true, sku: true, costPrice: true },
  })
  const prodById = new Map(products.map((p) => [p.id, p]))

  // Комиссии канала в долях от выручки позиции (налог общий для всех).
  const channelFeePct = (channel: ChannelKey): number => {
    const tax = econ.taxPct
    if (channel === 'kaspi') return (econ.commissionPct + econ.payPct + tax) / 100
    return tax / 100 // Satu/Ba3ar/сайт — нет маркетплейс-комиссии, только налог
  }

  for (const row of Array.from(map.values())) {
    const p = prodById.get(row.productId)
    if (p) {
      row.name = p.name
      row.sku = p.sku ?? null
      row.costPrice = p.costPrice != null && p.costPrice > 0 ? p.costPrice : null
    }
    let bestMargin = -Infinity
    for (const ch of Object.keys(row.byChannel) as ChannelKey[]) {
      const cell = row.byChannel[ch]
      row.totalQty += cell.qty
      row.totalRevenue += cell.revenue
      if (cell.qty > 0 && row.costPrice != null) {
        const cost = row.costPrice * cell.qty
        const fees = cell.revenue * channelFeePct(ch)
        cell.profit = cell.revenue - cost - fees
        cell.marginPct = cell.revenue > 0 ? (cell.profit / cell.revenue) * 100 : null
        totals[ch].profit += cell.profit
        if (cell.marginPct != null && cell.marginPct > bestMargin) {
          bestMargin = cell.marginPct
          row.bestChannel = ch
        }
      }
      totals[ch].qty += cell.qty
      totals[ch].revenue += cell.revenue
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue)

  return { rows, totals, generatedAt: new Date().toISOString() }
}

import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import RevenueChart from './components/RevenueChart'

const LOW_STOCK_THRESHOLD = 5

export default async function AdminDashboard() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    newOrders, processingOrders, shippedOrders, recentOrdersRaw, lowStockProducts,
    todayOrders, monthOrders, totalProducts, outOfStockCount,
  ] = await Promise.all([
    prisma.kaspiOrder.findMany({ where: { status: 'APPROVED_BY_BANK' }, select: { totalPrice: true } }),
    prisma.kaspiOrder.findMany({ where: { status: 'ACCEPTED_BY_MERCHANT' }, select: { totalPrice: true } }),
    prisma.kaspiOrder.findMany({ where: { state: { in: ['DELIVERY', 'KASPI_DELIVERY'] }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, select: { totalPrice: true } }),
    prisma.kaspiOrder.findMany({
      orderBy: { creationDate: 'desc' }, take: 8,
      select: { id: true, code: true, status: true, totalPrice: true, customerName: true, customerPhone: true, creationDate: true },
    }),
    prisma.product.findMany({
      where: { totalStock: { gt: 0, lte: LOW_STOCK_THRESHOLD } },
      select: { id: true, name: true, totalStock: true, sku: true, images: { take: 1, select: { url: true } } },
      orderBy: { totalStock: 'asc' }, take: 8,
    }),
    prisma.kaspiOrder.findMany({ where: { creationDate: { gte: todayStart }, status: { notIn: ['CANCELLED'] } }, select: { totalPrice: true } }),
    prisma.kaspiOrder.findMany({ where: { creationDate: { gte: monthStart }, status: { notIn: ['CANCELLED'] } }, select: { totalPrice: true } }),
    prisma.product.count(),
    prisma.product.count({ where: { inStock: false } }),
  ])

  const newTotal = newOrders.reduce((s, o) => s + o.totalPrice, 0)
  const processingTotal = processingOrders.reduce((s, o) => s + o.totalPrice, 0)
  const shippedTotal = shippedOrders.reduce((s, o) => s + o.totalPrice, 0)
  const todayRevenue = todayOrders.reduce((s, o) => s + o.totalPrice, 0)
  const monthRevenue = monthOrders.reduce((s, o) => s + o.totalPrice, 0)

  const recentOrders = recentOrdersRaw.map(o => ({
    id: o.id,
    orderNumber: o.code,
    status: o.status,
    total: o.totalPrice,
    name: o.customerName || 'Без имени',
    phone: o.customerPhone,
    createdAt: o.creationDate ? o.creationDate.toISOString() : new Date().toISOString()
  }))

  const orderStatusCards = [
    {
      label: 'Новые', count: newOrders.length, total: newTotal,
      href: '/admin/kaspi-orders?status=OPLACHEN',
      dot: 'bg-red-500', dotLight: 'bg-red-50', textColor: 'text-red-600',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
    },
    {
      label: 'В обработке', count: processingOrders.length, total: processingTotal,
      href: '/admin/kaspi-orders?status=UPAKOVKA',
      dot: 'bg-orange-400', dotLight: 'bg-orange-50', textColor: 'text-orange-600',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
    },
    {
      label: 'Отправлено', count: shippedOrders.length, total: shippedTotal,
      href: '/admin/kaspi-orders?status=PEREDACHA',
      dot: 'bg-purple-500', dotLight: 'bg-purple-50', textColor: 'text-purple-600',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>,
    },
  ]

  return (
    <div className="space-y-5">

      {/* ── TOP STATS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 relative overflow-hidden">
          <div className="absolute top-3 right-3 w-9 h-9 bg-admin/8 rounded-xl flex items-center justify-center">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#5c6ac4" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Сегодня</p>
          <p className="text-[24px] font-bold text-gray-900 leading-none mb-1">{todayRevenue.toLocaleString('ru-RU')}</p>
          <p className="text-[12px] text-gray-400">тг · {todayOrders.length} заказ{todayOrders.length !== 1 ? 'ов' : ''}</p>
        </div>

        {/* Month */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 relative overflow-hidden">
          <div className="absolute top-3 right-3 w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Этот месяц</p>
          <p className="text-[24px] font-bold text-gray-900 leading-none mb-1">{monthRevenue.toLocaleString('ru-RU')}</p>
          <p className="text-[12px] text-gray-400">тг · {monthOrders.length} заказ{monthOrders.length !== 1 ? 'ов' : ''}</p>
        </div>

        {/* Products */}
        <Link href="/admin/products" className="bg-white rounded-2xl border border-gray-200 p-5 relative overflow-hidden group hover:border-admin/30 transition-colors">
          <div className="absolute top-3 right-3 w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Товаров</p>
          <p className="text-[24px] font-bold text-gray-900 group-hover:text-admin leading-none mb-1 transition-colors">{totalProducts.toLocaleString('ru-RU')}</p>
          <p className="text-[12px] text-gray-400">позиций в каталоге</p>
        </Link>

        {/* Out of stock */}
        <Link href="/admin/products" className={`rounded-2xl border p-5 relative overflow-hidden group transition-colors ${outOfStockCount > 0 ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
          <div className={`absolute top-3 right-3 w-9 h-9 rounded-xl flex items-center justify-center ${outOfStockCount > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={outOfStockCount > 0 ? '#ef4444' : '#9ca3af'} strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Нет в наличии</p>
          <p className={`text-[24px] font-bold leading-none mb-1 ${outOfStockCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{outOfStockCount}</p>
          <p className="text-[12px] text-gray-400">товаров без остатка</p>
        </Link>
      </div>

      {/* ── CHART + ORDER STATUS ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Interactive chart with period selector */}
        <div className="xl:col-span-2">
          <RevenueChart />
        </div>

        {/* Order status cards */}
        <div className="flex flex-col gap-3">
          {orderStatusCards.map(card => (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4 hover:border-gray-300 hover:shadow-sm transition-all group"
            >
              <div className={`w-11 h-11 rounded-xl ${card.dotLight} flex items-center justify-center shrink-0 ${card.textColor}`}>
                {card.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-gray-600">{card.label}</span>
                  <span className="text-[20px] font-bold text-gray-900 tabular-nums">{card.count}</span>
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">{card.total.toLocaleString('ru-RU')} тг</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" className="shrink-0 group-hover:stroke-gray-400 transition-colors">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>
          ))}
          {/* Quick add */}
          <Link href="/admin/products/new"
            className="rounded-2xl border-2 border-dashed border-gray-200 p-4 flex items-center gap-3 hover:border-admin/40 hover:bg-admin/2 transition-all group text-gray-400 hover:text-admin"
          >
            <div className="w-11 h-11 rounded-xl border-2 border-dashed border-current flex items-center justify-center shrink-0 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <span className="text-[13px] font-medium">Добавить товар</span>
          </Link>
        </div>
      </div>

      {/* ── RECENT ORDERS + LOW STOCK ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Recent orders */}
        <div className="xl:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-gray-900">Последние заказы</h2>
            <Link href="/admin/kaspi-orders" className="text-[12px] text-admin hover:underline font-medium">Смотреть все →</Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Заказ</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hidden sm:table-cell">Клиент</th>
                  <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Сумма</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hidden md:table-cell">Статус</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => (
                  <tr key={order.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/kaspi-orders?q=${order.orderNumber}`} className="font-semibold text-admin hover:underline">#{order.orderNumber}</Link>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(order.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Link href={`/admin/kaspi-orders?q=${encodeURIComponent(order.phone || order.name)}`} className="text-gray-800 hover:text-admin transition-colors truncate max-w-[140px] block">{order.name}</Link>
                      {order.phone && <a href={`tel:${order.phone}`} className="text-[11px] text-gray-400 hover:text-admin transition-colors font-mono">{order.phone}</a>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap font-mono">
                      {order.total.toLocaleString('ru-RU')} тг
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <OrderStatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentOrders.length === 0 && (
              <div className="py-12 text-center text-gray-400 text-[13px]">Заказов пока нет</div>
            )}
          </div>
        </div>

        {/* Low stock */}
        <div className="xl:col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[15px] font-semibold text-gray-900">Заканчивается</h2>
            <span className="text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">≤ {LOW_STOCK_THRESHOLD} шт</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {lowStockProducts.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="text-[13px] text-gray-400">Всё в порядке</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {lowStockProducts.map(p => (
                  <Link key={p.id} href={`/admin/products/${p.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/60 transition-colors group"
                  >
                    {p.images[0]?.url
                      ? <img src={p.images[0].url} alt="" className="w-9 h-9 rounded-lg object-contain shrink-0 bg-gray-50 border border-gray-100" />
                      : <div className="w-9 h-9 bg-gray-100 rounded-lg shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-gray-800 group-hover:text-admin transition-colors line-clamp-1 leading-tight">{p.name}</div>
                      {p.sku && <div className="text-[11px] text-gray-400 font-mono mt-0.5">{p.sku}</div>}
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.totalStock <= 2 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                      {p.totalStock} шт
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    APPROVED_BY_BANK:      { label: 'Одобрен банком',className: 'bg-red-50 text-red-600 border-red-100' },
    ACCEPTED_BY_MERCHANT:  { label: 'Принят',        className: 'bg-orange-50 text-orange-600 border-orange-100' },
    COMPLETED:             { label: 'Выдан/Завершен',className: 'bg-green-50 text-green-600 border-green-100' },
    CANCELLED:             { label: 'Отменён',       className: 'bg-gray-100 text-gray-500 border-gray-200' },
    CANCELLING:            { label: 'Отменяется',    className: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
  }
  const c = config[status] || { label: status, className: 'bg-gray-100 text-gray-500 border-gray-200' }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${c.className}`}>
      {c.label}
    </span>
  )
}

'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { statusLabels, statusColorsLightBorder as statusColors } from '@/lib/constants'

interface ClientOrder {
  id: string
  orderNumber?: number
  total: number
  status: string
  createdAt: string
}

interface Client {
  id: string
  name: string | null
  email: string | null
  phone: string
  userId: string | null
  firstOrder: string
  lastOrder: string
  orders: ClientOrder[]
  orderCount: number
  totalSpent: number
}


export default function AdminClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadClients = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    params.set('page', page.toString())

    const res = await fetch(`/api/admin/clients?${params}`)
    if (res.ok) {
      const data = await res.json()
      setClients(data.clients)
      setTotal(data.total)
      setPages(data.pages)
    }
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [page, search])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Клиенты</h1>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-t-xl border border-b-0 border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-[13px] text-gray-500">{total} клиентов</span>
          <form onSubmit={handleSearch} className="flex items-center">
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Поиск по имени, email или телефону..."
                className="w-48 sm:w-72 border border-gray-200 rounded-lg pl-9 pr-3 py-1.5 text-[13px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all"
              />
            </div>
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}
                className="ml-2 text-[12px] text-gray-400 hover:text-gray-600"
              >
                Сбросить
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Clients list */}
      <div className="bg-white border border-gray-200 rounded-b-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-4 animate-pulse">
                <div className="w-28 h-4 bg-gray-200 rounded" />
                <div className="w-36 h-4 bg-gray-200 rounded" />
                <div className="w-24 h-4 bg-gray-200 rounded" />
                <div className="flex-1" />
                <div className="w-12 h-4 bg-gray-200 rounded" />
                <div className="w-20 h-4 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : clients.length === 0 ? (
          <p className="py-16 text-gray-400 text-center text-[13px]">Клиентов нет</p>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Имя</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Телефон</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Первый / Последний</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Заказов</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider" title="Без отменённых заказов">Оборот ↓</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <Fragment key={client.id}>
                  <tr
                    className={`border-b border-gray-50 cursor-pointer transition-colors ${expandedId === client.id ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}`}
                    onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {client.name || '—'}
                      {client.userId && (
                        <span className="ml-1.5 text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-md">Зарег.</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a href={`tel:${client.phone}`} className="text-gray-600 hover:text-admin font-mono text-[12px]">{client.phone}</a>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{client.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="text-[12px]">{new Date(client.firstOrder).toLocaleDateString('ru-RU')}</div>
                      {client.lastOrder !== client.firstOrder && (
                        <div className="text-[11px] text-gray-400">{new Date(client.lastOrder).toLocaleDateString('ru-RU')}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{client.orderCount}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{client.totalSpent.toLocaleString()} тг</td>
                    <td className="px-4 py-3">
                      <svg
                        width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9ca3af" strokeWidth="2"
                        className={`transition-transform ${expandedId === client.id ? 'rotate-180' : ''}`}
                      >
                        <path d="M4 6l4 4 4-4" />
                      </svg>
                    </td>
                  </tr>
                  {expandedId === client.id && (
                    <tr key={`${client.id}-detail`}>
                      <td colSpan={7} className="bg-gray-50 border-b border-gray-100">
                        <div className="p-5">
                          {client.orders.length === 0 ? (
                            <p className="text-gray-400 text-[13px]">Заказов пока нет</p>
                          ) : (
                            <div>
                              <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">История заказов</p>
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                  <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/50">
                                      <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-gray-400 font-medium">№</th>
                                      <th className="text-left px-4 py-2 text-[11px] uppercase tracking-wider text-gray-400 font-medium">Статус</th>
                                      <th className="text-right px-4 py-2 text-[11px] uppercase tracking-wider text-gray-400 font-medium">Сумма</th>
                                      <th className="text-right px-4 py-2 text-[11px] uppercase tracking-wider text-gray-400 font-medium">Дата</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {client.orders.map(order => (
                                      <tr key={order.id} className="border-b border-gray-50">
                                        <td className="px-4 py-2.5">
                                          <Link href={`/admin/orders/${order.id}`} className="font-medium text-blue-600 hover:underline">#{order.orderNumber || order.id.slice(0, 8)}</Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                          <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium border ${statusColors[order.status] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                            {statusLabels[order.status] || order.status}
                                          </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">{order.total.toLocaleString()} тг</td>
                                        <td className="px-4 py-2.5 text-right text-gray-500">{new Date(order.createdAt).toLocaleDateString('ru-RU')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-100">
            {clients.map(client => (
              <Fragment key={client.id}>
                <div
                  className={`p-3 cursor-pointer transition-colors ${expandedId === client.id ? 'bg-blue-50/30' : 'active:bg-gray-50'}`}
                  onClick={() => setExpandedId(expandedId === client.id ? null : client.id)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900 text-[14px]">
                        {client.name || '—'}
                      </span>
                      {client.userId && (
                        <span className="ml-1.5 text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-md">Зарег.</span>
                      )}
                    </div>
                    <svg
                      width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9ca3af" strokeWidth="2"
                      className={`shrink-0 mt-1 transition-transform ${expandedId === client.id ? 'rotate-180' : ''}`}
                    >
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </div>
                  <div className="text-[12px] text-gray-500 space-y-0.5">
                    <div>{client.phone}</div>
                    {client.email && <div>{client.email}</div>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[12px]">
                    <span className="text-gray-400">{new Date(client.firstOrder).toLocaleDateString('ru-RU')}</span>
                    <span className="text-gray-700 font-medium">{client.orderCount} заказов</span>
                    <span className="text-gray-900 font-semibold">{client.totalSpent.toLocaleString()} тг</span>
                  </div>
                </div>
                {expandedId === client.id && (
                  <div className="bg-gray-50 px-3 py-3 border-t border-gray-100">
                    {client.orders.length === 0 ? (
                      <p className="text-gray-400 text-[13px]">Заказов пока нет</p>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[11px] uppercase tracking-wider text-gray-400">История заказов</p>
                        {client.orders.map(order => (
                          <div key={order.id} className="bg-white rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                            <div>
                              <Link href={`/admin/orders/${order.id}`} className="font-medium text-blue-600 text-[13px] hover:underline">#{order.orderNumber || order.id.slice(0, 8)}</Link>
                              <span className={`ml-2 inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium border ${statusColors[order.status] || 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                {statusLabels[order.status] || order.status}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-medium text-gray-900 text-[13px]">{order.total.toLocaleString()} тг</div>
                              <div className="text-[11px] text-gray-400">{new Date(order.createdAt).toLocaleDateString('ru-RU')}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
          <p className="text-[13px] text-gray-500">
            Страница {page} из {pages}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-md text-[13px] border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Назад
            </button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-md text-[13px] transition-colors ${
                  p === page
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(p => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-3 py-1.5 rounded-md text-[13px] border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Далее →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

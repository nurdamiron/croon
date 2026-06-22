'use client'

import { Fragment, useEffect, useState } from 'react'
import Link from 'next/link'
import { statuses, statusLabels, statusColorsBorder as statusColors, deliveryLabels, paymentLabels } from '@/lib/constants'

interface OrderItem {
  id: string
  quantity: number
  price: number
  product: { name: string; slug: string }
}

interface Order {
  id: string
  orderNumber?: number
  status: string
  total: number
  name: string
  phone: string
  email: string | null
  address: string | null
  deliveryMethod: string | null
  paymentMethod: string | null
  comment: string | null
  isPreorder: boolean
  createdAt: string
  items: OrderItem[]
  user: { email: string; name: string | null } | null
}


const tabs = [
  { label: 'Все', value: '' },
  { label: 'Открытые', value: 'open' },
  { label: 'Закрытые', value: 'closed' },
]

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(25)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  const loadOrders = async () => {
    setLoading(true)
    setLoadError(null)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (search) params.set('search', search)
    params.set('page', page.toString())
    params.set('limit', perPage.toString())

    try {
      const res = await fetch(`/api/admin/orders?${params}`)
      if (res.ok) {
        const data = await res.json()
        setOrders(data.orders)
        setTotal(data.total)
        setPages(data.pages)
      } else {
        const data = await res.json().catch(() => ({}))
        const msg = typeof data.error === 'string' ? data.error : 'Ошибка загрузки'
        if (res.status === 403) {
          setLoadError(
            `${msg}. Войдите под учётной записью с ролью ADMIN. Проверьте NEXTAUTH_URL=http://localhost:3000 в .env.local.`
          )
        } else {
          setLoadError(res.status === 500 ? `${msg}. Проверьте DATABASE_URL и доступ к БД.` : msg)
        }
        setOrders([])
        setTotal(0)
        setPages(1)
      }
    } catch {
      setLoadError('Сеть или сервер недоступны.')
      setOrders([])
      setTotal(0)
      setPages(1)
    }
    setLoading(false)
  }

  useEffect(() => { loadOrders() }, [page, filterStatus, search, perPage])

  const updateOrder = async (orderId: string, fields: Partial<Pick<Order, 'status' | 'paymentMethod' | 'deliveryMethod'>>) => {
    if (savingId) return
    setSavingId(orderId)
    const res = await fetch('/api/admin/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId, ...fields }),
    })
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...fields } : o))
    }
    setSavingId(null)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === orders.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(orders.map(o => o.id)))
    }
  }

  const bulkUpdateStatus = async () => {
    if (!bulkStatus || selected.size === 0) return
    setBulkLoading(true)
    const res = await fetch('/api/admin/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected), status: bulkStatus }),
    })
    if (res.ok) {
      setOrders(prev => prev.map(o => selected.has(o.id) ? { ...o, status: bulkStatus } : o))
      setSelected(new Set())
      setBulkStatus('')
    }
    setBulkLoading(false)
  }

  const exportCSV = () => {
    const headers = ['№', 'Дата', 'Клиент', 'Телефон', 'Email', 'Сумма', 'Статус', 'Оплата', 'Доставка', 'Комментарий', 'Предзаказ']
    const rows = orders.map(o => [
      o.orderNumber || o.id.slice(0, 8),
      new Date(o.createdAt).toLocaleDateString('ru-RU'),
      o.name,
      o.phone,
      o.email || '',
      o.total,
      statusLabels[o.status] || o.status,
      paymentLabels[o.paymentMethod || ''] || '',
      deliveryLabels[o.deliveryMethod || ''] || '',
      o.comment || '',
      o.isPreorder ? 'Да' : 'Нет',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const bulkDelete = async () => {
    if (selected.size === 0) return
    if (!confirm(`Удалить ${selected.size} заказ(ов)? Это действие необратимо.`)) return
    setBulkLoading(true)
    const res = await fetch('/api/admin/orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) }),
    })
    if (res.ok) {
      setSelected(new Set())
      loadOrders()
    }
    setBulkLoading(false)
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Заказы</h1>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {loadError}
        </div>
      )}

      {/* Title + tabs */}
      <div className="flex items-center gap-6 mb-1">
        {tabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => { setFilterStatus(tab.value); setPage(1) }}
            className={`text-[14px] pb-1 transition-colors ${
              filterStatus === tab.value
                ? 'text-admin border-b-2 border-admin font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-gray-200 rounded-t-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <input
              type="checkbox"
              className="accent-admin"
              checked={orders.length > 0 && selected.size === orders.length}
              onChange={toggleSelectAll}
            />
            {selected.size > 0 && (
              <>
                <span className="text-[13px] text-gray-500">Выбрано: {selected.size}</span>
                <select
                  value={bulkStatus}
                  onChange={e => setBulkStatus(e.target.value)}
                  className="text-[12px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-admin bg-white text-gray-900"
                >
                  <option value="">Изменить статус…</option>
                  {statuses.map(s => (
                    <option key={s} value={s}>{statusLabels[s]}</option>
                  ))}
                </select>
                {bulkStatus && (
                  <button
                    onClick={bulkUpdateStatus}
                    disabled={bulkLoading}
                    className="text-[12px] px-3 py-1 bg-admin text-white rounded hover:bg-admin-hover disabled:opacity-50 transition-colors"
                  >
                    Применить
                  </button>
                )}
                <button
                  onClick={bulkDelete}
                  disabled={bulkLoading}
                  className="text-[12px] px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  Удалить
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* CSV Export */}
            <button
              onClick={exportCSV}
              disabled={orders.length === 0}
              title="Экспорт текущей страницы в CSV"
              className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:border-admin hover:text-admin transition-colors disabled:opacity-40"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              CSV
            </button>
            {/* Navigation arrows */}
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              </button>
              <span className="text-[13px] text-gray-500">{page} / {pages}</span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </div>
            {/* Search */}
            <form onSubmit={handleSearch} className="flex items-center">
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Поиск заказов..."
                className="w-40 sm:w-80 border border-gray-200 rounded px-3 py-1.5 text-[13px] outline-none focus:border-admin transition-all"
              />
              <button type="submit" className="ml-1 px-3 py-1.5 text-[13px] text-gray-500 hover:text-gray-700 border border-gray-200 rounded hover:bg-gray-50">
                Найти
              </button>
              {search && (
                <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }} className="ml-1 text-[12px] text-gray-400 hover:text-gray-600">✕</button>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* Orders list */}
      <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-4 animate-pulse">
                <div className="w-4 h-4 bg-gray-200 rounded" />
                <div className="w-16 h-4 bg-gray-200 rounded" />
                <div className="w-24 h-4 bg-gray-200 rounded" />
                <div className="flex-1" />
                <div className="w-20 h-4 bg-gray-200 rounded" />
                <div className="w-16 h-5 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="py-16 text-gray-400 text-center text-[13px]">Заказов нет</p>
        ) : (
          <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="accent-admin"
                    checked={orders.length > 0 && selected.size === orders.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">№</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Создан</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Сумма</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Клиент</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Статус</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider hidden xl:table-cell">Товары</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Способ оплаты</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wider">Доставка</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr
                  key={order.id}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${selected.has(order.id) ? 'bg-indigo-50/50' : 'hover:bg-gray-50/50'}`}
                  onClick={() => window.location.href = `/admin/orders/${order.id}`}
                >
                  <td className="w-10 px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="accent-admin"
                      checked={selected.has(order.id)}
                      onChange={() => toggleSelect(order.id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-blue-600">{order.orderNumber || order.id.slice(0, 8)}</span>
                    {order.isPreorder && (
                      <span className="ml-1.5 text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Предзаказ</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    <span className="text-gray-400 ml-1">
                      {new Date(order.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{order.total.toLocaleString()} тг</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/admin/clients?search=${encodeURIComponent(order.phone)}`} className="text-gray-700 hover:text-admin hover:underline text-[13px]">{order.name}</Link>
                      {order.comment && (
                        <span title={order.comment} className="text-gray-300 hover:text-amber-500 cursor-help transition-colors shrink-0">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <a href={`tel:${order.phone}`} className="text-[11px] text-gray-400 hover:text-admin font-mono">{order.phone}</a>
                      <button
                        onClick={() => navigator.clipboard.writeText(order.phone)}
                        className="text-gray-300 hover:text-admin transition-colors"
                        title="Скопировать"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <select
                      value={order.status}
                      onChange={(e) => updateOrder(order.id, { status: e.target.value })}
                      disabled={savingId === order.id}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-md border outline-none transition-opacity ${savingId === order.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${statusColors[order.status] || 'bg-gray-50 text-gray-500 border-gray-200'}`}
                      style={{ WebkitAppearance: 'none' }}
                    >
                      {statuses.map(s => (
                        <option key={s} value={s}>{statusLabels[s]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <div className="text-[12px] text-gray-600 max-w-[200px]">
                      <span className="text-gray-400">{order.items.length} поз.</span>
                      {order.items[0] && (
                        <span className="ml-1.5 text-gray-600 line-clamp-1">{order.items[0].product.name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <select
                      value={order.paymentMethod || ''}
                      onChange={(e) => updateOrder(order.id, { paymentMethod: e.target.value || null })}
                      disabled={savingId === order.id}
                      className={`text-[12px] text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-admin appearance-none transition-opacity ${savingId === order.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <option value="">—</option>
                      {Object.entries(paymentLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <select
                      value={order.deliveryMethod || ''}
                      onChange={(e) => updateOrder(order.id, { deliveryMethod: e.target.value || null })}
                      disabled={savingId === order.id}
                      className={`text-[12px] text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 outline-none focus:border-admin appearance-none transition-opacity ${savingId === order.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <option value="">—</option>
                      {Object.entries(deliveryLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-gray-100">
            {orders.map(order => (
              <div
                key={order.id}
                className={`p-3 cursor-pointer transition-colors ${selected.has(order.id) ? 'bg-indigo-50/50' : 'active:bg-gray-50'}`}
                onClick={() => window.location.href = `/admin/orders/${order.id}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="accent-admin mt-1 shrink-0"
                    checked={selected.has(order.id)}
                    onChange={() => toggleSelect(order.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-blue-600 text-[14px]">#{order.orderNumber || order.id.slice(0, 8)}</span>
                        {order.isPreorder && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Предзаказ</span>
                        )}
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${statusColors[order.status]}`}>
                        {statusLabels[order.status]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[13px] text-gray-700 truncate">{order.name}</span>
                      <span className="text-[14px] font-semibold text-gray-900 shrink-0">{order.total.toLocaleString()} тг</span>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-gray-400">
                      <span>
                        {new Date(order.createdAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        {' '}
                        {new Date(order.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {order.paymentMethod && <span>{paymentLabels[order.paymentMethod]}</span>}
                      {order.deliveryMethod && <span>{deliveryLabels[order.deliveryMethod]}</span>}
                    </div>
                    {order.comment && (
                      <p className="text-[11px] text-amber-600 mt-1 line-clamp-1">
                        💬 {order.comment}
                      </p>
                    )}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="shrink-0 mt-1">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>

      {/* Pagination — InSales style */}
      {pages > 1 && (
        <div className="bg-white border border-t-0 border-gray-200 rounded-b-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              let p: number
              if (pages <= 7) p = i + 1
              else if (page <= 4) p = i + 1
              else if (page >= pages - 3) p = pages - 6 + i
              else p = page - 3 + i
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded text-[13px] transition-colors ${
                    p === page
                      ? 'bg-admin text-white'
                      : 'text-admin hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              )
            })}
            {pages > 7 && (
              <>
                <span className="text-gray-400 px-1">…</span>
                <button onClick={() => setPage(pages)} className="w-7 h-7 rounded text-[13px] text-admin hover:bg-gray-100">{pages}</button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-[13px] text-gray-500">
            <span>На странице</span>
            {[25, 50, 100].map(n => (
              <button
                key={n}
                onClick={() => { setPerPage(n); setPage(1) }}
                className={`w-7 h-7 rounded text-[13px] ${perPage === n ? 'bg-admin text-white' : 'text-admin hover:bg-gray-100'}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

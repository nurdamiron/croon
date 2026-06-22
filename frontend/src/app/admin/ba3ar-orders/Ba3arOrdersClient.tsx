'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useState } from 'react'
import {
  ba3arOtherStatuses, ba3arStatusLabels, ba3arStatusColors,
} from '@/lib/ba3ar-constants'

type Item = { id: string; sku: string | null; name: string | null; quantity: number; price: number; product: { id: string; name: string } | null; imageUrl: string | null }
type Row = {
  id: string; ba3arOrderId: string; orderNumber: number; status: string; stockApplied: string | null; isPreorder: boolean
  totalPrice: number; customerName: string | null; customerPhone: string | null; email: string | null
  deliveryName: string | null; paymentName: string | null; address: string | null; comment: string | null
  createdAt: string; items: Item[]
}

const STOCK_LABELS: Record<string, string> = {
  reserved: 'забронировано', completed: 'списано', released: 'снято',
}
const TABS = [
  { key: '', label: 'Все' },
  { key: 'open', label: 'Открытые' },
  { key: 'closed', label: 'Закрытые' },
]

function fmtPrice(n: number) { return Math.round(n).toLocaleString('ru-RU') + ' ₸' }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty' })
}
function waLink(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `https://wa.me/${digits}`
}

export default function Ba3arOrdersClient({ rows, status, q, counts, total }: {
  rows: Row[]; status: string; q: string; counts: Record<string, number>; total: number
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [search, setSearch] = useState(q)
  const [msg, setMsg] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const applyFilter = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString())
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k) })
    router.push(`/admin/ba3ar-orders?${p.toString()}`)
  }

  const changeStatus = async (rowId: string, st: string, curStatus: string) => {
    if (st === curStatus) return
    const lbl = ba3arStatusLabels[st] || st
    const isReturn = st === 'returned'
    const isCancel = st === 'canceled'
    const note = (isReturn || isCancel)
      ? `Сменить статус на «${lbl}»? Товары вернутся на склад Alash.`
      : `Сменить статус на «${lbl}»? Обновит остатки на складе.`
    if (!confirm(note)) return
    setSavingId(rowId); setMsg(null)
    try {
      const res = await fetch(`/api/admin/ba3ar-orders/${rowId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: st }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      setMsg(`Статус → ${lbl}`); router.refresh()
    } catch (e) { setMsg('Ошибка: ' + (e as Error).message) }
    finally { setSavingId(null) }
  }

  return (
    <div className="space-y-3">
      {msg && <div className="text-sm px-3 py-2 rounded-lg bg-green-50 text-green-800 border border-green-200">{msg}</div>}

      {/* Tabs */}
      <div className="flex items-center gap-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => applyFilter({ status: tab.key || undefined })}
            className={`text-[14px] pb-1 transition-colors ${
              status === tab.key
                ? 'text-green-700 border-b-2 border-green-600 font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}{tab.key && counts[tab.key] ? ` (${counts[tab.key]})` : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); applyFilter({ q: search }) }} className="flex items-center gap-2">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по номеру, имени или телефону"
          className="flex-1 min-w-[220px] px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-green-500 outline-none" />
        <button type="submit" className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Найти</button>
        {q && <button type="button" onClick={() => { setSearch(''); applyFilter({ q: undefined }) }} className="text-sm text-gray-400 hover:text-gray-600">Сброс</button>}
      </form>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-green-50/60 border-b border-gray-200">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium text-gray-700 text-[11px] uppercase tracking-wider">Заказ</th>
                <th className="px-4 py-2.5 font-medium text-gray-700 text-[11px] uppercase tracking-wider">Клиент</th>
                <th className="px-4 py-2.5 font-medium text-gray-700 text-[11px] uppercase tracking-wider">Статус</th>
                <th className="px-4 py-2.5 font-medium text-gray-700 text-[11px] uppercase tracking-wider">Остатки</th>
                <th className="px-4 py-2.5 font-medium text-gray-700 text-[11px] uppercase tracking-wider text-right">Сумма</th>
                <th className="px-4 py-2.5 font-medium text-gray-700 text-[11px] uppercase tracking-wider">Дата</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (<tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Заказов нет.</td></tr>)}
              {rows.map(o => {
                const unmatched = o.items.some(it => !it.product)
                const others = ba3arOtherStatuses(o.status)
                return (
                  <tr key={o.id} className="hover:bg-green-50/30 cursor-pointer" onClick={() => router.push(`/admin/ba3ar-orders/${o.id}`)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-green-700">№ {o.orderNumber}</span>
                        {o.isPreorder && (
                          <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Предзаказ</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{o.items.length} поз.</div>
                    </td>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="text-gray-900">{o.customerName || '—'}</div>
                      {o.customerPhone && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <a href={`tel:${o.customerPhone}`} className="text-[11px] text-gray-400 hover:text-green-700 font-mono">{o.customerPhone}</a>
                          <a href={waLink(o.customerPhone)} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="text-green-500 hover:text-green-700">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.6.2-.2.3-.7.9-.8 1-.2.2-.3.2-.6.1-1.7-.9-2.9-1.6-4-3.6-.3-.5.3-.5.8-1.6.1-.2 0-.4 0-.5 0-.2-.6-1.5-.9-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 5 4.3 1.8.8 2.5.9 3.4.8.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3M12 2a10 10 0 00-8.6 15l-1.4 5 5.2-1.4A10 10 0 1012 2"/></svg>
                          </a>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <select
                        value={o.status}
                        onChange={e => changeStatus(o.id, e.target.value, o.status)}
                        disabled={savingId === o.id}
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-md border-0 outline-none cursor-pointer disabled:opacity-50 ${ba3arStatusColors[o.status] || 'bg-gray-100 text-gray-600'}`}
                        style={{ WebkitAppearance: 'none' }}
                      >
                        <option value={o.status}>{ba3arStatusLabels[o.status] || o.status}</option>
                        {others.map(ns => (
                          <option key={ns} value={ns}>{ba3arStatusLabels[ns] || ns}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      {o.stockApplied ? <span className="text-xs text-gray-600">{STOCK_LABELS[o.stockApplied] || o.stockApplied}</span> : <span className="text-xs text-gray-300">—</span>}
                      {unmatched && <div className="text-[10px] text-red-500">есть непривязанные</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">{fmtPrice(o.totalPrice)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" className="inline"><path d="M9 18l6-6-6-6"/></svg>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

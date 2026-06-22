'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Fragment, useState } from 'react'
import { KASPI_UI_LABELS, KASPI_UI_COLORS, KASPI_UI_ORDER, kaspiUiStatus, type KaspiUiStatus } from '@/lib/kaspi-ui-status'

// Kaspi возвращает фейковую маску "+0(000)-000-00-00" вместо телефона при
// Kaspi-доставке / пунктах выдачи (реальный номер скрыт от продавца).
// Считаем такой телефон отсутствующим.
function isMaskedKaspiPhone(p: string | null | undefined): boolean {
  if (!p) return false
  return /^[+]?0[\s()-]*0+[\s()-]*0+[\s()-]*0+[\s()-]*0+$/.test(p) || !/[1-9]/.test(p)
}

type Item = {
  id: string
  kaspiSku: string
  kaspiName: string | null
  quantity: number
  price: number
  product: { id: string; name: string; slug: string } | null
}
type Row = {
  id: string
  code: string
  state: string
  status: string
  assembled: boolean
  stockApplied: string | null
  totalPrice: number
  customerName: string | null
  customerPhone: string | null
  deliveryMode: string | null
  isPreorder: boolean
  isKaspiDelivery: boolean
  creationDate: string | null
  items: Item[]
}

// Эффект на остатки
const STOCK_LABELS: Record<string, string> = {
  reserved: 'забронировано',
  completed: 'списано',
  released: 'бронь снята',
}

// Фильтры по UI-статусам (как в Kaspi: Упаковка / Передача — раздельно).
const FILTERS: Array<{ key: string; label: string }> = [
  { key: '', label: 'Все' },
  ...KASPI_UI_ORDER.map(k => ({ key: k as string, label: KASPI_UI_LABELS[k] })),
]

function uiStatusOf(row: { status: string; assembled: boolean }): KaspiUiStatus | null {
  return kaspiUiStatus({ status: row.status, raw: { assembled: row.assembled } })
}

function fmtPrice(n: number) {
  return Math.round(n).toLocaleString('ru-RU') + ' ₸'
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  // Явная таймзона Алматы — иначе сервер (UTC) и браузер дают разный текст
  // и React падает с hydration mismatch (#418/#423/#425).
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Almaty',
  })
}

export default function KaspiOrdersClient({
  rows, status, q, counts, total,
}: { rows: Row[]; status: string; q: string; counts: Record<string, number>; total: number }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [search, setSearch] = useState(q)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const applyFilter = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString())
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k) })
    router.push(`/admin/kaspi-orders?${p.toString()}`)
  }

  const sync = async () => {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/admin/kaspi-orders/sync?days=30', { method: 'POST' })
      const data = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(data.error || 'Ошибка синхронизации')
      const parts = [
        `получено ${data.fetched}`,
        `обновлено ${data.upserted}`,
        `бронь +${data.reserved}`,
        `списано ${data.completed}`,
        `снято ${data.released}`,
      ]
      if (data.unmatchedItems) parts.push(`без привязки ${data.unmatchedItems}`)
      let msg = parts.join(', ')
      if (data.errors?.length) msg += ` · ошибок: ${data.errors.length}`
      setSyncMsg(msg)
      router.refresh()
    } catch (e) {
      setSyncMsg('Ошибка: ' + (e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <form onSubmit={e => { e.preventDefault(); applyFilter({ q: search }) }} className="flex-1 min-w-[220px]">
          <input
            type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по номеру заказа, имени или телефону"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none"
          />
        </form>
        <button
          onClick={sync} disabled={syncing}
          className="px-4 py-2 bg-admin hover:bg-admin-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {syncing ? (
            <><span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Синхронизирую…</>
          ) : '↻ Синхронизировать'}
        </button>
      </div>

      {syncMsg && (
        <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700">{syncMsg}</div>
      )}

      <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm w-fit">
        {FILTERS.map((f, i) => (
          <button
            key={f.key}
            onClick={() => applyFilter({ status: f.key || undefined })}
            className={`px-3 py-2 ${i > 0 ? 'border-l border-gray-200' : ''} ${status === f.key ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}
          >
            {f.label}
            {f.key === '' ? ` (${total})` : counts[f.key] ? ` (${counts[f.key]})` : ''}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium text-gray-700">Заказ</th>
                <th className="px-4 py-2.5 font-medium text-gray-700">Клиент</th>
                <th className="px-4 py-2.5 font-medium text-gray-700">Статус</th>
                <th className="px-4 py-2.5 font-medium text-gray-700">Остатки</th>
                <th className="px-4 py-2.5 font-medium text-gray-700 text-right">Сумма</th>
                <th className="px-4 py-2.5 font-medium text-gray-700">Дата</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  Заказов нет. Нажмите «Синхронизировать», чтобы загрузить с Kaspi.
                </td></tr>
              )}
              {rows.map(o => {
                const isOpen = expanded.has(o.id)
                const unmatched = o.items.some(it => !it.product)
                return (
                  <Fragment key={o.id}>
                    <tr className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-gray-900">№ {o.code}</div>
                        <div className="text-xs text-gray-400">{o.items.length} поз. · {o.state}{o.isKaspiDelivery ? ' · Kaspi Доставка' : ''}{o.isPreorder ? ' · предзаказ' : ''}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-gray-900">{o.customerName || '—'}</div>
                        <div className="text-xs text-gray-400">{isMaskedKaspiPhone(o.customerPhone) ? 'телефон скрыт Kaspi' : (o.customerPhone || '')}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const ui = uiStatusOf(o)
                          const cls = ui ? KASPI_UI_COLORS[ui] : 'bg-gray-100 text-gray-600 border-gray-200'
                          const label = ui ? KASPI_UI_LABELS[ui] : o.status
                          return (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>{label}</span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-2.5">
                        {o.stockApplied ? (
                          <span className="text-xs text-gray-600">{STOCK_LABELS[o.stockApplied] || o.stockApplied}</span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                        {unmatched && <div className="text-[10px] text-red-500">есть непривязанные</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{fmtPrice(o.totalPrice)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmtDate(o.creationDate)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => toggle(o.id)} className="text-xs text-admin hover:underline">
                          {isOpen ? 'скрыть' : 'позиции'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50/60">
                        <td colSpan={7} className="px-4 py-2">
                          <div className="space-y-1">
                            {o.items.map(it => (
                              <div key={it.id} className="flex items-center gap-3 text-xs">
                                <span className="font-mono text-gray-500 w-32 shrink-0">{it.kaspiSku}</span>
                                <span className="flex-1 text-gray-800">{it.kaspiName || '—'}</span>
                                <span className="text-gray-500">{it.quantity} × {fmtPrice(it.price)}</span>
                                {it.product ? (
                                  <Link href={`/admin/products/${it.product.id}`} className="text-admin hover:underline w-48 truncate">
                                    → {it.product.name}
                                  </Link>
                                ) : (
                                  <span className="text-red-500 w-48">не привязан к товару Alash</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {rows.length >= 200 && (
          <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">Показано первые 200. Уточните фильтр.</div>
        )}
      </div>
    </div>
  )
}

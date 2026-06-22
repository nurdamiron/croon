'use client'

import Link from 'next/link'
import { useState } from 'react'

interface ReceiptItem {
  id: string
  productId: string
  productName: string
  productSku: string | null
  imageUrl: string | null
  oldValue: number
  newValue: number
  detail: string | null
}

interface ReceiptRow {
  id: string
  batchNumber: string | null
  name: string | null
  supplierName: string | null
  notes: string | null
  totalItems: number
  totalQty: number
  totalCost: number
  createdAt: string
  items: ReceiptItem[]
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function AcceptanceHistoryClient({
  rows,
  page,
  totalPages,
  total,
}: {
  rows: ReceiptRow[]
  page: number
  totalPages: number
  total: number
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
        <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
        </svg>
        <p className="text-[13px] font-medium text-gray-500">История приёмок пуста</p>
        <p className="text-[11px] text-gray-400 mt-1">Проведите первую приёмку товаров</p>
        <Link href="/admin/products/acceptance" className="inline-block mt-4 bg-admin hover:bg-admin-hover text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors">
          Перейти к приёмке
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((receipt) => {
        const expanded = expandedId === receipt.id
        return (
          <div key={receipt.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Receipt header */}
            <button
              onClick={() => setExpandedId(expanded ? null : receipt.id)}
              className="w-full flex items-center justify-between p-5 hover:bg-gray-50/50 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-admin/10 flex items-center justify-center shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-admin">
                    <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                  </svg>
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-gray-800">{receipt.name || 'Приёмка'}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                    <span>{fmtDate(receipt.createdAt)}</span>
                    {receipt.batchNumber && <span>· №{receipt.batchNumber}</span>}
                    {receipt.supplierName && <span>· {receipt.supplierName}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[12px] text-gray-500">{receipt.totalItems} поз. · {receipt.totalQty} шт.</p>
                  {receipt.totalCost > 0 && (
                    <p className="text-[11px] text-gray-400">{fmt(receipt.totalCost)} тг</p>
                  )}
                </div>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* Expanded items */}
            {expanded && (
              <div className="border-t border-gray-100">
                {receipt.notes && (
                  <div className="px-5 py-3 bg-gray-50 text-[12px] text-gray-500">
                    <span className="font-semibold text-gray-600">Заметки:</span> {receipt.notes}
                  </div>
                )}
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      <th className="py-2.5 px-4">Товар</th>
                      <th className="py-2.5 px-4 text-right">Было</th>
                      <th className="py-2.5 px-4 text-right">Стало</th>
                      <th className="py-2.5 px-4 text-right">Изменение</th>
                      <th className="py-2.5 px-4">Детали</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[12px]">
                    {receipt.items.map((item) => {
                      const delta = item.newValue - item.oldValue
                      return (
                        <tr key={item.id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt="" className="w-7 h-7 rounded-lg object-cover bg-gray-50 border border-gray-100 shrink-0" />
                              ) : (
                                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-[8px] font-bold shrink-0">N/A</div>
                              )}
                              <div className="min-w-0">
                                <Link href={`/admin/products/${item.productId}`} className="text-[11px] font-medium text-gray-800 hover:text-admin truncate block max-w-[180px]">
                                  {item.productName}
                                </Link>
                                <p className="text-[9px] text-gray-400">SKU: {item.productSku || item.productId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right text-gray-500 font-mono">{item.oldValue} шт</td>
                          <td className="py-2.5 px-4 text-right font-bold text-gray-800 font-mono">{item.newValue} шт</td>
                          <td className="py-2.5 px-4 text-right">
                            <span className={`font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {delta > 0 ? '+' : ''}{delta}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[11px] text-gray-500 truncate max-w-[180px]">{item.detail || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-[11px] text-gray-400">
            Страница {page} из {totalPages} · Всего {total} партий
          </p>
          <div className="flex gap-1">
            {page > 1 && (
              <Link href={`/admin/products/acceptance/history?page=${page - 1}`} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">
                Назад
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/admin/products/acceptance/history?page=${page + 1}`} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-admin hover:bg-admin-hover text-white transition-colors">
                Далее
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

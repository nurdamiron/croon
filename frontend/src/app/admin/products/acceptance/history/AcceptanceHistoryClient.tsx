'use client'

import Link from 'next/link'

interface HistoryRow {
  id: string
  productId: string
  productName: string
  productSlug: string
  productSku: string | null
  imageUrl: string | null
  field: string
  oldValue: number
  newValue: number
  detail: string | null
  createdAt: string
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
  rows: HistoryRow[]
  page: number
  totalPages: number
  total: number
}) {
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
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              <th className="py-3 px-4">Дата</th>
              <th className="py-3 px-4">Товар</th>
              <th className="py-3 px-4 text-center">Поле</th>
              <th className="py-3 px-4 text-right">Было</th>
              <th className="py-3 px-4 text-right">Стало</th>
              <th className="py-3 px-4 text-right">Изменение</th>
              <th className="py-3 px-4">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-[13px]">
            {rows.map((row) => {
              const delta = row.newValue - row.oldValue
              const isStock = row.field === 'totalStock'
              return (
                <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="py-3 px-4 text-[11px] text-gray-500 whitespace-nowrap">
                    {fmtDate(row.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {row.imageUrl ? (
                        <img src={row.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover bg-gray-50 border border-gray-100 shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-[9px] font-bold shrink-0">N/A</div>
                      )}
                      <div className="min-w-0">
                        <Link href={`/admin/products/${row.productId}`} className="text-[12px] font-medium text-gray-800 hover:text-admin truncate block max-w-[200px]">
                          {row.productName}
                        </Link>
                        <p className="text-[10px] text-gray-400 mt-0.5">SKU: {row.productSku || row.productId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${isStock ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isStock ? 'Остаток' : 'Себестоимость'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500 font-mono text-[12px]">
                    {isStock ? `${row.oldValue} шт` : `${fmt(row.oldValue)} тг`}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-gray-800 font-mono text-[12px]">
                    {isStock ? `${row.newValue} шт` : `${fmt(row.newValue)} тг`}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-bold text-[12px] ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {delta > 0 ? '+' : ''}{isStock ? delta : fmt(delta)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[11px] text-gray-500 max-w-[200px] truncate">
                    {row.detail || '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[11px] text-gray-400">
            Страница {page} из {totalPages} · Всего {total} записей
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

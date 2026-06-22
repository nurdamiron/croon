'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'

type Row = {
  id: string
  name: string
  slug: string
  price: number
  sku: string | null
  imageUrl: string | null
  available: number
  sum: number
  inStock: boolean
  hadOffer: boolean
  postponed: boolean
}

type SortKey = 'name' | 'price' | 'stock' | 'sum'

function fmtPrice(n: number) {
  return Math.round(n).toLocaleString('ru-RU') + ' ₸'
}

export default function KaspiMissingClient({
  rows,
  q,
  stockOnly,
  page,
  totalPages,
  total,
  sort,
  dir,
  view,
  postponedCount,
}: {
  rows: Row[]
  q: string
  stockOnly: boolean
  page: number
  totalPages: number
  total: number
  sort: SortKey
  dir: 'asc' | 'desc'
  view: 'active' | 'postponed'
  postponedCount: number
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [search, setSearch] = useState(q)

  const applyFilter = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString())
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k) })
    p.delete('page') // сброс пагинации при смене фильтра
    router.push(`/admin/kaspi-missing?${p.toString()}`)
  }
  const goPage = (n: number) => {
    const p = new URLSearchParams(sp.toString())
    p.set('page', String(n))
    router.push(`/admin/kaspi-missing?${p.toString()}`)
  }
  // Клик по заголовку: тот же ключ → сменить направление; иначе новый ключ + desc.
  const sortBy = (key: SortKey) => {
    const p = new URLSearchParams(sp.toString())
    p.set('sort', key)
    p.set('dir', sort === key && dir === 'desc' ? 'asc' : 'desc')
    p.delete('page')
    router.push(`/admin/kaspi-missing?${p.toString()}`)
  }
  const arrow = (key: SortKey) => (sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '')

  return (
    <div className="space-y-3">
      {/* Переключатель: основной список / отложенные */}
      <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm w-fit">
        <button
          onClick={() => applyFilter({ view: undefined })}
          className={`px-4 py-2 ${view === 'active' ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}
        >
          Нет на Kaspi
        </button>
        <button
          onClick={() => applyFilter({ view: 'postponed' })}
          className={`px-4 py-2 border-l border-gray-200 ${view === 'postponed' ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}
        >
          Отложенные{postponedCount > 0 ? ` (${postponedCount})` : ''}
        </button>
      </div>

      {/* Фильтры */}
      <div className="flex items-center gap-2 flex-wrap">
        <form onSubmit={(e) => { e.preventDefault(); applyFilter({ q: search }) }} className="flex-1 min-w-[220px]">
          <input
            type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none"
          />
        </form>
        <button
          onClick={() => applyFilter({ stock: stockOnly ? undefined : 'yes' })}
          className={`px-3 py-2 text-sm border rounded-lg ${stockOnly ? 'bg-admin text-white border-admin' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
        >
          Только в наличии
        </button>
        <span className="text-sm text-gray-500">Всего: {total.toLocaleString('ru-RU')}</span>
      </div>

      {view === 'postponed' && (
        <p className="text-xs text-gray-500">
          Отложенные товары (например B2B) скрыты из основного списка «Нет на Kaspi». Нажмите «Вернуть», чтобы
          снова показать их там.
        </p>
      )}

      {/* Таблица */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th onClick={() => sortBy('name')} className="px-4 py-2 font-medium cursor-pointer select-none hover:text-gray-800 whitespace-nowrap">Товар{arrow('name')}</th>
                <th onClick={() => sortBy('price')} className="px-4 py-2 font-medium text-right cursor-pointer select-none hover:text-gray-800 whitespace-nowrap">Цена{arrow('price')}</th>
                <th onClick={() => sortBy('stock')} className="px-4 py-2 font-medium text-right cursor-pointer select-none hover:text-gray-800 whitespace-nowrap">Остаток{arrow('stock')}</th>
                <th onClick={() => sortBy('sum')} className="px-4 py-2 font-medium text-right cursor-pointer select-none hover:text-gray-800 whitespace-nowrap" title="Цена × Остаток">Сумма{arrow('sum')}</th>
                <th className="px-4 py-2 font-medium" style={{ minWidth: 340 }}>Ссылка на карточку Kaspi</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    {view === 'postponed' ? 'Отложенных товаров нет' : 'Все товары уже выложены на Kaspi 🎉'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => <MissingRow key={r.id} row={r} view={view} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => goPage(page - 1)} disabled={page <= 1} className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">←</button>
          <span className="text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => goPage(page + 1)} disabled={page >= totalPages} className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">→</button>
        </div>
      )}
    </div>
  )
}

function MissingRow({ row, view }: { row: Row; view: 'active' | 'postponed' }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [price, setPrice] = useState(String(Math.round(row.price) || ''))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Отложить (в основном списке) / Вернуть (в отложенных).
  const togglePostpone = async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/kaspi-missing/postpone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: row.id, postponed: view === 'active' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      setDone(true)
      setTimeout(() => router.refresh(), 500)
    } catch (e) {
      setMsg('Ошибка: ' + (e as Error).message)
      setBusy(false)
    }
  }

  const submit = async () => {
    if (!url.trim()) { setMsg('Вставьте ссылку Kaspi'); return }
    const priceNum = Number(price)
    if (!Number.isFinite(priceNum) || priceNum < 1) { setMsg('Укажите цену'); return }
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/products/${row.id}/kaspi-offers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ url: url.trim(), priceTenge: priceNum, active: true }] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Ошибка')
      if (data.errors?.length) {
        setMsg(data.errors[0])
      } else {
        setDone(true)
        setMsg('Выложено ✓')
        // обновим список через секунду — строка уедет (появился активный оффер)
        setTimeout(() => router.refresh(), 900)
      }
    } catch (e) {
      setMsg('Ошибка: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className={`border-b border-gray-50 last:border-0 ${done ? 'bg-green-50' : 'hover:bg-gray-50'}`}>
      <td className="px-4 py-2 text-gray-800">
        <div className="flex items-center gap-2.5">
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.imageUrl} alt="" className="w-10 h-10 rounded object-cover border border-gray-200 shrink-0 bg-white" loading="lazy" />
          ) : (
            <div className="w-10 h-10 rounded border border-dashed border-gray-200 shrink-0 flex items-center justify-center text-gray-300 text-[9px]">нет фото</div>
          )}
          <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5">
          <Link href={`/admin/products/${row.id}`} className="hover:text-admin">{row.name}</Link>
          {row.slug && (
            <a
              href={`https://alash-electronics.kz/product/${row.slug}`}
              target="_blank"
              rel="noreferrer"
              title="Открыть на сайте"
              className="shrink-0 text-brand hover:opacity-70"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </span>
        <div className="text-xs text-gray-400">
          {row.sku ? `арт. ${row.sku}` : 'без артикула'}
          {row.hadOffer && <span className="ml-2 text-amber-600">был оффер (отключён)</span>}
        </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap text-gray-700">{fmtPrice(row.price)}</td>
      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
        <span className={row.available > 0 ? 'text-gray-700' : 'text-gray-400'}>{row.available}</span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">
        <span className={row.sum > 0 ? 'text-gray-900 font-medium' : 'text-gray-400'}>{fmtPrice(row.sum)}</span>
      </td>
      <td className="px-4 py-2">
        {view === 'postponed' ? (
          <button
            onClick={togglePostpone} disabled={busy || done}
            className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {busy ? '…' : done ? '✓' : '↩ Вернуть в список'}
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy || done}
              placeholder="https://kaspi.kz/shop/p/...-123456789/"
              className="flex-1 min-w-[200px] px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none disabled:opacity-60"
            />
            <input
              type="number" value={price} onChange={(e) => setPrice(e.target.value)} disabled={busy || done}
              placeholder="цена" min="1"
              className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-right focus:border-admin outline-none tabular-nums disabled:opacity-60"
            />
            <button
              onClick={submit} disabled={busy || done}
              className="px-3 py-1.5 bg-admin hover:bg-admin-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {busy ? '…' : done ? '✓' : 'Выложить'}
            </button>
            <button
              onClick={togglePostpone} disabled={busy || done}
              title="Скрыть из списка (B2B и т.п.)"
              className="px-2 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-500 text-sm rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              Отложить
            </button>
          </div>
        )}
        {msg && <div className={`text-xs mt-1 ${done ? 'text-green-700' : 'text-red-600'}`}>{msg}</div>}
      </td>
    </tr>
  )
}

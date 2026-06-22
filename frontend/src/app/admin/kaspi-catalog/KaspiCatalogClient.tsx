'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type Row = {
  id: string
  kaspiSku: string
  kaspiUrl: string | null
  kaspiProductId: string | null
  name: string
  brand: string | null
  priceTenge: number
  available: boolean
  productId: string | null
  productName: string | null
  offerActive: boolean | null
}

export default function KaspiCatalogClient({ rows, q, bound }: { rows: Row[]; q: string; bound?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(q)
  const [linking, setLinking] = useState(false)
  const [linkMsg, setLinkMsg] = useState<string | null>(null)

  const applyFilter = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(searchParams.toString())
    Object.entries(next).forEach(([k, v]) => {
      if (v) sp.set(k, v)
      else sp.delete(k)
    })
    router.push(`/admin/kaspi-catalog?${sp.toString()}`)
  }

  // Авто-привязка каталога к товарам по артикулу: dry-run → подтверждение → применить.
  const autoLink = async () => {
    setLinking(true); setLinkMsg(null)
    try {
      const dry = await fetch('/api/admin/kaspi-catalog/autolink').then(r => r.json())
      if (dry.error) throw new Error(dry.error)
      if (dry.linked === 0) {
        setLinkMsg(`Привязывать нечего: совпадений по артикулу нет (без товара Alash: ${dry.noProduct}).`)
        return
      }
      const ok = confirm(
        `Привязать ${dry.linked} карточек к товарам по артикулу?\n` +
        `• без товара на сайте: ${dry.noProduct}\n` +
        `• конфликтов (уже привязано): ${dry.conflicts}`
      )
      if (!ok) return
      const res = await fetch('/api/admin/kaspi-catalog/autolink', { method: 'POST' }).then(r => r.json())
      if (res.error) throw new Error(res.error)
      setLinkMsg(`✓ Привязано: ${res.linked} (создано ${res.created}, обновлено ${res.updated}). Без товара: ${res.noProduct}, конфликтов: ${res.conflicts}.`)
      router.refresh()
    } catch (e) {
      setLinkMsg('Ошибка: ' + (e as Error).message)
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <form
          onSubmit={e => { e.preventDefault(); applyFilter({ q: search }) }}
          className="flex-1"
        >
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, бренду или SKU"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none"
          />
        </form>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => applyFilter({ bound: undefined })}
            className={`px-3 py-2 text-sm ${!bound ? 'bg-admin text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >Все</button>
          <button
            onClick={() => applyFilter({ bound: 'yes' })}
            className={`px-3 py-2 text-sm border-l border-gray-200 ${bound === 'yes' ? 'bg-admin text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >Привязанные</button>
          <button
            onClick={() => applyFilter({ bound: 'no' })}
            className={`px-3 py-2 text-sm border-l border-gray-200 ${bound === 'no' ? 'bg-admin text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >Без привязки</button>
        </div>
        <button
          onClick={autoLink}
          disabled={linking}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 whitespace-nowrap"
          title="Создать офферы для карточек, чей SKU совпал с артикулом товара на сайте"
        >
          {linking ? 'Привязываю…' : '⚡ Авто-привязка по артикулу'}
        </button>
      </div>
      {linkMsg && <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{linkMsg}</div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Kaspi SKU</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Название</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Бренд</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Цена</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">URL Kaspi</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Товар Alash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Ничего не найдено</td></tr>
              )}
              {rows.map(r => (
                <CatalogRow key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
        {rows.length >= 500 && (
          <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
            Показано первые 500. Уточните поиск для точных результатов.
          </div>
        )}
      </div>
    </div>
  )
}

function CatalogRow({ row }: { row: Row }) {
  const [url, setUrl] = useState(row.kaspiUrl || '')
  const [pid, setPid] = useState(row.kaspiProductId)
  const [brand, setBrand] = useState(row.brand || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const patchEntry = async (body: any) => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/admin/kaspi-catalog/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'error')
      return data.entry
    } catch (e) {
      setErr((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }

  const saveUrl = async () => {
    if (url === (row.kaspiUrl || '')) return
    const e = await patchEntry({ kaspiUrl: url })
    if (e) setPid(e.kaspiProductId)
  }

  const saveBrand = async () => {
    if (brand === (row.brand || '')) return
    await patchEntry({ brand })
  }

  return (
    <tr>
      <td className="px-4 py-3 font-mono text-xs text-gray-700 align-top">{row.kaspiSku}</td>
      <td className="px-4 py-3 text-gray-900 max-w-md align-top">
        <div className="truncate" title={row.name}>{row.name}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <input
          type="text"
          value={brand}
          onChange={e => setBrand(e.target.value)}
          onBlur={saveBrand}
          disabled={busy}
          placeholder="бренд"
          className="w-28 px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-admin"
        />
      </td>
      <td className="px-4 py-3 text-right tabular-nums align-top">{row.priceTenge.toLocaleString('ru-RU')} ₸</td>
      <td className="px-4 py-3 align-top">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onBlur={saveUrl}
          disabled={busy}
          placeholder="https://kaspi.kz/shop/p/...-118134700/"
          className={`w-64 px-2 py-1 text-xs border rounded outline-none focus:border-admin ${err ? 'border-red-300 bg-red-50' : url ? 'border-green-300' : 'border-gray-200'}`}
        />
        {pid && <div className="text-[10px] text-green-600 font-mono mt-0.5">PID: {pid}</div>}
        {err && <div className="text-[10px] text-red-500 mt-0.5">{err}</div>}
      </td>
      <td className="px-4 py-3 align-top">
        {row.productId ? (
          <Link href={`/admin/products/${row.productId}`} className="text-admin hover:underline">
            #{row.productId} {row.productName}
          </Link>
        ) : (
          <span className="text-gray-400 text-xs">не привязан</span>
        )}
      </td>
    </tr>
  )
}

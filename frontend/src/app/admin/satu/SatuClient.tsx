'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Row = {
  id: string
  satuId: string
  sku: string | null
  name: string
  presence: string | null
  price: number | null
  active: boolean
  lastPushedAt: string | null
  product: { id: string; name: string; slug: string; available: number; inStock: boolean } | null
}

const PRESENCE_LABEL: Record<string, string> = {
  available: 'в наличии', order: 'под заказ', not_available: 'нет',
}

export default function SatuClient({
  rows, q, link, total, linked,
}: { rows: Row[]; q: string; link?: string; total: number; linked: number }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [search, setSearch] = useState(q)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [exportCount, setExportCount] = useState<number | null>(null)
  const [collisions, setCollisions] = useState<Array<{ id: string; name: string; sku: string; satuId: string }>>([])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 6000) }

  const loadExport = () => {
    fetch('/api/admin/satu/export')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.count !== undefined) setExportCount(d.count)
        if (Array.isArray(d?.nameCollisions)) setCollisions(d.nameCollisions)
      })
      .catch(() => {})
  }

  // подгрузить кол-во товаров Alash, которых нет на Satu
  useEffect(() => { loadExport() }, [])

  const doExport = async (limit: number) => {
    if (!confirm(`Выгрузить ${limit} товаров Alash на Satu? Создадутся новые карточки (название, артикул, цена, фото, описание, остаток).`)) return
    setBusy(true)
    flash(`Выгрузка ${limit} товаров на Satu… это займёт ~1–2 минуты`)
    try {
      const res = await fetch('/api/admin/satu/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit }),
      })
      const d = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(d.error || 'error')
      flash(`Выгружено: импорт ${d.imported}, дозалив полей ${d.enriched}, зеркало +${d.mirrored}` + (d.errors?.length ? ` · ошибок ${d.errors.length}: ${d.errors[0]}` : ''))
      // обновить счётчик кандидатов
      loadExport()
      router.refresh()
    } catch (e) { flash('Ошибка: ' + (e as Error).message) }
    finally { setBusy(false) }
  }

  const applyFilter = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString())
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k) })
    router.push(`/admin/satu?${p.toString()}`)
  }

  const doImport = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/satu/import', { method: 'POST' })
      const d = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(d.error || 'error')
      flash(`Импорт: получено ${d.fetched}, обновлено ${d.upserted}, авто-связь +${d.autoLinked}, без связи ${d.unlinked}` + (d.removed ? `, удалено ${d.removed}` : '') + (d.errors?.length ? ` · ошибок ${d.errors.length}` : ''))
      router.refresh()
    } catch (e) { flash('Ошибка: ' + (e as Error).message) }
    finally { setBusy(false) }
  }

  const doPush = async (dry: boolean) => {
    if (!dry && !confirm('Отправить остатки в Satu? Товары с остатком станут «в наличии», без остатка — «под заказ».')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/satu/push${dry ? '?dry=1' : ''}`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(d.error || 'error')
      flash(
        dry
          ? `Проверка: к отправке ${d.sent} товаров (связанных ${d.candidates}). Нажмите «Отправить остатки» чтобы применить.`
          : `Отправлено ${d.sent}, подтверждено Satu ${d.processed}` + (d.errors?.length ? ` · ошибок ${d.errors.length}` : '')
      )
      router.refresh()
    } catch (e) { flash('Ошибка: ' + (e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg max-w-md">{toast}</div>
      )}

      {/* Выгрузка товаров Alash → Satu (которых нет на Satu) */}
      {exportCount !== null && exportCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="text-sm font-semibold text-blue-900">
              {exportCount} товаров Alash ещё нет на Satu
            </div>
            <div className="text-xs text-blue-700 mt-0.5">
              Создаст карточки на Satu: название, артикул, цена, фото, HTML-описание, остаток.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => doExport(1)} disabled={busy} className="px-3 py-2 border border-blue-300 bg-white hover:bg-blue-100 text-blue-800 text-sm font-medium rounded-lg disabled:opacity-50">1 (тест)</button>
            <button onClick={() => doExport(20)} disabled={busy} className="px-3 py-2 border border-blue-300 bg-white hover:bg-blue-100 text-blue-800 text-sm font-medium rounded-lg disabled:opacity-50">20</button>
            <button onClick={() => doExport(Math.min(exportCount, 50))} disabled={busy} className="px-4 py-2 bg-admin hover:bg-admin-hover text-white text-sm font-medium rounded-lg disabled:opacity-50">↑ Выгрузить {Math.min(exportCount, 50)}</button>
          </div>
        </div>
      )}

      {/* Совпадения по имени с карточкой Satu без артикула — выгрузка создаст дубль */}
      {collisions.length > 0 && (
        <details className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <summary className="text-sm font-semibold text-amber-900 cursor-pointer">
            ⚠ {collisions.length} товаров уже есть на Satu без артикула — пропущены (иначе дубль)
          </summary>
          <div className="text-xs text-amber-800 mt-2 mb-2">
            Эти карточки Satu без артикула совпали по названию. Авто-выгрузка их пропускает.
            Привяжите вручную (артикул на старой карточке) или удалите старую и выгрузите заново.
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-amber-100">
              {collisions.map(c => (
                <tr key={c.id}>
                  <td className="py-1 pr-2 font-mono text-amber-700">SKU {c.sku}</td>
                  <td className="py-1 pr-2 text-amber-900">{c.name}</td>
                  <td className="py-1 text-amber-600 whitespace-nowrap">
                    <a href={`https://my.satu.kz/products/${c.satuId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">Satu #{c.satuId} ↗</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <form onSubmit={e => { e.preventDefault(); applyFilter({ q: search }) }} className="flex-1 min-w-[220px]">
          <input
            type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу (SKU)"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none"
          />
        </form>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button onClick={() => applyFilter({ link: undefined })} className={`px-3 py-2 ${!link ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}>Все</button>
          <button onClick={() => applyFilter({ link: 'yes' })} className={`px-3 py-2 border-l border-gray-200 ${link === 'yes' ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}>Привязанные</button>
          <button onClick={() => applyFilter({ link: 'no' })} className={`px-3 py-2 border-l border-gray-200 ${link === 'no' ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}>Без привязки</button>
        </div>
        <button onClick={doImport} disabled={busy} className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium rounded-lg disabled:opacity-50">⬇ Импорт товаров</button>
        <button onClick={() => doPush(true)} disabled={busy} className="px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium rounded-lg disabled:opacity-50">Проверить</button>
        <button onClick={() => doPush(false)} disabled={busy} className="px-4 py-2 bg-admin hover:bg-admin-hover text-white text-sm font-medium rounded-lg disabled:opacity-50">↑ Отправить остатки</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left">
                <th className="px-3 py-2.5 font-medium text-gray-700">Satu (SKU / название)</th>
                <th className="px-3 py-2.5 font-medium text-gray-700">Наличие Satu</th>
                <th className="px-3 py-2.5 font-medium text-gray-700">Товар Alash</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-right">Остаток Alash</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center" title="участвует в push остатков">active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Ничего не найдено. Нажмите «Импорт товаров».</td></tr>
              )}
              {rows.map(r => <SatuRow key={r.id} row={r} />)}
            </tbody>
          </table>
        </div>
        {rows.length >= 500 && (
          <div className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">Показано первые 500. Уточните поиск.</div>
        )}
      </div>
    </div>
  )
}

function SatuRow({ row }: { row: Row }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const patch = async (body: any) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/satu/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <tr className={!row.active ? 'opacity-60' : ''}>
      <td className="px-3 py-2 align-top max-w-xs">
        <div className="font-mono text-[11px] text-gray-500">SKU: {row.sku || '—'} · id {row.satuId}</div>
        <div className="text-gray-900 truncate text-[12px]" title={row.name}>{row.name}</div>
        {row.lastPushedAt && <div className="text-[10px] text-gray-400">отправлено: {new Date(row.lastPushedAt).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Almaty' })}</div>}
      </td>

      <td className="px-3 py-2 align-top">
        <span className="text-[11px] text-gray-600">{row.presence ? (PRESENCE_LABEL[row.presence] || row.presence) : '—'}</span>
      </td>

      <td className="px-3 py-2 align-top">
        {row.product ? (
          <div className="space-y-1">
            <Link href={`/admin/products/${row.product.id}`} className="text-admin hover:underline text-[12px]">#{row.product.id} {row.product.name}</Link>
            <div className="flex items-center gap-1">
              <a href={`/product/${row.product.slug}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-500 hover:text-admin">/product/{row.product.slug} ↗</a>
              <button onClick={() => { if (confirm('Отвязать от товара Alash?')) patch({ productId: null }) }} disabled={busy} className="text-[10px] text-red-500 hover:text-red-700 ml-auto">отвязать</button>
            </div>
          </div>
        ) : (
          <AlashLinker onBind={(pid) => patch({ productId: pid })} disabled={busy} />
        )}
      </td>

      <td className="px-3 py-2 align-top text-right tabular-nums">
        {row.product ? <span className={row.product.available > 0 ? 'text-gray-900' : 'text-red-500'}>{row.product.available}</span> : <span className="text-gray-300">—</span>}
      </td>

      <td className="px-3 py-2 align-top text-center">
        <button
          disabled={busy}
          onClick={() => patch({ active: !row.active })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${row.active ? 'bg-green-500' : 'bg-gray-300'}`}
          title={row.active ? 'участвует в push' : 'не участвует'}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${row.active ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </td>
    </tr>
  )
}

function AlashLinker({ onBind, disabled }: { onBind: (productId: string) => void; disabled: boolean }) {
  const [val, setVal] = useState('')
  const [results, setResults] = useState<any[]>([])
  const debounceRef = useRef<any>(null)

  const searchProducts = (qq: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!qq.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/alash-products/search?q=${encodeURIComponent(qq)}`)
        const data = await res.json()
        setResults(data.products || [])
      } catch {}
    }, 250)
  }

  return (
    <div className="relative">
      <input
        type="text" value={val}
        onChange={e => { setVal(e.target.value); searchProducts(e.target.value) }}
        disabled={disabled}
        placeholder="привязать: название / SKU / id"
        className="w-56 px-1.5 py-1 border border-gray-200 rounded text-[11px] outline-none focus:border-admin"
      />
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {results.map((p: any) => (
            <button key={p.id} onClick={() => { onBind(p.id); setVal(''); setResults([]) }} className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 border-b border-gray-50">
              <div className="text-gray-900 truncate">#{p.id} {p.name}</div>
              <div className="text-gray-400">/{p.slug} · stock {p.totalStock}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

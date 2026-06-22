'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type Row = {
  id: string
  name: string
  slug: string
  sku: string | null
  price: number
  cost: number | null
  ratio: number | null
  available: number
  totalStock: number
  reservedStock: number
  inStock: boolean
  hasCost: boolean
  categoryName: string | null
  imageUrl: string | null
}

const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU')

type TriFilter = 'any' | 'yes' | 'no'
type SortKey = 'name' | 'price' | 'stock' | 'markup' | 'category'
type SortDir = 'asc' | 'desc'

// локальные правки после сохранения (id → новые значения), чтобы карточка пересчиталась
type Patch = { cost?: number | null; totalStock?: number; archived?: boolean }

export default function CostFixClient({ rows: allRows }: { rows: Row[] }) {
  // Гибкие фильтры: себес (есть/нет/неважно) × наличие (есть/нет/неважно) + сортировка.
  const [costF, setCostF] = useState<TriFilter>('no') // по умолчанию: без себеса
  const [stockF, setStockF] = useState<TriFilter>('any')
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // сохранённые правки (мягко исключают/обновляют карточку)
  const [patches, setPatches] = useState<Record<string, Patch>>({})

  // применяем патчи к строкам (себес/остаток/архив)
  const patched = useMemo(
    () =>
      allRows.map((r) => {
        const p = patches[r.id]
        if (!p) return r
        const cost = 'cost' in p ? p.cost ?? null : r.cost
        const totalStock = p.totalStock ?? r.totalStock
        const available = Math.max(0, totalStock - r.reservedStock)
        return {
          ...r,
          cost,
          hasCost: cost != null && cost > 0,
          totalStock,
          available,
          archived: p.archived ?? false,
        } as Row & { archived?: boolean }
      }),
    [allRows, patches],
  )

  const matchTri = (f: TriFilter, val: boolean) => f === 'any' || (f === 'yes' ? val : !val)

  const rows = useMemo(() => {
    const list = patched.filter((r) => {
      if ((r as any).archived) return false
      if (!matchTri(costF, r.hasCost)) return false
      if (!matchTri(stockF, r.available > 0)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      let c = 0
      switch (sortBy) {
        case 'price': c = a.price - b.price; break
        case 'stock': c = a.available - b.available; break
        case 'markup': c = (a.ratio ?? 0) - (b.ratio ?? 0); break
        case 'category': c = (a.categoryName ?? 'яяя').localeCompare(b.categoryName ?? 'яяя', 'ru'); break
        case 'name': default: c = a.name.localeCompare(b.name, 'ru'); break
      }
      if (c === 0) c = a.name.localeCompare(b.name, 'ru') // вторичная стабилизация
      return c * dir
    })
    return list
  }, [patched, costF, stockF, sortBy, sortDir])

  // счётчики (по текущему набору после патчей, без учёта фильтров — для подписи)
  const stats = useMemo(() => {
    const live = patched.filter((r) => !(r as any).archived)
    return {
      total: live.length,
      noCost: live.filter((r) => !r.hasCost).length,
      noStock: live.filter((r) => r.available <= 0).length,
      costNoStock: live.filter((r) => r.hasCost && r.available <= 0).length,
    }
  }, [patched])

  // Очередь
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(0)
  const [costVal, setCostVal] = useState('')
  const [stockVal, setStockVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lastCost, setLastCost] = useState<number | null>(null)
  const costRef = useRef<HTMLInputElement>(null)
  const [anim, setAnim] = useState<'in' | 'left' | 'right'>('in')

  const total = rows.length
  const cur = rows[idx] ?? null

  // при смене фильтра/сортировки — в начало очереди
  const resetQueue = useCallback(() => setIdx(0), [])

  // фокус + подставить текущие значения при смене карточки
  useEffect(() => {
    if (!cur) return
    setCostVal(cur.cost != null && cur.cost > 0 ? String(cur.cost) : '')
    setStockVal(String(cur.totalStock))
    setErr(null)
    setAnim('in')
    const t = setTimeout(() => costRef.current?.focus(), 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cur?.id])

  const save = useCallback(async () => {
    if (!cur || busy) return
    const body: Record<string, unknown> = {}
    // себес
    const cRaw = costVal.trim().replace(',', '.')
    if (cRaw !== '') {
      const cn = Number(cRaw)
      if (!Number.isFinite(cn) || cn < 0) { setErr('Себес — число ≥ 0'); return }
      if (cn !== (cur.cost ?? -1)) body.costPrice = cn
    }
    // остаток
    const sRaw = stockVal.trim()
    if (sRaw !== '') {
      const sn = Math.round(Number(sRaw))
      if (!Number.isFinite(sn) || sn < 0) { setErr('Остаток — целое ≥ 0'); return }
      if (sn !== cur.totalStock) body.totalStock = sn
    }
    if (Object.keys(body).length === 0) { setErr('Ничего не изменено'); return }

    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/admin/products/${cur.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Ошибка ${res.status}`)
      }
      if ('costPrice' in body) setLastCost(body.costPrice as number)
      setDone((d) => d + 1)
      setAnim('right')
      const patch: Patch = {}
      if ('costPrice' in body) patch.cost = body.costPrice as number
      if ('totalStock' in body) patch.totalStock = body.totalStock as number
      // карточка пересчитается и, если выпала из фильтра, исчезнет из очереди
      setTimeout(() => setPatches((m) => ({ ...m, [cur.id]: { ...m[cur.id], ...patch } })), 160)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [cur, costVal, stockVal, busy])

  // Удалить = в архив (общая логика)
  const archiveProduct = useCallback(async () => {
    if (!cur || busy) return
    const label = cur.name.length > 70 ? cur.name.slice(0, 70) + '…' : cur.name
    if (!window.confirm(`Удалить «${label}»?\nТовар уйдёт в архив (скроется с сайта, Google и каналов). Вернуть — через фильтр «Архив» в товарах.`)) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch('/api/admin/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cur.id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Ошибка ${res.status}`)
      }
      setAnim('left')
      setTimeout(() => setPatches((m) => ({ ...m, [cur.id]: { ...m[cur.id], archived: true } })), 160)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [cur, busy])

  const skip = useCallback(() => {
    if (busy) return
    setAnim('left')
    setTimeout(() => setIdx((i) => i + 1), 160)
  }, [busy])
  const back = useCallback(() => { if (idx > 0 && !busy) { setAnim('in'); setIdx((i) => i - 1) } }, [idx, busy])

  const repeatLastCost = useCallback(() => {
    if (lastCost != null) { setCostVal(String(lastCost)); setErr(null); costRef.current?.focus() }
  }, [lastCost])

  // Enter — сохранить, Esc — пропустить
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); save() }
      else if (e.key === 'Escape') { e.preventDefault(); skip() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, skip])

  const pct = total ? Math.round((idx / total) * 100) : 100

  const margin = useMemo(() => {
    if (!cur) return null
    const n = Number(costVal.trim().replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) return null
    return { tg: Math.round(cur.price - n), x: cur.price > 0 ? cur.price / n : 0 }
  }, [cur, costVal])

  // ── Панель фильтров (всегда видна сверху) ──────────────────────────────────
  const FilterBar = (
    <div className="mb-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Себес и остатки</h1>
        <span className="text-lg text-gray-500 tabular-nums">{total ? idx + 1 : 0} / {total}</span>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Себестоимость</span>
          <select
            value={costF}
            onChange={(e) => { setCostF(e.target.value as TriFilter); resetQueue() }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-admin"
          >
            <option value="any">Неважно</option>
            <option value="no">Нет себеса</option>
            <option value="yes">Есть себес</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Наличие</span>
          <select
            value={stockF}
            onChange={(e) => { setStockF(e.target.value as TriFilter); resetQueue() }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-admin"
          >
            <option value="any">Неважно</option>
            <option value="yes">В наличии</option>
            <option value="no">Нет в наличии</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Сортировка</span>
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value as SortKey); resetQueue() }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-admin"
          >
            <option value="name">По алфавиту</option>
            <option value="category">По категории</option>
            <option value="price">По цене</option>
            <option value="stock">По остатку</option>
            <option value="markup">По наценке</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Порядок</span>
          <select
            value={sortDir}
            onChange={(e) => { setSortDir(e.target.value as SortDir); resetQueue() }}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-admin"
          >
            <option value="asc">↑ по возрастанию</option>
            <option value="desc">↓ по убыванию</option>
          </select>
        </label>
      </div>

      {/* быстрые пресеты */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="text-gray-400 self-center">Быстро:</span>
        <button onClick={() => { setCostF('no'); setStockF('yes'); setSortBy('name'); resetQueue() }}
          className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">
          Без себеса · в наличии ({patched.filter((r) => !(r as any).archived && !r.hasCost && r.available > 0).length})
        </button>
        <button onClick={() => { setCostF('no'); setStockF('any'); setSortBy('name'); resetQueue() }}
          className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">
          Без себеса · все ({stats.noCost})
        </button>
        <button onClick={() => { setCostF('yes'); setStockF('no'); setSortBy('name'); resetQueue() }}
          className="px-3 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium">
          Есть себес · нет в наличии ({stats.costNoStock})
        </button>
      </div>

      <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-admin transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex gap-3 text-sm text-gray-400">
        <span>🟠 без себеса {stats.noCost}</span>
        <span>📦 нет в наличии {stats.noStock}</span>
        <span className="ml-auto text-green-600">✓ сохранено {done}</span>
      </div>
    </div>
  )

  if (!cur) {
    return (
      <div className="max-w-2xl mx-auto">
        {FilterBar}
        <div className="text-center py-16 space-y-4 bg-white rounded-2xl border border-gray-200">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900">По этому фильтру всё готово</h2>
          <p className="text-gray-500">Сохранено за сессию: <b>{done}</b>. Поменяй фильтр выше, чтобы продолжить.</p>
          <div className="pt-2">
            <Link href="/admin/kaspi" className="px-4 py-2 rounded-lg bg-admin hover:bg-admin-hover text-white text-sm font-medium">
              К Kaspi
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const animCls =
    anim === 'left' ? '-translate-x-8 opacity-0 -rotate-2'
    : anim === 'right' ? 'translate-x-8 opacity-0 rotate-2'
    : 'translate-x-0 opacity-100 rotate-0'

  return (
    <div className="max-w-2xl mx-auto">
      {FilterBar}

      <div className={`bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden transition-all duration-150 ease-out ${animCls}`}>
        {/* Фото */}
        <div className="relative aspect-square bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
          {cur.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.imageUrl} alt={cur.name} className="w-full h-full object-contain p-2" />
          ) : (
            <div className="text-gray-300 text-sm flex flex-col items-center gap-2">
              <span className="text-5xl">📦</span>нет фото
            </div>
          )}
          <span className={`absolute top-4 right-4 text-sm font-semibold px-3 py-1.5 rounded-full border ${cur.available > 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
            {cur.available > 0 ? `${cur.available} шт` : 'нет в наличии'}
          </span>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <a href={`/product/${cur.slug}`} target="_blank" rel="noopener"
              className="text-2xl font-semibold text-gray-900 leading-snug hover:text-admin line-clamp-2" title={cur.name}>
              {cur.name}
            </a>
            <div className="text-sm text-gray-400 mt-1 flex gap-3 flex-wrap">
              {cur.sku && <span>арт. {cur.sku}</span>}
              {cur.categoryName && <span>· {cur.categoryName}</span>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-gray-50 rounded-xl py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Цена</div>
              <div className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{fmt(cur.price)} ₸</div>
            </div>
            <div className="bg-gray-50 rounded-xl py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Остаток</div>
              <div className="text-xl font-bold text-gray-900 tabular-nums mt-0.5">{cur.totalStock}</div>
            </div>
            <div className="bg-gray-50 rounded-xl py-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Себес сейчас</div>
              <div className={`text-xl font-bold tabular-nums mt-0.5 ${cur.cost == null || cur.cost <= 0 ? 'text-gray-300' : cur.cost < 10 ? 'text-red-500' : 'text-gray-700'}`}>
                {cur.cost == null || cur.cost <= 0 ? '—' : `${cur.cost} ₸`}
              </div>
            </div>
          </div>

          {/* Поля ввода: себес + остаток */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-base font-medium text-gray-600">Себестоимость, ₸</label>
                {lastCost != null && (
                  <button onClick={repeatLastCost} disabled={busy}
                    className="text-sm font-medium text-admin hover:underline disabled:opacity-50"
                    title="Подставить прошлый себес">⟳ {fmt(lastCost)}</button>
                )}
              </div>
              <input
                ref={costRef}
                type="number" inputMode="decimal" step="0.01" min={0}
                value={costVal}
                onChange={(e) => { setCostVal(e.target.value); setErr(null) }}
                placeholder={lastCost != null ? `напр. ${fmt(lastCost)}` : 'напр. 850'}
                disabled={busy}
                className="mt-2 w-full px-4 py-4 text-2xl font-semibold tabular-nums border-2 border-gray-200 rounded-xl outline-none focus:border-admin disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-base font-medium text-gray-600">Остаток, шт</label>
              <input
                type="number" inputMode="numeric" step="1" min={0}
                value={stockVal}
                onChange={(e) => { setStockVal(e.target.value); setErr(null) }}
                placeholder="0"
                disabled={busy}
                className="mt-2 w-full px-4 py-4 text-2xl font-semibold tabular-nums border-2 border-gray-200 rounded-xl outline-none focus:border-admin disabled:opacity-50"
              />
              {cur.reservedStock > 0 && (
                <div className="text-xs text-gray-400 mt-1">в брони: {cur.reservedStock} · доступно: {cur.available}</div>
              )}
            </div>
          </div>

          {margin && (
            <div className={`text-base ${margin.tg >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              маржа ≈ {fmt(margin.tg)} ₸ · наценка ×{margin.x.toFixed(1)}
              {margin.x > 5 && <span className="text-amber-500"> — очень высокая, проверь себес</span>}
            </div>
          )}
          {err && <div className="text-base text-red-500">{err}</div>}

          <button
            onClick={save}
            disabled={busy}
            className="w-full px-7 py-4 rounded-xl bg-admin hover:bg-admin-hover text-white text-lg font-semibold disabled:opacity-50"
          >
            {busy ? '…' : '✓ Сохранить и дальше'}
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button onClick={back} disabled={idx === 0 || busy}
          className="px-5 py-2.5 rounded-lg text-base font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-30">← Назад</button>
        <span className="text-sm text-gray-400 hidden sm:block">Enter — сохранить · Esc — пропустить</span>
        <button onClick={skip} disabled={busy}
          className="px-5 py-2.5 rounded-lg text-base font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50">Пропустить →</button>
      </div>

      <div className="mt-4 text-center">
        <button onClick={archiveProduct} disabled={busy}
          className="text-sm font-medium text-red-500 hover:text-red-600 hover:underline disabled:opacity-50"
          title="Удалить товар — он уйдёт в архив (можно вернуть)">
          🗑 Удалить товар (в архив)
        </button>
      </div>
    </div>
  )
}

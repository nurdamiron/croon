'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState } from 'react'

type Row = {
  catalog: {
    id: string
    kaspiSku: string
    kaspiUrl: string | null
    kaspiProductId: string | null
    name: string
    brand: string | null
    priceTenge: number
    available: boolean
  }
  offer: {
    id: string
    kaspiName: string | null
    kaspiBrand: string | null
    priceTenge: number
    active: boolean
    stockOverride: number | null
    availableOverride: boolean | null
    preOrder: number
    showOnSite: boolean | null
    // Демпинг
    autoDownscale: boolean
    autoUpscale: boolean
    dumpPriority: boolean
    minPriceTenge: number | null
    maxPriceTenge: number | null
    dumpingStep: number
    strategy: string
    ignoreMerchants: string[]
    firstPlacePrice: number | null
    rivalPrice: number | null
    rivalName: string | null
    ourPosition: number | null
    competitorCount: number | null
    lastDumpCheckAt: string | Date | null
    lastDumpError: string | null
    product: { id: string; name: string; slug: string; totalStock: number; inStock: boolean; costPrice: number | null } | null
  } | null
}

export default function KaspiClient({ rows, q, bound, commissionMult }: { rows: Row[]; q: string; bound?: string; commissionMult: number }) {
  const router = useRouter()
  const sp = useSearchParams()
  const [search, setSearch] = useState(q)
  const [selected, setSelected] = useState<Set<string>>(new Set())          // offer.id (для демпинг/оффер-операций)
  const [selCat, setSelCat] = useState<Set<string>>(new Set())              // catalog.id (для удаления из каталога)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  // Множители формулы min/max (по умолчанию: min=себес×1.3, max-соло=сайт×1.0, max-конк=конкурент×0.99)
  const [kMin, setKMin] = useState('1.3')
  const [kMax, setKMax] = useState('1.0')
  const [kRival, setKRival] = useState('0.99')
  const [minmaxOpen, setMinmaxOpen] = useState(false)
  // меняется после каждого bulk-действия — форсит перемонтирование строк,
  // чтобы неуправляемые поля (defaultValue: stock/preorder/price) обновились
  const [tableKey, setTableKey] = useState(0)

  const flashToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const applyFilter = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(sp.toString())
    Object.entries(next).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k) })
    router.push(`/admin/kaspi?${p.toString()}`)
  }

  // Bulk-операции работают только над привязанными офферами (KaspiOffer.id)
  const offerIds = rows.filter(r => r.offer).map(r => r.offer!.id)
  const allSelected = offerIds.length > 0 && offerIds.every(id => selected.has(id))

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(offerIds))

  // --- Выбор каталожных записей (для удаления из каталога; работает для любых строк) ---
  const catIds = rows.map(r => r.catalog.id)
  const allCatSelected = catIds.length > 0 && catIds.every(id => selCat.has(id))
  const toggleCat = (id: string) => setSelCat(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleAllCat = () => setSelCat(allCatSelected ? new Set() : new Set(catIds))

  // Удалить выбранные каталожные записи (и связанные офферы) — навсегда из нашей БД.
  const deleteCatalog = async () => {
    const ids = Array.from(selCat)
    if (!ids.length) return
    if (!confirm(`Удалить ${ids.length} записей из каталога Kaspi? Это уберёт их из админки навсегда (товары сайта не затрагиваются). На самом Kaspi их нужно снять отдельно в кабинете.`)) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-catalog/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'delete' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'error')
      setSelCat(new Set())
      flashToast(`Удалено из каталога: ${data.catalogDeleted}${data.offersDeleted ? `, офферов: ${data.offersDeleted}` : ''}`)
      router.refresh()
    } catch (e) { alert('Ошибка: ' + (e as Error).message) }
    finally { setBulkBusy(false) }
  }

  // Выбрать ВСЕ офферы по текущему фильтру (не только видимую страницу).
  // scope=all — все привязанные офферы; scope=active — только активные в фиде.
  const selectAllByFilter = async (scope: 'all' | 'active') => {
    setBulkBusy(true)
    try {
      const p = new URLSearchParams({ scope })
      if (search) p.set('q', search)
      // пробрасываем активные демпинг-фильтры из URL — чтобы «Выбрать всё»
      // выбрало именно отфильтрованные офферы (для массовых изменений по позиции)
      for (const k of ['pos', 'comp', 'down', 'up', 'nofloor', 'pain', 'loss', 'expensive', 'underdump', 'stale', 'alonenoceil', 'nocost', 'notvisible']) {
        const v = sp.get(k)
        if (v) p.set(k, v)
      }
      const res = await fetch(`/api/admin/kaspi-offers/ids?${p.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'error')
      setSelected(new Set<string>(data.ids))
      if (!data.ids.length) {
        flashToast(scope === 'active' ? 'Активных офферов в фиде нет' : 'Привязанных офферов нет')
      } else {
        flashToast(`Выбрано ${data.ids.length} офферов`)
        // прокрутить к тулбару массовых операций, чтобы было видно что выделилось
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  const doBulk = async (action: string, opts?: { confirmMsg?: string; value?: unknown; keepSelection?: boolean }) => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (opts?.confirmMsg && !confirm(opts.confirmMsg.replace('{n}', String(ids.length)))) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-offers/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, value: opts?.value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'error')
      if (!opts?.keepSelection) setSelected(new Set())
      flashToast(`Применено к ${data.affected ?? 0} офферам`)
      setTableKey(k => k + 1)
      router.refresh()
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  // ⚡ Просчитать min/max по формуле для выбранных офферов.
  const applyMinMaxFormula = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    const a = Number(kMin), b = Number(kMax), c = Number(kRival)
    if (![a, b, c].every((x) => Number.isFinite(x) && x > 0)) { alert('Множители должны быть числами > 0'); return }
    if (!confirm(
      `Просчитать min/max для ${ids.length} офферов?\n` +
      `• min = себес × ${a}\n` +
      `• max (мы одни) = цена сайта × ${b}\n` +
      `• max (есть конкуренты) = цена конкурента × ${c}\n\n` +
      `Без себеса и где min>max — пропустим. Существующие min/max перезапишутся.`
    )) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-offers/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'set-minmax-formula', value: { kMin: a, kMax: b, kRival: c } }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      let msg = `✓ min/max выставлены: ${d.affected}`
      if (d.skippedNoCost) msg += ` · без себеса: ${d.skippedNoCost}`
      if (d.skippedMinGtMax) msg += ` · min>max: ${d.skippedMinGtMax}`
      flashToast(msg)
      if (d.skippedNoCost || d.skippedMinGtMax) {
        const parts: string[] = []
        if (d.skippedNoCostSamples?.length) parts.push('Без себеса:\n' + d.skippedNoCostSamples.join(', '))
        if (d.skippedMinGtMaxSamples?.length) parts.push('min>max:\n' + d.skippedMinGtMaxSamples.join('\n'))
        if (parts.length) alert('Пропущены:\n\n' + parts.join('\n\n'))
      }
      setTableKey(k => k + 1)
      router.refresh()
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  // 🔄 Скан + просчёт min/max: ставим задачу воркеру (он снимет свежие цены и применит формулу).
  const queueScanMinMax = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    const a = Number(kMin), b = Number(kMax), c = Number(kRival)
    if (![a, b, c].every((x) => Number.isFinite(x) && x > 0)) { alert('Множители должны быть числами > 0'); return }
    if (!confirm(
      `Поставить «скан + просчёт min/max» для ${ids.length} офферов?\n` +
      `Воркер на маке снимет СВЕЖИЕ цены конкурентов и применит:\n` +
      `• min = себес × ${a}\n• max (мы одни) = цена сайта × ${b}\n• max (конкуренты) = конкурент × ${c}\n\n` +
      `Применится в течение ближайшего цикла воркера (не мгновенно).`
    )) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-offers/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'scan-minmax-formula', value: { kMin: a, kMax: b, kRival: c } }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      flashToast(`🔄 Поставлено в очередь воркеру: ${d.affected}. Применится после ближайшего скана.`)
    } catch (e) {
      alert('Ошибка: ' + (e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  // Запросить число у пользователя и применить параметризованное действие
  const promptBulk = (action: string, label: string, opts?: { allowEmpty?: boolean; def?: string; confirmMsg?: string }) => {
    const raw = window.prompt(label, opts?.def ?? '')
    if (raw === null) return
    const trimmed = raw.trim()
    if (trimmed === '' && !opts?.allowEmpty) return
    doBulk(action, { value: trimmed === '' ? null : trimmed, confirmMsg: opts?.confirmMsg, keepSelection: true })
  }

  // Демпинг: ручной прогон («Проверить сейчас») по выбранным офферам.
  // dryRun=true — только снять метрики конкурентов, цену не менять (безопасная разведка).
  const runDumping = async (dryRun: boolean) => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!dryRun && !confirm(`Запустить демпинг по ${ids.length} офферам? Цена будет изменена у тех, где включено автоснижение/повышение и задан floor.`)) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-dumping/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'error')
      flashToast(`Проверено ${data.checked}: изменено ${data.changed}, без PID ${data.noPid}, ошибок ${data.errors}${dryRun ? ' (разведка)' : ''}`)
      setTableKey(k => k + 1)
      router.refresh()
    } catch (e) {
      alert('Ошибка демпинга: ' + (e as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
      <div className="flex items-center gap-2">
        <form onSubmit={e => { e.preventDefault(); applyFilter({ q: search }) }} className="flex-1">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию Kaspi, бренду или SKU"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none"
          />
        </form>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button onClick={() => applyFilter({ bound: undefined })} className={`px-3 py-2 ${!bound ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}>Все</button>
          <button onClick={() => applyFilter({ bound: 'yes' })} className={`px-3 py-2 border-l border-gray-200 ${bound === 'yes' ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}>Привязанные</button>
          <button onClick={() => applyFilter({ bound: 'no' })} className={`px-3 py-2 border-l border-gray-200 ${bound === 'no' ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}>Без привязки</button>
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          <button
            disabled={bulkBusy}
            onClick={() => selectAllByFilter('all')}
            className="px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-50"
            title="Выбрать все привязанные офферы по текущему поиску (не только видимые)"
          >Выбрать все</button>
          <button
            disabled={bulkBusy}
            onClick={() => selectAllByFilter('active')}
            className="px-3 py-2 border-l border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
            title="Выбрать только активные в фиде офферы по текущему поиску"
          >все активные</button>
        </div>
        <CatalogUpload onDone={() => router.refresh()} />
      </div>

      {/* Панель удаления каталожных записей (любые строки, в т.ч. без оффера) */}
      {selCat.size > 0 && (
        <div className="sticky top-0 z-30 bg-red-600/95 backdrop-blur text-white rounded-lg px-4 py-2.5 shadow-md flex items-center gap-3 flex-wrap">
          <span className="font-medium">Отмечено для удаления: {selCat.size}</span>
          <div className="h-5 w-px bg-white/30" />
          <button
            disabled={bulkBusy}
            onClick={deleteCatalog}
            className="px-3 py-1 bg-white text-red-600 hover:bg-red-50 rounded text-sm font-medium transition"
          >✕ Удалить из каталога Kaspi</button>
          <span className="text-xs text-white/80">товары сайта не затрагиваются · на Kaspi снять отдельно в кабинете</span>
          <button
            disabled={bulkBusy}
            onClick={() => setSelCat(new Set())}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition ml-auto"
          >Снять</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-0 z-30 bg-admin/95 backdrop-blur text-white rounded-lg px-4 py-2.5 shadow-md flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-medium">Выбрано: {selected.size}</span>
          <div className="h-5 w-px bg-white/30" />
          {/* ⚡ Формула min/max */}
          <button
            disabled={bulkBusy}
            onClick={() => setMinmaxOpen((o) => !o)}
            className="px-3 py-1 bg-green-500/40 hover:bg-green-500/60 rounded text-sm font-medium transition"
            title="Просчитать min/max по формуле: min=себес×K, max=сайт×K (или конкурент×K)"
          >⚡ Просчитать min/max {minmaxOpen ? '▴' : '▾'}</button>
          <div className="h-5 w-px bg-white/30" />
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('activate')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="В фид (active=true)"
          >▶ Активировать</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('deactivate')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Убрать из фида (active=false)"
          >⏸ Деактивировать</button>
          <div className="h-5 w-px bg-white/30" />
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('available-no')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="availableOverride=false"
          >available = no</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('available-yes')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="availableOverride=true"
          >available = yes</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('available-auto')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="availableOverride = null (как у Product)"
          >available = auto</button>
          <div className="h-5 w-px bg-white/30" />
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('site-yes')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Показывать блок «Купить на Kaspi» на сайте"
          >сайт = да</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('site-no')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Скрыть блок на сайте"
          >сайт = нет</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('site-auto')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Показ блока = как act"
          >сайт = auto</button>
          <div className="h-5 w-px bg-white/30" />
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-preorder', 'Дней предзаказа (0–30) для выбранных:', { def: '0' })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="preOrder для всех выбранных (0–30 дней)"
          >preOrder…</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('set-stock', { value: 0, keepSelection: true, confirmMsg: 'Обнулить остатки (stockCount=0) у {n} офферов?' })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="stockCount=0 для выбранных (оффер остаётся, но количество 0)"
          >stock = 0</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-stock', 'stockCount для выбранных (пусто = auto, берётся из товара):', { allowEmpty: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Задать stockCount или сбросить в auto"
          >stock…</button>
          <div className="h-5 w-px bg-white/30" />
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-price', 'Цена (тг) для всех выбранных:')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Установить одну цену для выбранных"
          >цена…</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('markup', 'Наценка в % (например 10 или -5) к текущей цене выбранных:')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Изменить цену выбранных на % (от текущей цены оффера)"
          >наценка %…</button>
          <div className="h-5 w-px bg-white/30" />
          {/* --- Демпинг --- */}
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('dump-down-on', { keepSelection: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Включить автоснижение (демпинг под конкурента до floor)"
          >↓ автосниж вкл</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('dump-down-off', { keepSelection: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
          >↓ выкл</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('dump-up-on', { keepSelection: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Включить автоповышение (поднимать цену к max когда конкурентов нет)"
          >↑ автоповыш вкл</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('dump-up-off', { keepSelection: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
          >↑ выкл</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-dump-step', 'Шаг демпинга (тг, на сколько ниже конкурента):', { def: '2' })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
          >шаг…</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-min-price', 'Мин. цена (floor, тг) для выбранных. Пусто = сброс:', { allowEmpty: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
          >мин. цена…</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-floor-auto', `Авто-floor = закуп × ${commissionMult}. Доп. наценка сверху в % (0 = ровно безубыток):`, { def: '0' })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title={`minPrice = round(costPrice × ${commissionMult} × (1+%/100)). У кого нет закупа — пропускаются.`}
          >floor от закупа…</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-max-price', 'Макс. цена (ceiling, тг) для выбранных. Пусто = сброс:', { allowEmpty: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
          >макс. цена…</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-floor-pct', 'Floor = текущая цена − N%. Введи N (напр. 15 → пол на 15% ниже цены):', { def: '15' })}
            className="px-3 py-1 bg-amber-400/30 hover:bg-amber-400/50 rounded text-sm transition"
            title="Поставить мин.цену = цена−N% (БЕЗ закупа). Разблокирует снижение у товаров без floor — главное лекарство."
          >🩹 floor = −%…</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('set-ceiling-pct', 'Потолок = текущая цена + N%. Введи N (для товаров без конкурентов):', { def: '20' })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Поставить макс.цену = цена+N%. Для автоповышения там, где конкурентов нет."
          >потолок = +%…</button>
          <div className="h-5 w-px bg-white/30" />
          {/* Стратегия демпинга (4 режима движка) */}
          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) doBulk('set-dump-strategy', { value: v, keepSelection: true }) }}
            className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition text-white [&>option]:text-gray-900"
            title="Стратегия демпинга для выбранных"
          >
            <option value="">стратегия…</option>
            <option value="BECOME_FIRST">Стать первым (−шаг от лидера)</option>
            <option value="FIRST_MIN_GAP">Первым, но впритык (−шаг от 2-го)</option>
            <option value="MATCH_FIRST">Равная лидеру</option>
            <option value="HOLD_SECOND">Держать 2-е место</option>
          </select>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('beat-now', { keepSelection: true, confirmMsg: 'Выйти в топ сейчас по {n} офферам? Цена станет = конкурент − шаг (не ниже floor).' })}
            className="px-3 py-1 bg-green-500/40 hover:bg-green-500/60 rounded text-sm transition"
            title="Разово опустить цену до «конкурент − шаг» по выбранным, не дожидаясь авто-прогона. Защита floor соблюдается."
          >⚡ выйти в топ сейчас</button>
          <div className="h-5 w-px bg-white/30" />
          {/* Игнор-лист продавца */}
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('ignore-merchant-add', 'Не обгонять продавца (имя/id из строки «против:»):')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Добавить продавца в игнор — движок не будет его обгонять (свой 2-й аккаунт/партнёр)"
          >🛡 не обгонять…</button>
          <button
            disabled={bulkBusy}
            onClick={() => promptBulk('ignore-merchant-remove', 'Убрать продавца из игнор-листа (имя/id):')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
          >убрать из игнора…</button>
          <div className="h-5 w-px bg-white/30" />
          {/* Пауза / резюм / сброс */}
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('dump-pause', { keepSelection: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Заморозить демпинг (оба тумблера off), сохранив floor/потолок/стратегию"
          >⏸ пауза</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('dump-resume', { keepSelection: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Вернуть демпинг (включить автоснижение)"
          >▶ возобновить</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('dump-reset', { confirmMsg: 'Сбросить ВСЕ демпинг-настройки у {n} офферов (тумблеры, floor, потолок, игнор, стратегия)?', keepSelection: true })}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
            title="Полный сброс демпинг-настроек к дефолту (метрики не трогаются)"
          >↺ сброс демпинга</button>
          <div className="h-5 w-px bg-white/30" />
          <button
            disabled={bulkBusy}
            onClick={() => runDumping(true)}
            className="px-3 py-1 bg-blue-400/30 hover:bg-blue-400/50 rounded text-sm transition"
            title="Серверный прогон (offer-view). Работает только если IP сервера не заблокирован Kaspi — обычно демпинг гонит внешний воркер с резидентного IP."
          >🔍 проверить (сервер)</button>
          <button
            disabled={bulkBusy}
            onClick={() => runDumping(false)}
            className="px-3 py-1 bg-green-400/30 hover:bg-green-400/50 rounded text-sm transition"
            title="Серверный демпинг (offer-view). С прод-IP обычно блокируется Kaspi (405) — реальный демпинг делает внешний кабинетный воркер."
          >⚡ демпинг (сервер)</button>
          <button
            disabled={bulkBusy}
            onClick={() => doBulk('delete', { confirmMsg: 'Удалить {n} офферов? Это действие необратимо.' })}
            className="px-3 py-1 bg-red-500 hover:bg-red-600 rounded text-sm transition ml-auto"
          >✕ Удалить</button>
          <button
            disabled={bulkBusy}
            onClick={() => setSelected(new Set())}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition"
          >Снять выделение</button>
        </div>

        {/* Форма формулы min/max */}
        {minmaxOpen && (
          <div className="bg-white/10 rounded-lg px-3 py-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-white/70 text-xs">min = себес ×</span>
              <input type="number" step="0.01" min="0" value={kMin} onChange={(e) => setKMin(e.target.value)}
                className="w-20 px-2 py-1 rounded text-gray-900 outline-none" />
            </label>
            <span className="text-white/40 pb-1.5 text-xs">пол (ниже не падаем)</span>
            <div className="h-8 w-px bg-white/20" />
            <label className="flex flex-col gap-1">
              <span className="text-white/70 text-xs">max (мы одни) = цена сайта ×</span>
              <input type="number" step="0.01" min="0" value={kMax} onChange={(e) => setKMax(e.target.value)}
                className="w-20 px-2 py-1 rounded text-gray-900 outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-white/70 text-xs">max (есть конкуренты) = конкурент ×</span>
              <input type="number" step="0.01" min="0" value={kRival} onChange={(e) => setKRival(e.target.value)}
                className="w-20 px-2 py-1 rounded text-gray-900 outline-none" />
            </label>
            <button
              disabled={bulkBusy}
              onClick={applyMinMaxFormula}
              className="px-4 py-1.5 bg-green-500 hover:bg-green-600 rounded font-medium transition disabled:opacity-50"
              title="Сразу по последнему скану (быстро, но данные могут быть не свежими)"
            >{bulkBusy ? '…' : `⚡ Сразу (${selected.size})`}</button>
            <button
              disabled={bulkBusy}
              onClick={queueScanMinMax}
              className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 rounded font-medium transition disabled:opacity-50"
              title="Воркер снимет СВЕЖИЕ цены конкурентов и применит формулу (надёжнее, не мгновенно)"
            >{bulkBusy ? '…' : `🔄 Скан + просчёт (${selected.size})`}</button>
            <span className="text-white/50 text-xs basis-full">
              <b>⚡ Сразу</b> — по последнему скану (быстро). <b>🔄 Скан + просчёт</b> — воркер снимет свежие
              цены конкурентов и применит формулу (надёжнее, в течение цикла воркера).
              Нет себеса или min&gt;max → пропуск. Существующие min/max перезаписываются.
            </span>
          </div>
        )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left">
                <th className="px-3 py-2.5 w-8">
                  <div className="flex flex-col gap-1.5 items-center">
                    {offerIds.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        title={allSelected ? 'Снять выделение офферов' : 'Выбрать все офферы на странице'}
                        className="rounded border-gray-300 cursor-pointer"
                      />
                    )}
                    <input
                      type="checkbox"
                      checked={allCatSelected}
                      onChange={toggleAllCat}
                      title={allCatSelected ? 'Снять отметки удаления' : 'Отметить всё на странице для удаления'}
                      className="rounded border-red-300 cursor-pointer accent-red-500"
                    />
                  </div>
                </th>
                <th className="px-3 py-2.5 font-medium text-gray-700">Kaspi</th>
                <th className="px-3 py-2.5 font-medium text-gray-700">Kaspi URL</th>
                <th className="px-3 py-2.5 font-medium text-gray-700">Товар сайта</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-right">Цена</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center" title="available">avl</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center" title="preOrder (0–30 дней)">pre</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-right" title="stockCount">stock</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center" title="оффер активен в фиде">act</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center" title="блок «Купить на Kaspi» на странице товара (auto = как act)">сайт</th>
                {/* --- Демпинг --- */}
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center border-l border-gray-200" title="наша позиция в выдаче Kaspi / цена 1 места">Поз.</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-right" title="мин/макс цена (floor/ceiling) и маржа">Мин · Макс</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center" title="шаг демпинга (тг)">шаг</th>
                <th className="px-3 py-2.5 font-medium text-gray-700 text-center" title="автоснижение / автоповышение">Демпинг</th>
              </tr>
            </thead>
            <tbody key={tableKey} className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr><td colSpan={14} className="px-4 py-8 text-center text-gray-500">Ничего не найдено</td></tr>
              )}
              {rows.map(r => (
                <KaspiRow
                  key={r.catalog.id}
                  row={r}
                  checked={r.offer ? selected.has(r.offer.id) : false}
                  onCheck={r.offer ? () => toggleOne(r.offer!.id) : null}
                  catChecked={selCat.has(r.catalog.id)}
                  onCatCheck={() => toggleCat(r.catalog.id)}
                  commissionMult={commissionMult}
                />
              ))}
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

// Маржа = цена − закуп × множитель_комиссии (по решению владельца, ×1.41).
function calcMargin(price: number | null | undefined, cost: number | null | undefined, mult: number) {
  if (price == null || price <= 0 || cost == null || cost <= 0) return null
  const tg = Math.round(price - cost * mult)
  const pct = Math.round((tg / price) * 1000) / 10
  return { tg, pct }
}

function KaspiRow({ row, checked, onCheck, catChecked, onCatCheck, commissionMult }: { row: Row; checked: boolean; onCheck: (() => void) | null; catChecked: boolean; onCatCheck: () => void; commissionMult: number }) {
  const router = useRouter()
  const { catalog, offer } = row
  const [busy, setBusy] = useState(false)

  const [kaspiUrl, setKaspiUrl] = useState(catalog.kaspiUrl || '')
  const [brand, setBrand] = useState(catalog.brand || '')

  const patchCatalog = async (body: any) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/kaspi-catalog/${catalog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  // SKU вида цифры_цифры → можно построить ссылку кнопкой «Get URL».
  const canGetUrl = /^\d+_\d+$/.test(catalog.kaspiSku)
  const getUrl = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/kaspi-catalog/${catalog.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'geturl' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      setKaspiUrl(d.kaspiUrl)
      router.refresh()
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  const patchOffer = async (body: any) => {
    if (!offer) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/kaspi-offers/${offer.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  const removeOffer = async () => {
    if (!offer) return
    if (!confirm(`Отвязать оффер ${catalog.kaspiSku} от товара сайта?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/kaspi-offers/${offer.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  const bindToProduct = async (productId: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-offers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kaspiSku: catalog.kaspiSku, productId }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  // Добавить/убрать продавца из игнор-листа этого оффера (не обгонять его).
  const toggleIgnore = async (offerId: string, merchant: string, currentlyIgnored: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/kaspi-offers/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [offerId], action: currentlyIgnored ? 'ignore-merchant-remove' : 'ignore-merchant-add', value: merchant }),
      })
      if (!res.ok) throw new Error(await res.text())
      router.refresh()
    } catch (e) { alert((e as Error).message) }
    finally { setBusy(false) }
  }

  const effStock = offer ? (offer.stockOverride != null ? offer.stockOverride : Math.max(0, offer.product?.totalStock ?? 0)) : 0
  const autoAvail = offer ? (effStock > 0 && (offer.product?.inStock ?? false)) : false
  const effAvail = offer ? (offer.availableOverride != null ? offer.availableOverride : autoAvail) : false
  // эффективный показ блока на сайте: showOnSite важнее,
  // иначе auto = active И доступен (как в фиде/getKaspiBuyData)
  const effShow = offer ? (offer.showOnSite != null ? offer.showOnSite : (offer.active && effAvail)) : false

  return (
    <tr className={offer && !offer.active ? 'opacity-60' : ''}>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-1.5 items-center">
          {/* чекбокс оффера (для демпинг/оффер-операций) — только если есть оффер */}
          {onCheck && (
            <input
              type="checkbox"
              checked={checked}
              onChange={onCheck}
              className="rounded border-gray-300 cursor-pointer"
              title="Выбрать оффер (демпинг, цена, активность)"
            />
          )}
          {/* чекбокс каталога (для удаления) — на ВСЕХ строках, в т.ч. без оффера */}
          <input
            type="checkbox"
            checked={catChecked}
            onChange={onCatCheck}
            className="rounded border-red-300 cursor-pointer accent-red-500"
            title="Отметить для удаления из каталога Kaspi"
          />
        </div>
      </td>

      <td className="px-3 py-2 align-top max-w-xs">
        <div className="font-mono text-[11px] text-gray-700">{catalog.kaspiSku}</div>
        <div className="text-gray-900 truncate text-[12px]" title={catalog.name}>{catalog.name}</div>
        <input
          type="text"
          value={brand}
          onChange={e => setBrand(e.target.value)}
          onBlur={() => { if (brand !== (catalog.brand || '')) patchCatalog({ brand }) }}
          disabled={busy}
          placeholder="бренд"
          className="mt-1 w-32 px-1.5 py-0.5 border border-gray-200 rounded text-[11px] outline-none focus:border-admin"
        />
      </td>

      <td className="px-3 py-2 align-top">
        <input
          type="text"
          value={kaspiUrl}
          onChange={e => setKaspiUrl(e.target.value)}
          onBlur={() => { if (kaspiUrl !== (catalog.kaspiUrl || '')) patchCatalog({ kaspiUrl }) }}
          disabled={busy}
          placeholder="ссылка kaspi.kz / l.kaspi.kz / PID"
          title="Можно вставить: полную ссылку kaspi.kz/shop/p/...-PID/, короткую l.kaspi.kz/shop/..., или сам product-id (6+ цифр). Короткая ссылка размотается автоматически."
          className={`w-56 px-1.5 py-1 border rounded text-[11px] outline-none focus:border-admin ${kaspiUrl ? 'border-green-300' : 'border-gray-200'}`}
        />
        {catalog.kaspiProductId && <div className="text-[10px] text-green-600 font-mono mt-0.5">PID: {catalog.kaspiProductId}</div>}
        {!catalog.kaspiProductId && <div className="text-[9px] text-gray-400 mt-0.5">вставь ссылку или PID ↑</div>}
        <div className="flex items-center gap-2 mt-0.5">
          {kaspiUrl && (
            <a href={kaspiUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-admin hover:underline">открыть ↗</a>
          )}
          {canGetUrl && !kaspiUrl && (
            <button onClick={getUrl} disabled={busy}
              className="text-[10px] px-1.5 py-0.5 rounded bg-admin text-white hover:bg-admin-hover disabled:opacity-50">
              Get URL
            </button>
          )}
        </div>
      </td>

      <td className="px-3 py-2 align-top">
        {offer?.product ? (
          <div className="space-y-1">
            <Link href={`/admin/products/${offer.product.id}`} className="text-admin hover:underline text-[12px]">
              #{offer.product.id} {offer.product.name}
            </Link>
            <div className="flex items-center gap-1">
              <a href={`/product/${offer.product.slug}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-gray-500 hover:text-admin">
                /product/{offer.product.slug} ↗
              </a>
              <button onClick={removeOffer} disabled={busy} className="text-[10px] text-red-500 hover:text-red-700 ml-auto">отвязать</button>
            </div>
          </div>
        ) : (
          <AlashLinker onBind={bindToProduct} disabled={busy} />
        )}
      </td>

      <td className="px-3 py-2 align-top text-right">
        {offer ? (
          <input
            type="number"
            defaultValue={offer.priceTenge}
            disabled={busy}
            onBlur={e => {
              const v = Math.round(Number(e.target.value))
              if (v && v !== offer.priceTenge) patchOffer({ priceTenge: v })
            }}
            className="w-20 px-1.5 py-1 text-right border border-gray-200 rounded text-[11px] focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none tabular-nums"
          />
        ) : (
          <span className="text-gray-500 tabular-nums">{catalog.priceTenge.toLocaleString('ru-RU')}</span>
        )}
        <div className="text-[10px] text-gray-400">тг</div>
        {/* Маржа текущей цены (цена − закуп×комиссия). Предупреждаем, если закуп
            не задан или подозрительно мал (вероятно мусорный ввод). */}
        {offer && (() => {
          const cost = offer.product?.costPrice
          if (!cost || cost <= 0) {
            return <div className="text-[10px] text-amber-500" title="Нет закупочной цены — маржа не считается, авто-floor недоступен. Заполни закуп в карточке товара.">⚠ нет закупа</div>
          }
          const m = calcMargin(offer.priceTenge, cost, commissionMult)
          if (!m) return <div className="text-[10px] text-gray-300">маржа —</div>
          // закуп < 2% цены — почти наверняка ошибка ввода (напр. 11₸ при 4200)
          const suspicious = cost < offer.priceTenge * 0.02
          return (
            <div className="leading-tight">
              <div className={`text-[10px] font-medium ${m.tg >= 0 ? 'text-green-600' : 'text-red-500'}`}
                title={`маржа = цена ${offer.priceTenge} − закуп ${cost}×${commissionMult}`}>
                {m.tg >= 0 ? '+' : ''}{m.tg.toLocaleString('ru-RU')}₸ ({m.pct}%)
              </div>
              {suspicious && (
                <div className="text-[9px] text-amber-500" title={`Закуп ${cost}₸ подозрительно мал для цены ${offer.priceTenge}₸ — проверь ввод`}>
                  ⚠ закуп {cost}₸?
                </div>
              )}
            </div>
          )
        })()}
      </td>

      <td className="px-3 py-2 align-top text-center">
        {offer ? (
          <select
            value={offer.availableOverride === null ? 'auto' : (offer.availableOverride ? 'yes' : 'no')}
            disabled={busy}
            onChange={e => {
              const v = e.target.value
              patchOffer({ availableOverride: v === 'auto' ? null : v === 'yes' })
            }}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium border outline-none focus:border-admin ${effAvail ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
          >
            <option value="auto">auto ({autoAvail ? 'yes' : 'no'})</option>
            <option value="yes">yes</option>
            <option value="no">no</option>
          </select>
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* preOrder: 0..30 дней по доке Kaspi */}
      <td className="px-3 py-2 align-top text-center">
        {offer ? (
          <input
            type="number"
            min={0}
            max={30}
            defaultValue={offer.preOrder}
            disabled={busy}
            onBlur={e => {
              const raw = e.target.value
              let v = raw === '' ? 0 : Math.round(Number(raw))
              if (!Number.isFinite(v)) v = 0
              if (v < 0) v = 0
              if (v > 30) v = 30
              if (v !== offer.preOrder) patchOffer({ preOrder: v })
            }}
            className="w-12 px-1.5 py-1 text-center border border-gray-200 rounded text-[11px] font-mono outline-none focus:border-admin tabular-nums"
            title="Дней предзаказа (0–30). По доке Kaspi: добавляется к дате самовывоза/доставки."
          />
        ) : <span className="text-gray-300">—</span>}
      </td>

      <td className="px-3 py-2 align-top text-right">
        {offer ? (
          <input
            type="number"
            defaultValue={offer.stockOverride != null ? offer.stockOverride : ''}
            placeholder={String(Math.max(0, offer.product?.totalStock ?? 0))}
            disabled={busy}
            onBlur={e => {
              const raw = e.target.value
              const newVal = raw === '' ? null : Math.max(0, Math.round(Number(raw)))
              if (newVal !== offer.stockOverride) patchOffer({ stockOverride: newVal })
            }}
            className="w-16 px-1.5 py-1 text-right border border-gray-200 rounded text-[11px] focus:border-admin focus:ring-1 focus:ring-admin/20 outline-none tabular-nums"
            title={`Product.totalStock=${offer.product?.totalStock ?? 0}. Пусто = auto.`}
          />
        ) : <span className="text-gray-300">—</span>}
      </td>

      <td className="px-3 py-2 align-top text-center">
        {offer ? (
          <button
            disabled={busy}
            onClick={() => patchOffer({ active: !offer.active })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${offer.active ? 'bg-green-500' : 'bg-gray-300'}`}
            title={offer.active ? 'в фиде' : 'не в фиде'}
          >
            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${offer.active ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* showOnSite: блок «Купить на Kaspi» на странице товара */}
      <td className="px-3 py-2 align-top text-center">
        {offer ? (
          <select
            value={offer.showOnSite === null ? 'auto' : (offer.showOnSite ? 'yes' : 'no')}
            disabled={busy}
            onChange={e => {
              const v = e.target.value
              patchOffer({ showOnSite: v === 'auto' ? null : v === 'yes' })
            }}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium border outline-none focus:border-admin ${effShow ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
            title="Показывать блок «Купить на Kaspi» на странице товара. auto = как act."
          >
            <option value="auto">auto ({offer.active && effAvail ? 'да' : 'нет'})</option>
            <option value="yes">да</option>
            <option value="no">нет</option>
          </select>
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* ====== ДЕМПИНГ ====== */}
      {/* Позиция + цена 1 места (снятые метрики) — чтобы видеть от чего ставить floor/max */}
      <td className="px-3 py-2 align-top text-center border-l border-gray-200">
        {offer ? (
          offer.lastDumpCheckAt ? (() => {
            const pos = offer.ourPosition
            const comp = offer.competitorCount ?? 0
            // rivalPrice = релевантный конкурент: мы 1-е → цена ВТОРОГО; мы 2+ → цена ПЕРВОГО.
            // Фолбэк на firstPlacePrice для старых записей, снятых до появления rivalPrice.
            const rival = offer.rivalPrice ?? (pos !== 1 ? offer.firstPlacePrice : null)
            const weFirst = pos === 1
            const step = offer.dumpingStep || 2
            // Статус-бейдж
            let badge, badgeCls
            if (comp === 0) { badge = '⚪ один'; badgeCls = 'text-gray-400' }
            else if (weFirst) { badge = '🥇 1 место'; badgeCls = 'text-green-600' }
            else if (pos) { badge = `🔴 ${pos} место`; badgeCls = 'text-red-500' }
            else { badge = '⚠ не в топе'; badgeCls = 'text-amber-500' }
            // Разрыв с конкурентом (наша цена vs rival): >0 = мы дороже (теряем), <0 = дешевле (недозарабатываем)
            const ourPrice = offer.priceTenge
            const gap = rival != null ? ourPrice - rival : null
            const gapPct = rival != null && rival > 0 ? Math.round((ourPrice - rival) / rival * 100) : null
            // ignore-лист: содержит ли уже этого продавца
            const ignored = !!(offer.rivalName && (offer.ignoreMerchants || []).includes(offer.rivalName))
            return (
              <div className="space-y-0.5"
                title={offer.lastDumpError ? `ошибка: ${offer.lastDumpError}` : `проверено ${new Date(offer.lastDumpCheckAt).toLocaleString('ru-RU')}`}>
                <div className={`text-[11px] font-semibold ${badgeCls}`}>{badge}</div>
                {rival != null && comp > 0 && (
                  <>
                    <div className="text-[12px] font-bold text-gray-800 tabular-nums"
                      title={weFirst ? 'цена ближайшего преследователя (2-е место)' : 'цена лидера (1-е место)'}>
                      {rival.toLocaleString('ru-RU')}₸
                    </div>
                    <div className="text-[9px] text-gray-400">{weFirst ? 'цена 2-го' : 'цена 1-го'}</div>
                    {/* имя конкурента + кнопка игнора («не воюй сам с собой») */}
                    {offer.rivalName && (
                      <div className="text-[9px] flex items-center gap-1 justify-center">
                        <span className="text-gray-500 truncate max-w-[90px]" title={`конкурент: ${offer.rivalName}`}>против: {offer.rivalName}</span>
                        <button
                          onClick={() => toggleIgnore(offer.id, offer.rivalName!, ignored)}
                          className={`px-1 rounded ${ignored ? 'bg-amber-100 text-amber-700' : 'text-gray-300 hover:text-amber-600'}`}
                          title={ignored ? 'В игноре — не обгоняем. Клик: убрать' : 'Не обгонять этого продавца (свой 2-й аккаунт/партнёр)'}
                        >🛡</button>
                      </div>
                    )}
                    {/* разрыв с конкурентом */}
                    {gap != null && gap !== 0 && (
                      <div className={`text-[9px] tabular-nums ${gap > 0 ? 'text-red-500' : 'text-green-600'}`}
                        title={gap > 0 ? 'мы ДОРОЖЕ конкурента (теряем продажи)' : 'мы дешевле конкурента (можно поднять цену)'}>
                        {gap > 0 ? '▲' : '▼'} {Math.abs(gap).toLocaleString('ru-RU')}₸{gapPct != null ? ` (${gapPct > 0 ? '+' : ''}${gapPct}%)` : ''}
                      </div>
                    )}
                    {/* что поставить, чтобы быть первым на step₸ дешевле релевантного конкурента */}
                    <div className={`text-[9px] ${weFirst ? 'text-gray-500' : 'text-blue-500'}`}
                      title={weFirst ? 'можно поднять цену до этой и остаться первым' : 'поставь эту цену, чтобы выйти в топ'}>
                      {weFirst ? 'до' : 'в топ'}: {(rival - step).toLocaleString('ru-RU')}₸
                    </div>
                  </>
                )}
                {comp > 0 && <div className="text-[9px] text-gray-400">конк: {comp}</div>}
                {/* свежесть проверки */}
                {(() => {
                  const ms = new Date(offer.lastDumpCheckAt!).getTime()
                  const ageMin = Math.floor((Date.now() - ms) / 60000)
                  const fresh = ageMin < 60
                  const stale = ageMin > 24 * 60
                  const label = ageMin < 1 ? 'только что' : ageMin < 60 ? `${ageMin}м` : ageMin < 1440 ? `${Math.floor(ageMin / 60)}ч` : `${Math.floor(ageMin / 1440)}д`
                  return <div className={`text-[9px] ${stale ? 'text-amber-500' : fresh ? 'text-green-500' : 'text-gray-300'}`} title="когда последний раз снимали позицию">✓ {label}</div>
                })()}
              </div>
            )
          })() : <span className="text-[10px] text-gray-300">не проверено</span>
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* Мин (floor) и Макс (ceiling) + маржа каждой. Сверху — закуп и порог
          безубытка (round(закуп×комиссия)), чтобы при простановке мин/макс
          сразу видеть себестоимость и не уйти в минус. */}
      <td className="px-3 py-2 align-top text-right">
        {offer ? (
          <div className="space-y-1">
            {(() => {
              const cost = offer.product?.costPrice
              if (!cost || cost <= 0) {
                return <div className="text-[9px] text-amber-500 leading-tight" title="Нет закупочной цены — заполни закуп в карточке товара">⚠ нет закупа</div>
              }
              const breakeven = Math.round(cost * commissionMult)
              return (
                <div className="text-[9px] text-gray-500 leading-tight whitespace-nowrap"
                  title={`Закуп ${cost.toLocaleString('ru')}₸ · безубыток = round(закуп × ${commissionMult}) = ${breakeven.toLocaleString('ru')}₸ (ниже этой цены — минус)`}>
                  закуп <b className="text-gray-700">{cost.toLocaleString('ru')}</b>₸
                  <span className="text-gray-400"> · 0% </span><b className="text-gray-700">{breakeven.toLocaleString('ru')}</b>₸
                </div>
              )
            })()}
            <DumpPriceInput
              value={offer.minPriceTenge}
              placeholder="мин"
              disabled={busy}
              cost={offer.product?.costPrice}
              mult={commissionMult}
              warn={offer.autoDownscale && offer.minPriceTenge == null}
              onSave={v => patchOffer({ minPriceTenge: v })}
            />
            <DumpPriceInput
              value={offer.maxPriceTenge}
              placeholder="макс"
              disabled={busy}
              cost={offer.product?.costPrice}
              mult={commissionMult}
              onSave={v => patchOffer({ maxPriceTenge: v })}
            />
          </div>
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* Шаг демпинга */}
      <td className="px-3 py-2 align-top text-center">
        {offer ? (
          <input
            type="number"
            min={1}
            defaultValue={offer.dumpingStep}
            disabled={busy}
            onBlur={e => {
              let v = Math.round(Number(e.target.value))
              if (!Number.isFinite(v) || v < 1) v = 1
              if (v !== offer.dumpingStep) patchOffer({ dumpingStep: v })
            }}
            className="w-12 px-1.5 py-1 text-center border border-gray-200 rounded text-[11px] outline-none focus:border-admin tabular-nums"
            title="на сколько тенге ниже конкурента"
          />
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* Тумблеры автоснижение / автоповышение */}
      <td className="px-3 py-2 align-top">
        {offer ? (
          <div className="flex flex-col gap-1 items-start">
            <label className="flex items-center gap-1 cursor-pointer" title="Автоснижение: опускать цену под конкурента (до floor)">
              <input type="checkbox" checked={offer.autoDownscale} disabled={busy}
                onChange={e => patchOffer({ autoDownscale: e.target.checked })}
                className="rounded border-gray-300 cursor-pointer accent-green-600" />
              <span className="text-[10px] text-gray-600">↓ сниж</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer" title="Автоповышение: поднимать к max когда конкурентов нет">
              <input type="checkbox" checked={offer.autoUpscale} disabled={busy}
                onChange={e => patchOffer({ autoUpscale: e.target.checked })}
                className="rounded border-gray-300 cursor-pointer accent-admin" />
              <span className="text-[10px] text-gray-600">↑ повыш</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer" title="Приоритетный демпинг: воркер проверяет этот товар ПЕРВЫМ в каждом прогоне (там конкуренты активно демпингуют)">
              <input type="checkbox" checked={offer.dumpPriority} disabled={busy}
                onChange={e => patchOffer({ dumpPriority: e.target.checked })}
                className="rounded border-gray-300 cursor-pointer accent-violet-600" />
              <span className={`text-[10px] font-medium ${offer.dumpPriority ? 'text-violet-700' : 'text-gray-600'}`}>⚡ приор</span>
            </label>
          </div>
        ) : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

// Поле цены floor/ceiling с показом маржи под ним. warn=true → красная рамка
// (включено снижение, но floor пуст — предохранитель: бот такой товар не тронет).
function DumpPriceInput({ value, placeholder, disabled, cost, mult, warn, onSave }: {
  value: number | null
  placeholder: string
  disabled: boolean
  cost: number | null | undefined
  mult: number
  warn?: boolean
  onSave: (v: number | null) => void
}) {
  const m = calcMargin(value, cost, mult)
  return (
    <div>
      <input
        type="number"
        defaultValue={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        onBlur={e => {
          const raw = e.target.value
          const v = raw === '' ? null : Math.max(1, Math.round(Number(raw)))
          if (v !== value) onSave(v)
        }}
        className={`w-16 px-1.5 py-1 text-right border rounded text-[11px] outline-none focus:border-admin tabular-nums ${warn ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
        title={warn ? 'Автоснижение включено, но мин. цена не задана — бот не тронет товар' : placeholder}
      />
      {m && (
        <div className={`text-[9px] ${m.tg >= 0 ? 'text-green-600' : 'text-red-500'}`}>{m.pct}%</div>
      )}
    </div>
  )
}

function AlashLinker({ onBind, disabled }: { onBind: (productId: string) => void; disabled: boolean }) {
  const [mode, setMode] = useState<'url' | 'search'>('url')
  const [val, setVal] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [err, setErr] = useState<string | null>(null)
  const debounceRef = useRef<any>(null)

  const lookupUrl = async (url: string) => {
    setErr(null)
    if (!url) return
    try {
      const res = await fetch(`/api/admin/site-products/search?url=${encodeURIComponent(url)}`)
      const data = await res.json()
      if (data.found) {
        onBind(data.product.id)
      } else {
        setErr(data.error || 'товар не найден')
      }
    } catch (e) { setErr((e as Error).message) }
  }

  const searchProducts = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/site-products/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults(data.products || [])
      } catch {}
    }, 250)
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-1 text-[10px]">
        <button onClick={() => setMode('url')} className={`px-1.5 py-0.5 rounded ${mode === 'url' ? 'bg-admin text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>URL</button>
        <button onClick={() => setMode('search')} className={`px-1.5 py-0.5 rounded ${mode === 'search' ? 'bg-admin text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>поиск</button>
      </div>
      {mode === 'url' ? (
        <input
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={() => val && lookupUrl(val)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookupUrl(val) } }}
          disabled={disabled}
          placeholder="https://croon.kz/product/..."
          className="w-56 px-1.5 py-1 border border-gray-200 rounded text-[11px] outline-none focus:border-admin"
        />
      ) : (
        <div className="relative">
          <input
            type="text"
            value={val}
            onChange={e => { setVal(e.target.value); searchProducts(e.target.value) }}
            disabled={disabled}
            placeholder="название / SKU / id"
            className="w-56 px-1.5 py-1 border border-gray-200 rounded text-[11px] outline-none focus:border-admin"
          />
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {results.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => { onBind(p.id); setVal(''); setResults([]) }}
                  className="block w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 border-b border-gray-50"
                >
                  <div className="text-gray-900 truncate">#{p.id} {p.name}</div>
                  <div className="text-gray-400">/{p.slug} · stock {p.totalStock}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {err && <div className="text-[10px] text-red-500">{err}</div>}
    </div>
  )
}

function CatalogUpload({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true); setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/kaspi-catalog/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'upload error')
      setMsg(`Загружено: ${data.upserted}, всего: ${data.totalInDb}`)
      setTimeout(() => setMsg(null), 6000)
      onDone()
    } catch (e) {
      setMsg('Ошибка: ' + (e as Error).message)
      setTimeout(() => setMsg(null), 8000)
    } finally { setBusy(false) }
  }

  return (
    <label className={`relative px-4 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium rounded-lg cursor-pointer transition-colors ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
      {busy ? 'Загружаю…' : '⬆ Загрузить XML'}
      <input
        type="file"
        accept=".xml,application/xml,text/xml"
        className="hidden"
        disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
      />
      {msg && <div className="absolute right-0 top-full mt-2 text-xs bg-white border border-gray-200 rounded px-3 py-2 shadow-md whitespace-nowrap z-20">{msg}</div>}
    </label>
  )
}

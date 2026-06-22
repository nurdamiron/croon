'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Row = {
  id: string; kind: string; status: string; score: number | null; stockQty: number | null
  ba3arSku: string | null; ba3arTitle: string | null; ba3arImage: string | null; ba3arPrice: number | null; ba3arDesc: string | null
  alashId: string | null; alashName: string | null; alashImage: string | null; alashPrice: number | null; alashDesc: string | null
}

const TABS = [
  { key: 'matched', label: 'Сматчилось' },
  { key: 'not_in_alash', label: 'Нет в Alash (добавить в Alash)' },
  // Вкладка «Только Alash» скрыта (не нужна сейчас). Данные в БД остаются,
  // вернуть — раскомментировать строку ниже.
  // { key: 'only_alash', label: 'Только Alash (добавить в ba3ar)' },
]

function scoreColor(s: number | null) {
  if (s == null) return 'text-gray-400'
  if (s >= 0.85) return 'text-green-600'
  if (s >= 0.7) return 'text-amber-600'
  return 'text-red-500'
}
function price(n: number | null) { return n != null ? n.toLocaleString('ru-RU') + ' ₸' : '—' }

export default function Ba3arMatchClient({ rows, tab, statusFilter, loaded }: {
  rows: Row[]; tab: string; statusFilter?: string; loaded: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [compareIdx, setCompareIdx] = useState<number | null>(null)
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 4000) }

  const go = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    p.set('tab', next.tab ?? tab)
    const st = next.status !== undefined ? next.status : statusFilter
    if (st) p.set('status', st)
    router.push(`/admin/ba3ar-match?${p.toString()}`)
  }

  const setStatus = async (id: string, status: string, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setBusy(true)
    try {
      const res = await fetch(`/api/admin/ba3ar-match/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(await res.text())
      if (!opts?.silent) router.refresh()
    } catch (e) { alert((e as Error).message) } finally { if (!opts?.silent) setBusy(false) }
  }

  const loadResult = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/ba3ar-match/load', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      flash(`Загружено ${d.loaded}`); router.refresh()
    } catch (e) { flash('Ошибка: ' + (e as Error).message) } finally { setBusy(false) }
  }

  const confirmHigh = async () => {
    if (!confirm('Подтвердить все уверенные матчи (≥85%)?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/ba3ar-match/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm-high', minScore: 0.85 }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      flash(`Подтверждено ${d.affected}`); router.refresh()
    } catch (e) { flash('Ошибка: ' + (e as Error).message) } finally { setBusy(false) }
  }

  const exportCsv = () => {
    const headers = tab === 'only_alash' ? ['alash_id', 'alash_name']
      : tab === 'only_ba3ar' ? ['ba3ar_sku', 'ba3ar_title', 'best_guess', 'score']
      : ['ba3ar_sku', 'ba3ar_title', 'alash_id', 'alash_name', 'score', 'status']
    const lines = [headers.join(',')]
    for (const r of rows) {
      const vals = tab === 'only_alash' ? [r.alashId, r.alashName]
        : tab === 'only_ba3ar' ? [r.ba3arSku, r.ba3arTitle, r.alashName, r.score]
        : [r.ba3arSku, r.ba3arTitle, r.alashId, r.alashName, r.score, r.status]
      lines.push(vals.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `ba3ar-${tab}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Tinder-режим: проходим pending-матчи по очереди ──
  const pendingRows = rows.filter(r => r.status === 'pending')
  const decideCompare = async (status: 'confirmed' | 'rejected') => {
    if (compareIdx == null) return
    const r = pendingRows[compareIdx]
    if (!r) return
    await setStatus(r.id, status, { silent: true })
    flash(status === 'confirmed' ? '✓ Связано' : '✗ Пропущено')
    if (compareIdx + 1 < pendingRows.length) setCompareIdx(compareIdx + 1)
    else { setCompareIdx(null); router.refresh() }
  }

  return (
    <div className="space-y-3">
      {toast && <div className="fixed bottom-5 right-5 z-[60] bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">{toast}</div>}

      {!loaded && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm text-amber-800">Данные матчинга ещё не загружены.</span>
          <button onClick={loadResult} disabled={busy} className="px-4 py-2 bg-admin text-white text-sm rounded-lg disabled:opacity-50">Загрузить результат</button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
          {TABS.map((t, i) => (
            <button key={t.key} onClick={() => go({ tab: t.key, status: undefined })}
              className={`px-3 py-2 ${i > 0 ? 'border-l border-gray-200' : ''} ${tab === t.key ? 'bg-admin text-white' : 'bg-white hover:bg-gray-50'}`}>{t.label}</button>
          ))}
        </div>
        {tab === 'matched' && (
          <div className="flex border border-gray-200 rounded-lg overflow-hidden text-xs">
            {['', 'pending', 'confirmed', 'rejected'].map(s => (
              <button key={s} onClick={() => go({ status: s || undefined })}
                className={`px-2.5 py-2 ${s ? 'border-l border-gray-200' : ''} ${(statusFilter || '') === s ? 'bg-gray-700 text-white' : 'bg-white hover:bg-gray-50'}`}>
                {s === '' ? 'все' : s === 'pending' ? 'ждут' : s === 'confirmed' ? 'да' : 'нет'}</button>
            ))}
          </div>
        )}
        <div className="ml-auto flex gap-2">
          {tab === 'matched' && pendingRows.length > 0 && (
            <button onClick={() => setCompareIdx(0)} className="px-3 py-2 bg-admin hover:bg-admin-hover text-white text-sm rounded-lg">
              🆚 Сравнивать ({pendingRows.length})
            </button>
          )}
          {tab === 'matched' && <button onClick={confirmHigh} disabled={busy} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg disabled:opacity-50">✓ Уверенные (≥85%)</button>}
          <button onClick={exportCsv} className="px-3 py-2 border border-gray-300 bg-white hover:bg-gray-50 text-sm rounded-lg">⬇ CSV</button>
        </div>
      </div>

      {/* Таблица */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200"><tr className="text-left">
              {tab === 'only_alash' ? <><th className="px-3 py-2.5">Фото</th><th className="px-3 py-2.5">Товар Alash</th><th className="px-3 py-2.5">Цена</th></>
              : tab === 'not_in_alash' ? <><th className="px-3 py-2.5">Фото</th><th className="px-3 py-2.5">Товар ba3ar</th><th className="px-3 py-2.5">Цена</th><th className="px-3 py-2.5">Наличие (шт)</th></>
              : <><th className="px-3 py-2.5">ba3ar</th><th className="px-3 py-2.5">Alash</th><th className="px-3 py-2.5 text-center">%</th><th className="px-3 py-2.5">Наличие (шт)</th><th className="px-3 py-2.5 text-center">Решение</th></>}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500">Пусто</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className={tab === 'matched' && r.status === 'rejected' ? 'opacity-40' : ''}>
                  {tab === 'only_alash' ? (
                    <><td className="px-3 py-2"><Thumb src={r.alashImage} /></td><td className="px-3 py-2 text-gray-900">{r.alashName}</td><td className="px-3 py-2 text-gray-500">{price(r.alashPrice)}</td></>
                  ) : tab === 'not_in_alash' ? (
                    <>
                      <td className="px-3 py-2"><Thumb src={r.ba3arImage} /></td>
                      <td className="px-3 py-2 text-gray-900">{r.ba3arTitle}<div className="font-mono text-gray-400">SKU {r.ba3arSku}</div></td>
                      <td className="px-3 py-2 text-gray-500">{price(r.ba3arPrice)}</td>
                      <td className="px-3 py-2"><QtyInput id={r.id} value={r.stockQty} /></td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><Thumb src={r.ba3arImage} /><div><div className="text-gray-900">{r.ba3arTitle}</div><div className="text-gray-400">{price(r.ba3arPrice)}</div></div></div></td>
                      <td className="px-3 py-2"><div className="flex items-center gap-2"><Thumb src={r.alashImage} /><div><div className="text-gray-900">{r.alashName}</div><div className="text-gray-400">{price(r.alashPrice)}</div></div></div></td>
                      <td className={`px-3 py-2 text-center font-medium ${scoreColor(r.score)}`}>{r.score != null ? Math.round(r.score * 100) + '%' : ''}</td>
                      <td className="px-3 py-2"><QtyInput id={r.id} value={r.stockQty} /></td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button onClick={() => setStatus(r.id, 'confirmed')} disabled={busy} className={`px-2 py-1 rounded text-xs mr-1 ${r.status === 'confirmed' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>Да</button>
                        <button onClick={() => setStatus(r.id, 'rejected')} disabled={busy} className={`px-2 py-1 rounded text-xs ${r.status === 'rejected' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>Нет</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tinder-попап сравнения */}
      {compareIdx != null && pendingRows[compareIdx] && (
        <CompareModal
          row={pendingRows[compareIdx]}
          index={compareIdx} total={pendingRows.length}
          onYes={() => decideCompare('confirmed')}
          onNo={() => decideCompare('rejected')}
          onClose={() => { setCompareIdx(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function Thumb({ src }: { src: string | null }) {
  if (!src) return <div className="w-28 h-28 bg-gray-100 rounded shrink-0" />
  return <img src={src} alt="" className="w-28 h-28 object-contain rounded shrink-0 border border-gray-100 bg-white" loading="lazy" />
}

// Поле ввода фактического наличия (сохраняется на blur).
function QtyInput({ id, value }: { id: string; value: number | null }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  const [saved, setSaved] = useState(false)
  const save = async () => {
    try {
      const res = await fetch(`/api/admin/ba3ar-match/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQty: v === '' ? null : v }),
      })
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1200) }
    } catch {}
  }
  const qty = v === '' ? null : Number(v)
  const color = qty == null ? 'border-gray-200' : qty > 0 ? 'border-green-400 bg-green-50' : 'border-red-300 bg-red-50'
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" min={0} value={v}
        onChange={e => setV(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        placeholder="кол-во"
        className={`w-20 px-2 py-1.5 border rounded text-sm text-center outline-none focus:border-admin ${color}`}
      />
      {saved && <span className="text-green-600 text-xs">✓</span>}
    </div>
  )
}

// Поиск товара Alash с фото + привязка (для вкладки «Только ba3ar»).
function AlashSearch({ matchId, onLinked }: { matchId: string; onLinked: () => void }) {
  const [val, setVal] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useState<{ t?: any }>({})[0]

  const search = (q: string) => {
    if (ref.t) clearTimeout(ref.t)
    if (!q.trim()) { setResults([]); return }
    ref.t = setTimeout(async () => {
      try {
        const isUrl = q.includes('/product/')
        const res = await fetch(`/api/admin/alash-products/search?${isUrl ? 'url=' : 'q='}${encodeURIComponent(q)}`)
        const d = await res.json()
        setResults(isUrl ? (d.found ? [d.product] : []) : (d.products || []))
        setOpen(true)
      } catch {}
    }, 250)
  }

  const link = async (alashId: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/ba3ar-match/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: matchId, alashId }),
      })
      if (!res.ok) throw new Error(await res.text())
      setOpen(false); setVal(''); setResults([]); onLinked()
    } catch (e) { alert((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <input
        type="text" value={val} disabled={busy}
        onChange={e => { setVal(e.target.value); search(e.target.value) }}
        onFocus={() => results.length && setOpen(true)}
        placeholder="найти товар Alash: название / артикул / URL"
        className="w-64 px-2 py-1.5 border border-gray-200 rounded text-xs outline-none focus:border-admin"
      />
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[28rem] overflow-y-auto">
          {results.map((p: any) => (
            <button key={p.id} onClick={() => link(p.id)} disabled={busy}
              className="flex items-center gap-3 w-full text-left px-2 py-2 hover:bg-gray-50 border-b border-gray-50">
              {p.image ? <img src={p.image} alt="" className="w-20 h-20 object-contain rounded shrink-0 bg-white" loading="lazy" />
                : <div className="w-20 h-20 bg-gray-100 rounded shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="text-xs text-gray-900 leading-snug">{p.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{price(p.price)} · stock {p.totalStock}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Card({ title, badge, badgeColor, image, priceVal, desc, sku }: {
  title: string | null; badge: string; badgeColor: string; image: string | null; priceVal: number | null; desc: string | null; sku?: string | null
}) {
  return (
    <div className="flex-1 border border-gray-200 rounded-xl p-4 bg-white min-w-0">
      <span className={`inline-block text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full text-white ${badgeColor} mb-3`}>{badge}</span>
      <div className="w-full aspect-square bg-gray-50 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
        {image ? <img src={image} alt="" className="w-full h-full object-contain" /> : <span className="text-gray-300 text-sm">нет фото</span>}
      </div>
      <div className="font-semibold text-gray-900 text-[15px] mb-1">{title}</div>
      {sku && <div className="font-mono text-xs text-gray-400 mb-1">SKU {sku}</div>}
      <div className="text-lg font-bold text-brand mb-2">{priceVal != null ? priceVal.toLocaleString('ru-RU') + ' ₸' : '—'}</div>
      <div className="text-sm text-gray-600 leading-snug">{desc || '—'}</div>
    </div>
  )
}

function CompareModal({ row, index, total, onYes, onNo, onClose }: {
  row: Row; index: number; total: number; onYes: () => void; onNo: () => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-50 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-500">Сравнение {index + 1} из {total} · уверенность <span className={scoreColor(row.score)}>{row.score != null ? Math.round(row.score * 100) + '%' : ''}</span></div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <Card title={row.ba3arTitle} badge="ba3ar" badgeColor="bg-purple-500" image={row.ba3arImage} priceVal={row.ba3arPrice} desc={row.ba3arDesc} sku={row.ba3arSku} />
          <div className="flex md:flex-col items-center justify-center text-gray-300 text-2xl font-bold">=?</div>
          <Card title={row.alashName} badge="Alash" badgeColor="bg-brand" image={row.alashImage} priceVal={row.alashPrice} desc={row.alashDesc} />
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onNo} className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-base">✗ Не совпадает</button>
          <button onClick={onYes} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-base">✓ Один товар</button>
        </div>
        <div className="text-center text-xs text-gray-400 mt-2">Нажми «Один товар» если это одинаковый товар (разный дизайн карточки — норм)</div>
      </div>
    </div>
  )
}

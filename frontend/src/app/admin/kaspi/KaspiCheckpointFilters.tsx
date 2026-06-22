'use client'

import { useRouter, useSearchParams } from 'next/navigation'

// Чекпойнты выкладки на Kaspi. Каждый — три состояния: да / нет / неважно.
// Дефолт (нет параметров в URL) = все «да» (готов к выкладке).
const CHECKS: { key: string; label: string }[] = [
  { key: 'act', label: 'Активен (act)' },
  { key: 'avl', label: 'В наличии (avl)' },
  { key: 'kurl', label: 'Ссылка Kaspi' },
  { key: 'aurl', label: 'Товар на Алаш' },
  { key: 'site', label: 'Показ на сайте' },
]

type Tri = 'yes' | 'no' | 'any'

export default function KaspiCheckpointFilters({ counts }: { counts: { ready: number; total: number } }) {
  const router = useRouter()
  const sp = useSearchParams()

  const anySet = CHECKS.some(c => sp.get(c.key))
  const cur = (key: string): Tri => {
    const v = sp.get(key)
    if (v === 'yes' || v === 'no') return v
    return anySet ? 'any' : 'yes' // дефолт «да» пока ничего не задано
  }

  const setVal = (key: string, val: Tri) => {
    const p = new URLSearchParams(sp.toString())
    // при первом изменении фиксируем все остальные в их текущем дефолте «yes»,
    // чтобы поведение было предсказуемым (иначе сброс к «неважно»).
    if (!anySet) {
      for (const c of CHECKS) p.set(c.key, c.key === key ? (val === 'any' ? 'any' : val) : 'yes')
    } else {
      if (val === 'any') p.delete(key)
      else p.set(key, val)
    }
    p.delete('page')
    router.push(`/admin/kaspi?${p.toString()}`)
  }

  const resetReady = () => {
    const p = new URLSearchParams(sp.toString())
    for (const c of CHECKS) p.delete(c.key)
    p.delete('page')
    router.push(`/admin/kaspi?${p.toString()}`)
  }
  const showAll = () => {
    const p = new URLSearchParams(sp.toString())
    for (const c of CHECKS) p.set(c.key, 'any')
    p.delete('page')
    router.push(`/admin/kaspi?${p.toString()}`)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-[14px] font-semibold text-gray-900">Фильтр выкладки на Kaspi</h2>
        <div className="flex items-center gap-2">
          <button onClick={resetReady} className="text-[12px] px-2.5 py-1 rounded bg-admin text-white hover:bg-admin-hover">Готовые к выкладке</button>
          <button onClick={showAll} className="text-[12px] px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">Показать все</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {CHECKS.map(c => {
          const v = cur(c.key)
          return (
            <div key={c.key} className="flex items-center gap-1.5 border border-gray-100 rounded-lg px-2.5 py-1.5">
              <span className="text-[12px] text-gray-700">{c.label}</span>
              <div className="flex rounded overflow-hidden border border-gray-200 text-[11px]">
                {(['yes', 'no', 'any'] as Tri[]).map(opt => (
                  <button key={opt} onClick={() => setVal(c.key, opt)}
                    className={`px-2 py-0.5 ${v === opt
                      ? (opt === 'yes' ? 'bg-green-500 text-white' : opt === 'no' ? 'bg-red-500 text-white' : 'bg-gray-400 text-white')
                      : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
                    {opt === 'yes' ? 'да' : opt === 'no' ? 'нет' : '—'}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[12px] text-gray-500 mt-3">
        Найдено: <strong>{counts.ready}</strong> из {counts.total} (по текущему фильтру). По умолчанию — готовые к выкладке (все чекпойнты «да»).
      </p>
    </div>
  )
}

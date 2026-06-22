'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

// Плашка статуса демпинга над таблицей:
//  - вкл/выкл (глобальный тумблер)
//  - сколько товаров под демпингом, сколько без floor (предохранитель)
//  - статус внешнего кабинетного воркера (когда последний раз опрашивал сервер)
//  - фильтр «только демпинг» и кнопка «Проверить сейчас» по выбранным
export default function KaspiDumpingStatus({
  enabled, dumpingOn, noFloor, withCompetitors, workerLastSeen, dumpOnly, compOnly,
  painCount = 0, noPositionCount = 0,
}: {
  enabled: boolean
  dumpingOn: number
  noFloor: number
  withCompetitors: number
  workerLastSeen: string | null
  dumpOnly: boolean
  compOnly: boolean
  painCount?: number
  noPositionCount?: number
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [now, setNow] = useState<number>(0)
  useEffect(() => { setNow(Date.now()) }, [])

  // Перейти на фильтр (светофор боли — клик ведёт прямо в проблемные товары).
  const goFilter = (key: string, value: string) => {
    const p = new URLSearchParams(sp.toString())
    p.set(key, value)
    p.delete('page')
    router.push(`/admin/kaspi?${p.toString()}`)
  }

  // Свежесть воркера: считаем «жив», если опрашивал < 10 мин назад.
  const seenMs = workerLastSeen ? new Date(workerLastSeen).getTime() : 0
  const ageMin = seenMs && now ? Math.floor((now - seenMs) / 60000) : null
  const workerAlive = ageMin != null && ageMin < 10

  const toggleFilter = (key: 'dump' | 'comp', active: boolean) => {
    const p = new URLSearchParams(sp.toString())
    if (active) p.delete(key)
    else p.set(key, 'on')
    p.delete('page')
    router.push(`/admin/kaspi?${p.toString()}`)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
            Демпинг {enabled ? 'включён' : 'выключен'}
          </span>

          <span className="text-sm text-gray-700">
            Под демпингом: <b>{dumpingOn}</b> тов.
          </span>

          <span className="text-sm text-gray-700" title="товары, где есть конкуренты — для них имеет смысл ставить floor/max">
            С конкурентами: <b>{withCompetitors}</b>
          </span>

          {/* Светофор боли — кликабельные счётчики проблемных групп */}
          {painCount > 0 && (
            <button onClick={() => goFilter('pain', 'on')}
              className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-700 px-2 py-1 text-xs font-semibold hover:bg-red-200 transition"
              title="Демпинг включён, мы не первые, есть конкуренты, но floor не задан — демпинг заблокирован. Клик → починить.">
              🩸 Боль: {painCount}
            </button>
          )}
          {noFloor > 0 && (
            <button onClick={() => goFilter('nofloor', 'on')}
              className="inline-flex items-center gap-1 rounded-md bg-amber-50 text-amber-700 px-2 py-1 text-xs font-medium hover:bg-amber-100 transition"
              title="Автоснижение включено, но мин. цена не задана — бот эти товары НЕ трогает (предохранитель). Клик → показать.">
              ⛔ Без мин. цены: {noFloor}
            </button>
          )}
          {noPositionCount > 0 && (
            <button onClick={() => goFilter('stale', 'on')}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 text-gray-500 px-2 py-1 text-xs font-medium hover:bg-gray-200 transition"
              title="Позиция ещё не снималась — нет данных для решений. Клик → показать (запусти scan-воркер).">
              ⚪ Без позиции: {noPositionCount}
            </button>
          )}

          {/* Статус внешнего кабинетного воркера */}
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${workerAlive ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}
            title="Внешний воркер на резидентном IP снимает цены и меняет их в кабинете Kaspi">
            <span className={`w-1.5 h-1.5 rounded-full ${workerAlive ? 'bg-green-500' : 'bg-amber-500'}`} />
            {ageMin == null ? 'Воркер не запускался'
              : workerAlive ? `Воркер активен (${ageMin === 0 ? 'только что' : ageMin + ' мин назад'})`
              : `Воркер молчит ${ageMin} мин`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleFilter('comp', compOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${compOnly ? 'bg-admin text-white border-admin' : 'bg-white text-gray-700 border-gray-200 hover:border-admin'}`}
            title="Показать только товары с конкурентами — где есть смысл задавать floor/max"
          >
            {compOnly ? '✓ С конкурентами' : 'Только с конкурентами'}
          </button>
          <button
            onClick={() => toggleFilter('dump', dumpOnly)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition ${dumpOnly ? 'bg-admin text-white border-admin' : 'bg-white text-gray-700 border-gray-200 hover:border-admin'}`}
          >
            {dumpOnly ? '✓ Только демпинг' : 'Только демпинг'}
          </button>
        </div>
      </div>

      {/* Подсказка по запуску воркера */}
      {enabled && ageMin == null && (
        <p className="text-xs text-gray-500 mt-3 leading-snug">
          Демпинг включён, но воркер ещё не запускался. Запусти на машине с резидентным KZ-IP:
          <code className="bg-gray-100 px-1.5 py-0.5 rounded mx-1">node scripts/kaspi-cabinet-worker.mjs --login</code>
          → затем <code className="bg-gray-100 px-1.5 py-0.5 rounded">node scripts/kaspi-cabinet-worker.mjs</code>
        </p>
      )}
    </div>
  )
}

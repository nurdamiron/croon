'use client'

import { useRouter, useSearchParams } from 'next/navigation'

// Панель демпинг-фильтров: позиция (1/2/3/4/один), с конкурентами, снижение/
// повышение вкл/выкл, без мин.цены. Каждый чип переключает параметр в URL.
// После сужения таблицы можно «Выбрать все» в тулбаре и применить массовое действие.
export default function KaspiDumpFilters({
  counts,
}: {
  counts: {
    pos1: number; pos2: number; pos3: number; pos4: number; alone: number
    comp: number; downOn: number; upOn: number; noFloor: number; pain: number
    noCost: number; notVisible: number; atFloor: number; prio: number
  }
}) {
  const router = useRouter()
  const sp = useSearchParams()

  // Установить/снять параметр. Для группы «позиция» (pos) — radio-поведение:
  // повторный клик по активному снимает, клик по другому — заменяет.
  const setParam = (key: string, value: string | null) => {
    const p = new URLSearchParams(sp.toString())
    const cur = p.get(key)
    if (value === null || cur === value) p.delete(key)
    else p.set(key, value)
    p.delete('page')
    router.push(`/admin/kaspi?${p.toString()}`)
  }

  const posVal = sp.get('pos') || ''
  const comp = sp.get('comp') === 'on'
  const down = sp.get('down') || ''   // '', 'yes', 'no'
  const up = sp.get('up') || ''
  const noFloor = sp.get('nofloor') === 'on'
  const pain = sp.get('pain') === 'on'
  const loss = sp.get('loss') === 'on'
  const expensive = sp.get('expensive') === 'on'
  const underdump = sp.get('underdump') === 'on'
  const stale = sp.get('stale') === 'on'
  const aloneNoCeil = sp.get('alonenoceil') === 'on'
  const noCost = sp.get('nocost') === 'on'
  const notVisible = sp.get('notvisible') === 'on'
  const outStock = sp.get('outstock') === 'on'
  const atFloor = sp.get('atfloor') === 'on'
  const prio = sp.get('prio') === 'on'

  // Чип: активен → залит admin-цветом.
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs font-medium border transition whitespace-nowrap ${
      active ? 'bg-admin text-white border-admin' : 'bg-white text-gray-700 border-gray-200 hover:border-admin'
    }`

  const num = (n: number) => (n > 0 ? <span className="opacity-70 ml-1">{n}</span> : null)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">Позиция:</span>
        <button className={chip(posVal === '1')} onClick={() => setParam('pos', '1')}>🥇 1 место{num(counts.pos1)}</button>
        <button className={chip(posVal === '2')} onClick={() => setParam('pos', '2')}>2 место{num(counts.pos2)}</button>
        <button className={chip(posVal === '3')} onClick={() => setParam('pos', '3')}>3 место{num(counts.pos3)}</button>
        <button className={chip(posVal === '4')} onClick={() => setParam('pos', '4')}>4 место{num(counts.pos4)}</button>
        <button className={chip(posVal === 'alone')} onClick={() => setParam('pos', 'alone')}>⚪ один{num(counts.alone)}</button>
        <button
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition whitespace-nowrap ${
            notVisible ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-600 border-red-200 hover:border-red-400'
          }`}
          onClick={() => setParam('notvisible', notVisible ? null : 'on')}
          title="Конкуренты есть, но нас НЕТ в выдаче Kaspi — мы дороже всех или глубже топ-64. Зона роста: снизить цену."
        >🙈 нас не видно{num(counts.notVisible)}</button>
        <button
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition whitespace-nowrap ${
            outStock ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
          }`}
          onClick={() => setParam('outstock', outStock ? null : 'on')}
          title="Активный оффер, но товар не в наличии (склад 0) — на витрине Kaspi не показывается. Пополнить склад."
        >📦 нет в наличии</button>

        <div className="h-5 w-px bg-gray-200 mx-1" />
        <button className={chip(comp)} onClick={() => setParam('comp', comp ? null : 'on')}>с конкурентами{num(counts.comp)}</button>

        <div className="h-5 w-px bg-gray-200 mx-1" />
        <span className="text-xs text-gray-400 mr-1">Снижение:</span>
        <button className={chip(down === 'yes')} onClick={() => setParam('down', down === 'yes' ? null : 'yes')}>вкл{num(counts.downOn)}</button>
        <button className={chip(down === 'no')} onClick={() => setParam('down', down === 'no' ? null : 'no')}>выкл</button>

        <div className="h-5 w-px bg-gray-200 mx-1" />
        <span className="text-xs text-gray-400 mr-1">Повышение:</span>
        <button className={chip(up === 'yes')} onClick={() => setParam('up', up === 'yes' ? null : 'yes')}>вкл{num(counts.upOn)}</button>
        <button className={chip(up === 'no')} onClick={() => setParam('up', up === 'no' ? null : 'no')}>выкл</button>

        <div className="h-5 w-px bg-gray-200 mx-1" />
        <button
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition whitespace-nowrap ${
            noFloor ? 'bg-red-500 text-white border-red-500' : 'bg-white text-red-600 border-red-200 hover:border-red-400'
          }`}
          onClick={() => setParam('nofloor', noFloor ? null : 'on')}
          title="Снижение включено, но мин.цена не задана — демпинг эти товары не трогает"
        >⛔ без мин.цены{num(counts.noFloor)}</button>

        {(posVal || comp || down || up || noFloor || pain || loss || expensive || underdump || stale || aloneNoCeil || noCost || notVisible || outStock || atFloor || prio) && (
          <button
            className="px-2.5 py-1 rounded-md text-xs text-gray-500 hover:text-gray-800 ml-1"
            onClick={() => {
              const p = new URLSearchParams(sp.toString())
              ;['pos', 'comp', 'down', 'up', 'nofloor', 'pain', 'loss', 'expensive', 'underdump', 'stale', 'alonenoceil', 'nocost', 'notvisible', 'outstock', 'atfloor', 'prio', 'page'].forEach(k => p.delete(k))
              router.push(`/admin/kaspi?${p.toString()}`)
            }}
          >✕ сбросить</button>
        )}
      </div>

      {/* Второй ряд — фильтры боли/аналитики (вычисляемые) */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t border-gray-100">
        <button
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition whitespace-nowrap ${
            pain ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-300 hover:border-red-500'
          }`}
          onClick={() => setParam('pain', pain ? null : 'on')}
          title="Демпинг включён, мы не первые, есть конкуренты, но floor не задан — демпинг заблокирован. Это «работа на сегодня»."
        >🩸 боль{num(counts.pain)}</button>
        <button className={chip(loss)} onClick={() => setParam('loss', loss ? null : 'on')}
          title="Цель демпинга ниже закуп×комиссия — догонять конкурента нельзя, уйдём в минус">📉 убыточные</button>
        <button className={chip(expensive)} onClick={() => setParam('expensive', expensive ? null : 'on')}
          title="Мы дороже конкурента в 1.5 раза+ — теряем продажи">💸 дороже рынка</button>
        <button className={chip(underdump)} onClick={() => setParam('underdump', underdump ? null : 'on')}
          title="Мы дешевле конкурента в 1.5 раза+ — отдаём маржу даром, можно поднять">🤑 недодемпинг</button>
        <button className={chip(stale)} onClick={() => setParam('stale', stale ? null : 'on')}
          title="Позиция не снималась больше суток (или вообще) — данные старые">🕐 давно не проверяли</button>
        <button className={chip(aloneNoCeil)} onClick={() => setParam('alonenoceil', aloneNoCeil ? null : 'on')}
          title="Конкурентов нет, но потолок не задан — автоповышение молчит, упускаем прибыль">🎯 один без потолка</button>
        <button
          className={`px-2.5 py-1 rounded-md text-xs font-medium border transition whitespace-nowrap ${
            noCost ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-700 border-amber-300 hover:border-amber-500'
          }`}
          onClick={() => setParam('nocost', noCost ? null : 'on')}
          title="У товара не задана закупочная цена — нельзя посчитать безубыток (floor) и маржу. Проставь закуп, чтобы демпинг не ушёл в минус."
        >🏷 нет закупа{num(counts.noCost)}</button>
        <button
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition whitespace-nowrap ${
            atFloor ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-orange-700 border-orange-300 hover:border-orange-500'
          }`}
          onClick={() => setParam('atfloor', atFloor ? null : 'on')}
          title="Упёрлись в пол: наша цена = мин.цена (floor), есть конкуренты — ниже опускаться нельзя. Конкурент может стоять ниже нашего floor; чтобы отбить, снизь минимум (если позволяет маржа)."
        >🧱 упёрлись в пол{num(counts.atFloor)}</button>
        <button
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition whitespace-nowrap ${
            prio ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-300 hover:border-violet-500'
          }`}
          onClick={() => setParam('prio', prio ? null : 'on')}
          title="Приоритетный демпинг: воркер проверяет эти товары ПЕРВЫМИ в каждом прогоне (там конкуренты активно демпингуют)."
        >⚡ приоритет{num(counts.prio)}</button>
      </div>
    </div>
  )
}

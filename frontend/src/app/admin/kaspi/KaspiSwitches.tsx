'use client'

import { useEffect, useState } from 'react'

// Аварийные тумблеры Kaspi (меняются на лету, без рестарта):
//  1) Фид Kaspi — выключить = все товары исчезают с Kaspi (фид пустой).
//     Включить = вернутся ровно те, что active + есть на складе.
//  2) Блоки «Купить на Kaspi» на сайте — выключить = убрать со всех карточек.
// Ни один не трогает per-offer данные → включение полностью восстанавливает.

type Econ = {
  commissionPct: number
  payPct: number
  taxPct: number
  deliveryTenge: number
  deliveryThreshold: number
}

export default function KaspiSwitches() {
  const [feed, setFeed] = useState<boolean | null>(null)
  const [site, setSite] = useState<boolean | null>(null)
  const [dumping, setDumping] = useState<boolean | null>(null)
  const [mult, setMult] = useState<number | null>(null)
  const [econ, setEcon] = useState<Econ | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // свёрнут/развёрнут — запоминаем в localStorage (по умолчанию свёрнут, блок большой)
  const [collapsed, setCollapsed] = useState(true)
  useEffect(() => {
    const v = localStorage.getItem('kaspiSwitchesCollapsed')
    if (v != null) setCollapsed(v === '1')
  }, [])
  const toggleCollapsed = () => setCollapsed(c => {
    const n = !c; localStorage.setItem('kaspiSwitchesCollapsed', n ? '1' : '0'); return n
  })

  useEffect(() => {
    fetch('/api/admin/kaspi/switches').then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setFeed(d.feedEnabled); setSite(d.siteBlocksEnabled); setDumping(d.dumpingEnabled); setMult(d.commissionMult); setEcon(d.econ) }
    }).catch(() => {})
  }, [])

  async function saveEcon(field: keyof Econ, next: number, label: string) {
    setBusy(`econ_${field}`); setMsg(null)
    try {
      const res = await fetch('/api/admin/kaspi/switches', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      setEcon(d.econ)
      setMsg(`${label}: сохранено`)
    } catch (e) { setMsg('Ошибка: ' + (e as Error).message) }
    finally { setBusy(null) }
  }

  async function toggle(key: 'feedEnabled' | 'siteBlocksEnabled' | 'dumpingEnabled', next: boolean, label: string) {
    const action = next ? 'ВКЛЮЧИТЬ' : 'ВЫКЛЮЧИТЬ'
    if (!confirm(`${action}: ${label}?`)) return
    setBusy(key); setMsg(null)
    try {
      const res = await fetch('/api/admin/kaspi/switches', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      setFeed(d.feedEnabled); setSite(d.siteBlocksEnabled); setDumping(d.dumpingEnabled); setMult(d.commissionMult)
      setMsg(`${label}: ${next ? 'включено' : 'выключено'}`)
    } catch (e) { setMsg('Ошибка: ' + (e as Error).message) }
    finally { setBusy(null) }
  }

  async function saveMult(next: number) {
    setBusy('commissionMult'); setMsg(null)
    try {
      const res = await fetch('/api/admin/kaspi/switches', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commissionMult: next }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'error')
      setMult(d.commissionMult)
      setMsg(`Множитель комиссии: ×${d.commissionMult}`)
    } catch (e) { setMsg('Ошибка: ' + (e as Error).message) }
    finally { setBusy(null) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex items-center gap-2 w-full text-left group"
        title={collapsed ? 'Развернуть настройки' : 'Свернуть'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={`text-gray-400 group-hover:text-gray-700 transition-transform ${collapsed ? '' : 'rotate-90'}`}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Аварийно</span>
        <h2 className="text-[15px] font-semibold text-gray-900">Тумблеры Kaspi</h2>
        {collapsed && <span className="text-xs text-gray-400 ml-1">фид · демпинг · комиссия · экономика — нажми чтобы открыть</span>}
      </button>
      {!collapsed && <>
      {msg && <div className="text-sm px-3 py-2 rounded-lg bg-gray-100 text-gray-700 mb-3 mt-4">{msg}</div>}

      <div className="space-y-3 mt-4">
        <SwitchRow
          title="Товары на Kaspi (фид)"
          desc="Выключить → все товары исчезают с Kaspi (фид пустой). Включить → вернутся те, что активны и есть на складе."
          value={feed}
          busy={busy === 'feedEnabled'}
          onToggle={(v) => toggle('feedEnabled', v, 'Товары на Kaspi (фид)')}
        />
        <SwitchRow
          title="Блоки «Купить на Kaspi» на сайте"
          desc="Выключить → убрать ссылки/кнопки Kaspi со всех карточек Alash. Включить → вернуть как было."
          value={site}
          busy={busy === 'siteBlocksEnabled'}
          onToggle={(v) => toggle('siteBlocksEnabled', v, 'Блоки Kaspi на сайте')}
        />
        <SwitchRow
          title="Демпинг (автоуправление ценой)"
          desc="Включить → крон сам меняет цену по правилам (автоснижение/повышение, floor). Выключить → цена замораживается, бот ничего не трогает. Применяется в течение часа (фид Kaspi обновляется раз в ~60 мин)."
          value={dumping}
          busy={busy === 'dumpingEnabled'}
          onToggle={(v) => toggle('dumpingEnabled', v, 'Демпинг Kaspi')}
        />
      </div>

      {/* Множитель комиссии Kaspi для расчёта маржи/floor */}
      <div className="mt-3 flex items-center gap-3 border border-gray-100 rounded-lg p-3">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-gray-900 text-sm">Комиссия Kaspi (множитель)</span>
          <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">
            Маржа = цена − закуп × множитель. Floor от закупа = закуп × множитель. По умолчанию ×1.41 (~41% комиссия).
          </p>
        </div>
        <input
          type="number"
          step="0.01"
          min="1"
          defaultValue={mult ?? 1.41}
          key={mult ?? 'loading'}
          disabled={mult === null || busy === 'commissionMult'}
          onBlur={e => {
            const n = Number(e.target.value)
            if (Number.isFinite(n) && n > 0 && n !== mult) saveMult(n)
          }}
          className="w-20 px-2 py-1.5 text-right border border-gray-200 rounded-lg text-sm focus:border-admin outline-none tabular-nums disabled:opacity-50"
          title="множитель комиссии (1.41 = +41%)"
        />
      </div>

      {/* Экономика Kaspi — ставки для аналитики прибыли (/admin/kaspi-analytics) */}
      <div className="mt-5 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-[14px] font-semibold text-gray-900">Экономика Kaspi (для аналитики прибыли)</h3>
        </div>
        <p className="text-[12px] text-gray-500 mb-3 leading-snug">
          Прибыль = выручка − себестоимость − комиссия Kaspi − Kaspi Pay − доставка − налог. Ставки берутся
          из официального{' '}
          <a href="https://guide.kaspi.kz/partner/ru/shop/conditions/commissions" target="_blank" rel="noreferrer" className="text-admin hover:underline">
            гайда Kaspi
          </a>{' '}
          (электроника: комиссия 10.9%, Kaspi Pay 0.95%, налог 3%).
        </p>
        <div className="space-y-2">
          <EconInput
            label="Комиссия Магазина Kaspi" unit="%" step="0.1"
            desc="% от цены продажи. Зависит от категории (6.4–13.5%). Электроника — 10.9%."
            value={econ?.commissionPct} busy={busy === 'econ_commissionPct'} disabled={econ === null}
            onSave={(n) => saveEcon('commissionPct', n, 'Комиссия Kaspi')}
          />
          <EconInput
            label="Комиссия Kaspi Pay" unit="%" step="0.01"
            desc="Эквайринг при приёме платежа. По умолчанию 0.95%."
            value={econ?.payPct} busy={busy === 'econ_payPct'} disabled={econ === null}
            onSave={(n) => saveEcon('payPct', n, 'Kaspi Pay')}
          />
          <EconInput
            label="Налог" unit="%" step="0.1"
            desc="% от выручки. Упрощёнка — 3%."
            value={econ?.taxPct} busy={busy === 'econ_taxPct'} disabled={econ === null}
            onSave={(n) => saveEcon('taxPct', n, 'Налог')}
          />
          <EconInput
            label="Доставка" unit="₸" step="1"
            desc="Фикс ₸ за заказ, если сумма ≥ порога (продавец платит доставку). 0 = не учитывать."
            value={econ?.deliveryTenge} busy={busy === 'econ_deliveryTenge'} disabled={econ === null}
            onSave={(n) => saveEcon('deliveryTenge', n, 'Доставка')}
          />
          <EconInput
            label="Порог бесплатной доставки" unit="₸" step="100"
            desc="Заказы дешевле порога Kaspi доставляет за свой счёт. По умолчанию 5000₸."
            value={econ?.deliveryThreshold} busy={busy === 'econ_deliveryThreshold'} disabled={econ === null}
            onSave={(n) => saveEcon('deliveryThreshold', n, 'Порог доставки')}
          />
        </div>
      </div>
      </>}
    </div>
  )
}

function EconInput({ label, desc, unit, step, value, busy, disabled, onSave }: {
  label: string; desc: string; unit: string; step: string
  value: number | undefined; busy: boolean; disabled: boolean; onSave: (n: number) => void
}) {
  return (
    <div className="flex items-center gap-3 border border-gray-100 rounded-lg p-3">
      <div className="min-w-0 flex-1">
        <span className="font-medium text-gray-900 text-sm">{label}</span>
        <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          step={step}
          min="0"
          defaultValue={value ?? ''}
          key={value ?? 'loading'}
          disabled={disabled || busy}
          onBlur={e => {
            const n = Number(e.target.value)
            if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n)
          }}
          className="w-24 px-2 py-1.5 text-right border border-gray-200 rounded-lg text-sm focus:border-admin outline-none tabular-nums disabled:opacity-50"
        />
        <span className="text-xs text-gray-400 w-3">{unit}</span>
      </div>
    </div>
  )
}

function SwitchRow({ title, desc, value, busy, onToggle }: {
  title: string; desc: string; value: boolean | null; busy: boolean; onToggle: (v: boolean) => void
}) {
  const on = value === true
  const loading = value === null
  return (
    <div className="flex items-start justify-between gap-4 border border-gray-100 rounded-lg p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{title}</span>
          {!loading && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${on ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {on ? 'ВКЛ' : 'ВЫКЛ'}
            </span>
          )}
        </div>
        <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{desc}</p>
      </div>
      <button
        type="button"
        disabled={loading || busy}
        onClick={() => onToggle(!on)}
        className={`shrink-0 relative w-12 h-7 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-green-500' : 'bg-gray-300'}`}
        aria-pressed={on}
        title={on ? 'Выключить' : 'Включить'}
      >
        <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

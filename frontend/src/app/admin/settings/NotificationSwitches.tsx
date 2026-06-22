'use client'

import { useEffect, useState } from 'react'

type Channels = { croon: boolean; kaspi: boolean }

const CHANNELS: { key: keyof Channels; label: string; desc: string; color: string }[] = [
  { key: 'croon', label: 'Сайт', desc: 'Заказы и предзаказы с croon.kz', color: 'bg-blue-500' },
  { key: 'kaspi', label: 'Kaspi.kz', desc: 'Заказы с Kaspi Маркета (проверяются каждые 15 мин)', color: 'bg-red-500' },
]

export default function NotificationSwitches() {
  const [vals, setVals] = useState<Channels>({ croon: true, kaspi: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<keyof Channels | null>(null)

  useEffect(() => {
    fetch('/api/admin/notification-switches')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setVals(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const toggle = async (key: keyof Channels) => {
    const next = !vals[key]
    setVals(v => ({ ...v, [key]: next }))
    setSaving(key)
    try {
      const res = await fetch('/api/admin/notification-switches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: next }),
      })
      if (res.ok) {
        const d = await res.json()
        setVals(d)
      } else {
        setVals(v => ({ ...v, [key]: !next })) // откат при ошибке
      }
    } catch {
      setVals(v => ({ ...v, [key]: !next }))
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-gray-500 leading-relaxed">
        Выключите канал — push-уведомления о новых заказах с него приходить не будут. Сами заказы продолжают приниматься и попадают в админку как обычно (просто без звукового напоминания).
      </p>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {CHANNELS.map(c => {
            const on = vals[c.key]
            const isSaving = saving === c.key
            return (
              <div
                key={c.key}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-all ${
                  on ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${on ? c.color : 'bg-gray-300'}`} />
                  <div className="min-w-0">
                    <div className={`text-[13px] font-semibold ${on ? 'text-gray-900' : 'text-gray-500'}`}>{c.label}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">{c.desc}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSaving && toggle(c.key)}
                  disabled={isSaving}
                  role="switch"
                  aria-checked={on}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    on ? 'bg-admin' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      on ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                  {isSaving && (
                    <span className="absolute -right-7 w-3 h-3 border-2 border-admin/40 border-t-admin rounded-full animate-spin" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

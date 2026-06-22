'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface ChartRow {
  label: string
  revenue: number
  count: number
}

type Period = 'week' | 'month' | 'year'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'week',  label: '7 дней' },
  { key: 'month', label: 'Месяц' },
  { key: 'year',  label: 'Год' },
]

function formatRevenue(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toLocaleString('ru-RU')
}

export default function RevenueChart() {
  const [period, setPeriod] = useState<Period>('week')
  const [data, setData] = useState<{ rows: ChartRow[]; totalRevenue: number; totalOrders: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/revenue?period=${p}`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const rows = data?.rows || []
  const maxRevenue = Math.max(...rows.map(r => r.revenue), 1)

  // Y-axis labels
  const ySteps = 4
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) =>
    Math.round((maxRevenue / ySteps) * (ySteps - i))
  )

  // Show every Nth label on month view to avoid crowding
  const showEvery = period === 'month' ? 5 : period === 'year' ? 1 : 1

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="flex-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-[15px] font-semibold text-gray-900">Выручка</h2>
            {data && !loading && (
              <span className="text-[22px] font-bold text-gray-900 leading-none">
                {data.totalRevenue.toLocaleString('ru-RU')}
                <span className="text-[14px] font-normal text-gray-400 ml-1">тг</span>
              </span>
            )}
            {data && !loading && data.totalOrders > 0 && (
              <span className="text-[12px] text-gray-400">
                {data.totalOrders} заказ{data.totalOrders === 1 ? '' : data.totalOrders < 5 ? 'а' : 'ов'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">Без отменённых</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 shrink-0">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all ${
                period === p.key
                  ? 'bg-white text-admin shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        {loading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-admin rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex gap-4">
            {/* Y-axis */}
            <div className="flex flex-col justify-between text-right pb-6 shrink-0" style={{ height: 180 }}>
              {yLabels.map((v, i) => (
                <span key={i} className="text-[10px] text-gray-300 font-mono leading-none">
                  {v > 0 ? formatRevenue(v) : '0'}
                </span>
              ))}
            </div>

            {/* Bars + grid */}
            <div className="flex-1 min-w-0 relative">
              {/* Horizontal grid lines */}
              <div className="absolute inset-x-0 top-0 flex flex-col justify-between pointer-events-none" style={{ height: 180 }}>
                {yLabels.map((_, i) => (
                  <div key={i} className="border-t border-dashed border-gray-100 w-full" />
                ))}
              </div>

              {/* Bars */}
              <div className="flex items-end gap-px" style={{ height: 180 }}>
                {rows.map((row, i) => {
                  const heightPct = maxRevenue > 0 ? (row.revenue / maxRevenue) * 100 : 0
                  const isHovered = hoveredIdx === i
                  const hasData = row.revenue > 0

                  return (
                    <div
                      key={i}
                      className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                      onMouseEnter={() => setHoveredIdx(i)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                          <div className="bg-gray-900 text-white text-[11px] rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg">
                            <div className="font-bold">{row.revenue.toLocaleString('ru-RU')} тг</div>
                            {row.count > 0 && (
                              <div className="text-gray-400 mt-0.5">{row.count} заказ{row.count > 1 ? 'ов' : ''}</div>
                            )}
                            <div className="text-gray-500 mt-0.5">{row.label}</div>
                            {/* Arrow */}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                          </div>
                        </div>
                      )}

                      {/* Bar */}
                      <div
                        className="w-full rounded-t-lg transition-all duration-300 relative overflow-hidden"
                        style={{
                          height: `${Math.max(heightPct, hasData ? 2 : 0)}%`,
                          minHeight: hasData ? 4 : 0,
                          background: isHovered
                            ? 'linear-gradient(180deg, #4c5ab4 0%, #5c6ac4 100%)'
                            : hasData
                            ? 'linear-gradient(180deg, #7b8dd4 0%, #5c6ac4 100%)'
                            : 'transparent',
                        }}
                      >
                        {/* Shine effect */}
                        {hasData && (
                          <div className="absolute inset-x-0 top-0 h-1/3 bg-white/20 rounded-t-lg" />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* X-axis labels */}
              <div className="flex gap-px mt-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex-1 text-center">
                    {i % showEvery === 0 ? (
                      <span className={`text-[10px] font-medium ${
                        hoveredIdx === i ? 'text-admin' : 'text-gray-400'
                      } transition-colors`}>
                        {period === 'week'
                          ? row.label.split(' ')[0] // just weekday abbr
                          : period === 'month'
                          ? row.label.split(' ')[0] // just day number
                          : row.label
                        }
                      </span>
                    ) : (
                      <span className="text-[10px] text-transparent select-none">·</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom summary bar */}
      {!loading && data && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-4 text-[12px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-admin/70 inline-block" />
              Выручка (тг)
            </span>
          </div>
          <Link href="/admin/orders" className="text-[12px] text-admin hover:underline font-medium">
            Все заказы →
          </Link>
        </div>
      )}
    </div>
  )
}

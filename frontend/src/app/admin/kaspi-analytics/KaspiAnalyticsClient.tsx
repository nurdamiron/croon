'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { KaspiAnalyticsResult, ProductRow, AbcBucket, StockForecast, OrderTiming, StatusFunnel } from '@/lib/kaspi-analytics'
import type { ChannelComparison, ChannelKey } from '@/lib/channel-comparison'
import { CHANNEL_LABELS } from '@/lib/channel-comparison'
import type { TopBarItem } from './charts/TopBarChart'

// ECharts грузим только на клиенте (трогает window) — иначе «window is not defined» на билде.
const ChartSkeleton = () => (
  <div className="flex items-center justify-center h-40 text-gray-300">
    <span className="inline-block w-5 h-5 border-2 border-gray-200 border-t-admin rounded-full animate-spin" />
  </div>
)
const TopBarChart = dynamic(() => import('./charts/TopBarChart'), {
  ssr: false,
  loading: ChartSkeleton,
})
const AbcTreemap = dynamic(() => import('./charts/AbcTreemap'), {
  ssr: false,
  loading: ChartSkeleton,
})
const DailyChart = dynamic(() => import('./charts/DailyChart'), {
  ssr: false,
  loading: ChartSkeleton,
})
const StatusDonut = dynamic(() => import('./charts/StatusDonut'), {
  ssr: false,
  loading: ChartSkeleton,
})
const RevenueStructure = dynamic(() => import('./charts/RevenueStructure'), {
  ssr: false,
  loading: ChartSkeleton,
})
const CashflowChart = dynamic(() => import('./charts/CashflowChart'), {
  ssr: false,
  loading: ChartSkeleton,
})

type TabKey = 'summary' | 'productStats' | 'forecast' | 'channels' | 'cashflow' | 'problems'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'summary', label: 'Сводные показатели' },
  { key: 'productStats', label: 'Товары' },
  { key: 'forecast', label: 'Закупки' },
  { key: 'channels', label: 'Каналы' },
  { key: 'cashflow', label: 'Денежные операции' },
  { key: 'problems', label: 'Проблемные товары' },
]

// --- форматтеры ---
function fmtPrice(n: number) {
  return Math.round(n).toLocaleString('ru-RU') + ' ₸'
}
function fmtPct(n: number | null) {
  return n == null ? '—' : `${n.toFixed(1)}%`
}
function fmtNum(n: number) {
  return n.toLocaleString('ru-RU')
}

// Название товара: ссылка на карточку в админке сайта (по productId) + иконка-ссылка на Kaspi (по kaspiUrl).
function ProductNameLink({ row }: { row: ProductRow }) {
  if (!row.productId) return <span className="text-gray-400">{row.name}</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link href={`/admin/products/${row.productId}`} className="hover:text-admin">
        {row.name}
      </Link>
      {row.kaspiUrl && (
        <a
          href={row.kaspiUrl}
          target="_blank"
          rel="noreferrer"
          title="Открыть на Kaspi"
          className="shrink-0 text-[#ff3b30] hover:opacity-70"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      )}
    </span>
  )
}

// Дельта к прошлому периоду: ▲ зелёная / ▼ красная / «—».
function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value == null) return <span className="text-gray-400 text-xs">—</span>
  const up = value >= 0
  // invert=true для метрик, где рост = плохо (напр. возвраты)
  const good = invert ? !up : up
  const color = value === 0 ? 'text-gray-400' : good ? 'text-green-600' : 'text-red-500'
  const arrow = value === 0 ? '' : up ? '▲' : '▼'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

function KpiCard({
  label,
  value,
  sub,
  delta,
  invertDelta,
}: {
  label: string
  value: string
  sub?: string
  delta?: number | null
  invertDelta?: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {delta !== undefined && <Delta value={delta} invert={invertDelta} />}
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
    </div>
  )
}

// Таблица проблемных/прочих товаров.
function ProductTable({
  title,
  rows,
  columns,
  empty,
}: {
  title: string
  rows: ProductRow[]
  columns: { key: string; label: string; render: (r: ProductRow) => string; cls?: (r: ProductRow) => string }[]
  empty: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Товар</th>
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-2 font-medium text-right whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-gray-400 text-sm">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.productId || r.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800">
                    <ProductNameLink row={r} />
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2 text-right tabular-nums whitespace-nowrap ${c.cls?.(r) || 'text-gray-700'}`}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type PresetKey = number | 'month' | 'year' | 'all'
const PRESETS: { label: string; days: PresetKey }[] = [
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
  { label: 'Год', days: 'year' },
  { label: 'Всё время', days: 'all' },
]

// Какую дату «С» дал бы пресет при «По» = today (Костанай). Для подсветки активного.
// allFromStr — дата первой продажи (для пресета «Всё время»): сервер поджимает к ней.
function presetFrom(days: PresetKey, today: string, allFromStr: string): string {
  if (days === 'month') return today.slice(0, 8) + '01'
  if (days === 'all') return allFromStr
  const span = days === 'year' ? 365 : (days as number)
  const d = new Date(`${today}T00:00:00+05:00`)
  d.setUTCDate(d.getUTCDate() - (span - 1))
  return d.toISOString().slice(0, 10)
}
function presetMatches(days: PresetKey, from: string, to: string, today: string, allFromStr: string): boolean {
  return to === today && from === presetFrom(days, today, allFromStr)
}

export default function KaspiAnalyticsClient({
  data,
  channels,
  fromStr,
  toStr,
  firstSaleStr,
}: {
  data: KaspiAnalyticsResult
  channels: ChannelComparison
  fromStr: string
  toStr: string
  firstSaleStr: string // дата первой продажи (для пресета «Всё время»)
}) {
  const router = useRouter()
  const [from, setFrom] = useState(fromStr)
  const [to, setTo] = useState(toStr)
  const [tab, setTab] = useState<TabKey>('summary')

  const apply = (f: string, t: string) => {
    router.push(`/admin/kaspi-analytics?from=${f}&to=${t}`)
  }

  // YYYY-MM-DD текущий бизнес-день: Костанай (UTC+5) + отсечка 17:00 (сдвиг +7ч).
  // После 17:00 «сегодня» = уже следующая дата — как считает сервер.
  const todayAlmaty = () => new Date(Date.now() + 5 * 3600_000 + 7 * 3600_000).toISOString().slice(0, 10)
  const applyPreset = (days: PresetKey) => {
    const t = todayAlmaty()
    let f: string
    if (days === 'month') {
      f = t.slice(0, 8) + '01'
    } else if (days === 'year') {
      // последние 365 дней
      const d = new Date(`${t}T00:00:00+05:00`)
      d.setUTCDate(d.getUTCDate() - 364)
      f = d.toISOString().slice(0, 10)
    } else if (days === 'all') {
      // «всё время» = с даты первой продажи (сервер поджимает к ней, без пустых лет).
      f = firstSaleStr
    } else {
      const d = new Date(`${t}T00:00:00+05:00`)
      d.setUTCDate(d.getUTCDate() - (days - 1))
      f = d.toISOString().slice(0, 10)
    }
    setFrom(f)
    setTo(t)
    apply(f, t)
  }

  const k = data.kpi
  const cur = k.current

  // Данные для бар-чартов.

  const abcReady = data.abc.some((b: AbcBucket) => b.products.length > 0)

  return (
    <div className="space-y-6">
      {/* Период */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            С
            <input
              type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            По
            <input
              type="date" value={to} min={from} max={todayAlmaty()} onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-admin outline-none"
            />
          </label>
          <button
            onClick={() => apply(from, to)}
            className="px-4 py-2 bg-admin hover:bg-admin-hover text-white text-sm font-medium rounded-lg transition-colors"
          >
            Применить
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const active = presetMatches(p.days, from, to, todayAlmaty(), firstSaleStr)
            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p.days)}
                className={`px-3 py-2 text-sm border rounded-lg transition-colors ${
                  active
                    ? 'bg-admin text-white border-admin'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Вкладки (как у AlgaTop) */}
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* === Сводные показатели === */}
      {tab === 'summary' && (
        <div className="space-y-6">
          {/* Рентабельность бизнеса */}
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <div className="text-xs text-gray-500">Рентабельность бизнеса</div>
            <div className="mt-1 text-3xl font-bold text-gray-900 tabular-nums">
              {data.revenueStructure.revenueBase > 0
                ? `${((data.revenueStructure.netProfit / data.revenueStructure.revenueBase) * 100).toFixed(2)} %`
                : '—'}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              чистая прибыль ÷ выручка с известной себестоимостью
            </div>
          </div>

          {/* Баннер: товары без себестоимости — раскрывается в список с прямыми ссылками */}
          {data.noCostCohort.count > 0 && (
            <details className="bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 group">
              <summary className="cursor-pointer select-none px-4 py-3 list-none flex items-start justify-between gap-3">
                <span>
                  <b>{data.noCostCohort.count}</b>{' '}
                  {plural(data.noCostCohort.count, 'товар', 'товара', 'товаров')} без себестоимости — исключены из
                  прибыли, маржи и ABC (выручка {fmtPrice(data.noCostCohort.revenue)} учтена). Известно по себестоимости{' '}
                  <b>{cur.costCoveragePct.toFixed(0)}%</b> выручки.{' '}
                  <span className="underline">показать список ▾</span>
                </span>
              </summary>
              <div className="px-4 pb-4 pt-1 border-t border-amber-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-amber-700/70">
                      <th className="py-1.5 font-medium">Товар</th>
                      <th className="py-1.5 font-medium">SKU</th>
                      <th className="py-1.5 font-medium text-right">Выручка</th>
                      <th className="py-1.5 font-medium text-right pr-1">Ссылки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.noCostCohort.items.map((it) => (
                      <tr key={it.productId} className="border-t border-amber-100/60">
                        <td className="py-1.5 pr-2 text-gray-800">{it.name}</td>
                        <td className="py-1.5 pr-2 font-mono text-gray-500">{it.sku || '—'}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600">{fmtPrice(it.revenue)}</td>
                        <td className="py-1.5 text-right whitespace-nowrap pr-1">
                          <a
                            href={`/admin/products/${it.productId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-admin hover:underline font-medium"
                          >
                            заполнить
                          </a>
                          {it.slug && (
                            <>
                              {' · '}
                              <a
                                href={`/product/${it.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-gray-500 hover:underline"
                              >
                                сайт ↗
                              </a>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Выручка" value={fmtPrice(cur.revenue)} delta={k.delta.revenue} />
            <KpiCard
              label="Прибыль"
              value={cur.profit == null ? '—' : fmtPrice(cur.profit)}
              delta={k.delta.profit}
              sub="за вычетом комиссий/налога"
            />
            <KpiCard label="Маржа" value={fmtPct(cur.marginPct)} delta={k.delta.marginPct} />
            <KpiCard label="Заказы" value={fmtNum(cur.buyoutCount)} delta={k.delta.orderCount} sub="поступившие (без отмен)" />
            <KpiCard label="Возвраты / отмены" value={fmtNum(cur.returnCount)} invertDelta />
            <KpiCard label="Средний чек" value={fmtPrice(cur.avgCheck)} delta={k.delta.avgCheck} />
          </div>

          {/* Большой объединённый график: выручка + прибыль + маржа по дням */}
          <Section title="Выручка, прибыль и маржа по дням" subtitle="всё на одном графике — столбцы ₸, маржа линией (%)">
            {data.daily.length ? <DailyChart items={data.daily} mode="combined" /> : <Empty />}
          </Section>

          {/* Сводные блоки «здоровья бизнеса» */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="Статусы заказов">
              {(data.statusCounts.delivered + data.statusCounts.inProgress + data.statusCounts.cancelled + data.statusCounts.returned) > 0 ? (
                <StatusDonut counts={data.statusCounts} />
              ) : (
                <Empty />
              )}
            </Section>
            <Section title="Структура выручки" subtitle="из чего складывается выручка">
              {data.revenueStructure.revenueBase > 0 ? (
                <RevenueStructure s={data.revenueStructure} />
              ) : (
                <Empty text="Нужна себестоимость хотя бы у части товаров" />
              )}
            </Section>
          </div>

          {/* Воронка статусов / невыкуп */}
          <Section title="Воронка заказов" subtitle="сколько доходит до выдачи + отмены и возвраты">
            {data.statusFunnel.stages[0]?.count > 0 ? (
              <StatusFunnelView funnel={data.statusFunnel} />
            ) : (
              <Empty />
            )}
          </Section>

          {/* Когда покупают: часы × дни недели */}
          <Section title="Когда покупают" subtitle="заказы по часам и дням недели (время Костанай)">
            {data.orderTiming.total > 0 ? (
              <TimingHeatmap timing={data.orderTiming} />
            ) : (
              <Empty />
            )}
          </Section>
        </div>
      )}

      {/* === Товары === (ABC → ключевые ТОПы → полная таблица → доп. диагностика) */}
      {tab === 'productStats' && (
        <div className="space-y-6">
          {/* 1. ABC-анализ — главная картина прибыльности ассортимента */}
          <Section
            title="ABC-анализ по прибыльности"
            subtitle="A — 80% прибыли · B — 15% · C — 5% · только проданные товары с себестоимостью"
          >
            {abcReady ? (
              <>
                <AbcTreemap buckets={data.abc} />
                <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
                  {data.abc.map((b) => (
                    <span key={b.bucket} className="flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: { A: '#22c55e', B: '#f59e0b', C: '#ef4444' }[b.bucket] }} />
                      {b.bucket}: {b.products.length} тов., {fmtPrice(b.profit)} ({b.sharePct.toFixed(0)}%)
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <Empty text="Недостаточно данных для ABC (нет товаров с себестоимостью)" />
            )}
          </Section>

          {/* 2. Ключевые ТОПы: выручка / прибыль / маржа / ниже закупа */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BarSection title="ТОП по выручке" rows={data.topByRevenue} value={(r) => r.revenue} unit="₸" />
            <BarSection title="ТОП по прибыли" rows={data.topByProfit} value={(r) => r.profit || 0} unit="₸" empty="Нет товаров с себестоимостью" />
            <BarSection title="ТОП по марже" rows={data.topByMargin} value={(r) => r.marginPct || 0} unit="%" empty="Нет товаров с себестоимостью" />
            <BarSection title="ТОП товаров с ценой ниже закупочной" rows={data.productTops.belowCost} value={(r) => r.revenue} unit="₸" empty="Таких товаров нет 🎉" />
          </div>

          {/* 3. Полная таблица по всем проданным товарам (сортируемая) */}
          <Section title="Все проданные товары" subtitle="клик по заголовку — сортировка">
            <SortableProductTable rows={data.products} />
          </Section>
          {data.unlinked.qtySold > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex flex-col items-start gap-3">
              <span>
                <b>Без привязки к товару:</b> {fmtNum(data.unlinked.qtySold)} шт. на {fmtPrice(data.unlinked.revenue)} —
                это позиции Kaspi-заказов, чей SKU не сопоставлен с товаром (учтены в выручке, но не в прибыли/ABC).
              </span>
              <RelinkButton />
            </div>
          )}

          {/* 4. Доп. диагностика: возвраты/отмены и наценка — свёрнуто, чтобы не шуметь */}
          <details className="bg-white border border-gray-200 rounded-xl overflow-hidden group">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 list-none flex items-center justify-between">
              <span>Дополнительно: возвраты, отмены и наценка</span>
              <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BarSection title="ТОП возвращаемых товаров" rows={data.productTops.returns} value={(r) => r.returnedCount} unit="шт" empty="Возвратов нет" />
                <BarSection title="ТОП отменяемых товаров" rows={data.productTops.cancels} value={(r) => r.cancelCount} unit="шт" empty="Отмен нет" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BarSection title="ТОП по сумме наценки" subtitle="прибыль ₸, высокая" rows={data.productTops.markupAmountHigh} value={(r) => r.profit || 0} unit="₸" empty="Нет товаров с себестоимостью" />
                <BarSection title="Минимальная сумма наценки" subtitle="прибыль ₸, низкая" rows={data.productTops.markupAmountLow} value={(r) => r.profit || 0} unit="₸" empty="Нет товаров с себестоимостью" />
                <BarSection title="ТОП по % наценки" subtitle="высокий" rows={data.productTops.markupPctHigh} value={(r) => r.markupPct || 0} unit="%" empty="Нет товаров с себестоимостью" />
                <BarSection title="Минимальный % наценки" subtitle="низкий" rows={data.productTops.markupPctLow} value={(r) => r.markupPct || 0} unit="%" empty="Нет товаров с себестоимостью" />
              </div>
            </div>
          </details>
        </div>
      )}

      {/* === Закупки (прогноз остатков) === */}
      {tab === 'forecast' && <ForecastTab forecast={data.stockForecast} />}

      {/* === Сравнение каналов === */}
      {tab === 'channels' && <ChannelsTab channels={channels} />}

      {/* === Денежные операции === */}
      {tab === 'cashflow' && <CashflowTab cashflow={data.cashflow} />}

      {/* === Проблемные товары === */}
      {tab === 'problems' && (
        <div className="grid grid-cols-1 gap-4">
          <ProductTable
            title="Убыточные товары (цена ниже себестоимости)"
            rows={data.problems.lossMaking}
            empty="Убыточных товаров нет 🎉"
            columns={[
              { key: 'qty', label: 'Продано', render: (r) => fmtNum(r.qtySold) },
              { key: 'rev', label: 'Выручка', render: (r) => fmtPrice(r.revenue) },
              { key: 'profit', label: 'Прибыль', render: (r) => (r.profit == null ? '—' : fmtPrice(r.profit)), cls: () => 'text-red-600 font-medium' },
              { key: 'margin', label: 'Маржа', render: (r) => fmtPct(r.marginPct), cls: () => 'text-red-600' },
            ]}
          />
          <ProductTable
            title="Частые возвраты / отмены (≥ 20%)"
            rows={data.problems.highReturn}
            empty="Товаров с частыми возвратами нет"
            columns={[
              { key: 'sold', label: 'Выкуплено', render: (r) => fmtNum(r.soldCount) },
              { key: 'ret', label: 'Возвр./отмен', render: (r) => fmtNum(r.returnCount), cls: () => 'text-red-600 font-medium' },
              {
                key: 'rate',
                label: 'Доля',
                render: (r) => `${Math.round((r.returnCount / (r.soldCount + r.returnCount)) * 100)}%`,
                cls: () => 'text-red-600',
              },
            ]}
          />
          <ProductTable
            title="Низкая наценка (< 10%)"
            rows={data.problems.lowMarkup}
            empty="Товаров с низкой наценкой нет"
            columns={[
              { key: 'qty', label: 'Продано', render: (r) => fmtNum(r.qtySold) },
              { key: 'rev', label: 'Выручка', render: (r) => fmtPrice(r.revenue) },
              { key: 'markup', label: 'Наценка', render: (r) => fmtPct(r.markupPct), cls: () => 'text-amber-600 font-medium' },
              { key: 'margin', label: 'Маржа', render: (r) => fmtPct(r.marginPct) },
            ]}
          />
        </div>
      )}
    </div>
  )
}

// Вкладка «Денежные операции»: график поступлений + сводка удержаний.
function CashflowTab({ cashflow }: { cashflow: KaspiAnalyticsResult['cashflow'] }) {
  const totals = cashflow.reduce(
    (s, c) => ({
      deposit: s.deposit + c.deposit,
      commission: s.commission + c.commission,
      delivery: s.delivery + c.delivery,
    }),
    { deposit: 0, commission: 0, delivery: 0 }
  )
  const hasData = cashflow.some((c) => c.deposit !== 0 || c.commission !== 0 || c.delivery !== 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Поступления (нетто)" value={fmtPrice(totals.deposit)} sub="что Kaspi перечислит" />
        <KpiCard label="Комиссия Kaspi" value={fmtPrice(totals.commission)} sub="комиссия + Kaspi Pay" />
        <KpiCard label="Удержано за доставку" value={fmtPrice(totals.delivery)} />
      </div>
      <Section title="Денежные поступления" subtitle="поступление продавцу и удержания Kaspi по дням">
        {hasData ? <CashflowChart items={cashflow} /> : <Empty />}
      </Section>
      <p className="text-xs text-gray-400">
        Расчётно по вашим ставкам Kaspi. Налог не входит (Kaspi не удерживает его из выплаты).
      </p>
    </div>
  )
}

// Воронка статусов: горизонтальные бары «дошёл до этапа или дальше» + выкуп и утечки.
function StatusFunnelView({ funnel }: { funnel: StatusFunnel }) {
  const { stages, cancelled, returned, buyoutRate } = funnel
  const base = stages[0]?.count || 1
  const stageColor = ['bg-blue-500', 'bg-amber-500', 'bg-indigo-500', 'bg-green-500']
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Выкуп (buyout)"
          value={buyoutRate == null ? '—' : `${buyoutRate.toFixed(0)} %`}
          sub="Выдан ÷ Оплачен"
        />
        <KpiCard label="Отменено" value={fmtNum(cancelled)} sub="за период" />
        <KpiCard label="Возвраты" value={fmtNum(returned)} sub="за период" />
      </div>

      <div className="space-y-2">
        {stages.map((s, i) => {
          const widthPct = Math.max(2, (s.count / base) * 100)
          const drop = i > 0 ? stages[i - 1].count - s.count : 0
          return (
            <div key={s.key} className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-xs text-gray-600 text-right">{s.label}</div>
              <div className="flex-1 bg-gray-100 rounded-md overflow-hidden h-7 relative">
                <div
                  className={`h-full ${stageColor[i]} flex items-center px-2 text-white text-xs font-medium tabular-nums transition-all`}
                  style={{ width: `${widthPct}%` }}
                >
                  {s.count}
                </div>
              </div>
              <div className="w-24 shrink-0 text-xs text-gray-500 tabular-nums">
                {s.pct.toFixed(0)}%
                {i > 0 && drop > 0 && <span className="text-red-500 ml-1">−{drop}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400">
        Кумулятивно: «дошёл до этапа или дальше» (истории переходов у Kaspi мы не храним, поэтому
        Выдан ⇒ прошёл все предыдущие). Отмены/возвраты — отдельно как утечки.
      </p>
    </div>
  )
}

// Хитмап «когда покупают»: 7 дней недели × 24 часа. Цвет ячейки = интенсивность к пику.
const WEEKDAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
function TimingHeatmap({ timing }: { timing: OrderTiming }) {
  const { matrix, byHour, peak, total } = timing
  const max = peak?.count || 1
  // непрозрачность ячейки от объёма (0 → почти прозрачно, max → насыщенный admin)
  const cellStyle = (v: number) => {
    if (v === 0) return { background: '#f8fafc' } // gray-50
    const op = 0.15 + 0.85 * (v / max)
    return { background: `rgba(92, 106, 196, ${op.toFixed(3)})`, color: op > 0.6 ? '#fff' : '#1f2937' }
  }
  const peakHourLabel = (() => {
    let bestH = 0
    for (let h = 1; h < 24; h++) if (byHour[h] > byHour[bestH]) bestH = h
    return `${String(bestH).padStart(2, '0')}:00`
  })()

  return (
    <div className="space-y-3">
      {peak && (
        <div className="text-xs text-gray-500">
          Пик: <b className="text-gray-800">{WEEKDAYS_RU[peak.weekday]} {String(peak.hour).padStart(2, '0')}:00</b>{' '}
          ({peak.count} зак.) · самый активный час в среднем — <b className="text-gray-800">{peakHourLabel}</b> · всего {fmtNum(total)} заказов
        </div>
      )}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* шапка часов */}
          <div className="flex">
            <div className="w-8 shrink-0" />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 min-w-[16px] text-center text-[9px] text-gray-400 tabular-nums">
                {h % 3 === 0 ? h : ''}
              </div>
            ))}
          </div>
          {/* строки дней */}
          {matrix.map((row, wd) => (
            <div key={wd} className="flex items-center">
              <div className="w-8 shrink-0 text-[11px] text-gray-500 font-medium pr-1 text-right">{WEEKDAYS_RU[wd]}</div>
              {row.map((v, h) => (
                <div
                  key={h}
                  title={`${WEEKDAYS_RU[wd]} ${String(h).padStart(2, '0')}:00 — ${v} зак.`}
                  className="flex-1 min-w-[16px] h-5 m-[1px] rounded-sm text-[9px] flex items-center justify-center tabular-nums transition-colors"
                  style={cellStyle(v)}
                >
                  {v > 0 && v >= max * 0.5 ? v : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-gray-400">
        Чем насыщеннее ячейка — тем больше заказов в этот час. Держи склад и онлайн к пикам.
      </p>
    </div>
  )
}

// Вкладка «Каналы»: сравнение продаж/маржи одного товара по Kaspi/Satu/Ba3ar/сайту.
const CHANNEL_ORDER: ChannelKey[] = ['kaspi', 'site']
const CHANNEL_DOT: Record<ChannelKey, string> = {
  kaspi: 'bg-red-500',
  site: 'bg-blue-500',
}
function ChannelsTab({ channels }: { channels: ChannelComparison }) {
  const { rows, totals } = channels
  const [onlyMulti, setOnlyMulti] = useState(false)
  const shown = onlyMulti
    ? rows.filter((r) => CHANNEL_ORDER.filter((c) => r.byChannel[c].qty > 0).length >= 2)
    : rows

  if (rows.length === 0) {
    return <Empty text="Нет завершённых продаж ни по одному каналу за период" />
  }

  return (
    <div className="space-y-5">
      {/* Итоги по каналам */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {CHANNEL_ORDER.map((ch) => {
          const t = totals[ch]
          const margin = t.revenue > 0 ? (t.profit / t.revenue) * 100 : null
          return (
            <div key={ch} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${CHANNEL_DOT[ch]}`} />
                {CHANNEL_LABELS[ch]}
              </div>
              <div className="mt-1 text-xl font-bold text-gray-900 tabular-nums">{fmtPrice(t.revenue)}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {fmtNum(t.qty)} шт · {fmtNum(t.orders)} зак.{margin != null && ` · маржа ${margin.toFixed(0)}%`}
              </div>
            </div>
          )
        })}
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer w-fit">
        <input type="checkbox" checked={onlyMulti} onChange={(e) => setOnlyMulti(e.target.checked)} className="accent-admin" />
        только товары, что продаются на 2+ каналах
      </label>

      <div className="overflow-x-auto border border-gray-100 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 bg-gray-50/60 text-xs uppercase tracking-wide">
              <th className="px-3 py-2 font-medium sticky left-0 bg-gray-50/60">Товар</th>
              {CHANNEL_ORDER.map((ch) => (
                <th key={ch} className="px-3 py-2 font-medium text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 justify-end">
                    <span className={`inline-block w-2 h-2 rounded-full ${CHANNEL_DOT[ch]}`} />
                    {CHANNEL_LABELS[ch]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 200).map((r) => (
              <tr key={r.productId} className="border-t border-gray-50 hover:bg-gray-50/40">
                <td className="px-3 py-2 sticky left-0 bg-white">
                  <Link href={`/admin/products/${r.productId}`} target="_blank" className="text-admin hover:underline">
                    {r.name}
                  </Link>
                  {r.sku && <span className="ml-2 text-xs text-gray-400 font-mono">{r.sku}</span>}
                </td>
                {CHANNEL_ORDER.map((ch) => {
                  const cell = r.byChannel[ch]
                  const isBest = r.bestChannel === ch && cell.qty > 0
                  if (cell.qty === 0) {
                    return <td key={ch} className="px-3 py-2 text-right text-gray-300">—</td>
                  }
                  return (
                    <td key={ch} className={`px-3 py-2 text-right tabular-nums ${isBest ? 'bg-green-50' : ''}`}>
                      <div className="font-medium text-gray-800">{fmtNum(cell.qty)} шт</div>
                      <div className="text-[11px] text-gray-400">
                        {fmtPrice(cell.revenue)}
                        {cell.marginPct != null && (
                          <span className={isBest ? 'text-green-600 font-medium ml-1' : 'ml-1'}>
                            · {cell.marginPct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">
        Зелёным — канал с самой высокой маржой по товару. Маржа Kaspi учитывает комиссию + Kaspi Pay + налог;
        сайт — только налог (нет маркетплейс-комиссии). Нужна себестоимость, иначе маржа пустая.
      </p>
    </div>
  )
}

// Вкладка «Закупки»: прогноз остатков (что заказать) + мёртвый сток (заморожены деньги).
function ForecastTab({ forecast }: { forecast: StockForecast }) {
  const { runningOut, deadStock, deadStockTotalFrozen, periodDays } = forecast
  const daysLabel = (d: number | null) =>
    d == null ? '—' : d < 1 ? '< 1 дн' : `${Math.round(d)} дн`
  const prodLink = (id: string) => `/admin/products/${id}`

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-400">
        Скорость продаж считается по выкупам Kaspi за выбранный период ({periodDays} дн). «Дней до нуля» =
        доступный остаток ÷ продаж в день. Учитываются только товары с активным оффером на Kaspi.
      </p>

      {/* Скоро закончится — заказать */}
      <Section
        title="Скоро закончится — заказать"
        subtitle="продаётся и остатка хватит ≤ 21 дня"
      >
        {runningOut.length === 0 ? (
          <Empty text="Нет товаров на грани — запасов хватает 👍" />
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 bg-gray-50/60 text-xs uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Товар</th>
                  <th className="px-4 py-2 font-medium text-right">Остаток</th>
                  <th className="px-4 py-2 font-medium text-right">Продаж/день</th>
                  <th className="px-4 py-2 font-medium text-right">Хватит на</th>
                </tr>
              </thead>
              <tbody>
                {runningOut.map((r) => {
                  const urgent = r.daysLeft != null && r.daysLeft <= 7
                  return (
                    <tr key={r.productId} className="border-t border-gray-50 hover:bg-gray-50/40">
                      <td className="px-4 py-2">
                        <Link href={prodLink(r.productId)} target="_blank" className="text-admin hover:underline">
                          {r.name}
                        </Link>
                        {r.sku && <span className="ml-2 text-xs text-gray-400 font-mono">{r.sku}</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmtNum(r.available)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{r.perDay.toFixed(1)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums font-medium ${urgent ? 'text-red-600' : 'text-amber-600'}`}>
                        {daysLabel(r.daysLeft)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Мёртвый сток — заморожены деньги */}
      <Section
        title="Мёртвый сток — заморожены деньги"
        subtitle={`есть остаток, но 0 продаж за ${periodDays} дн`}
      >
        {deadStock.length === 0 ? (
          <Empty text="Мёртвого стока нет 🎉" />
        ) : (
          <>
            <div className="mb-3">
              <KpiCard
                label="Заморожено в мёртвом стоке"
                value={fmtPrice(deadStockTotalFrozen)}
                sub={`${deadStock.length} товаров · по себестоимости`}
              />
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 bg-gray-50/60 text-xs uppercase tracking-wide">
                    <th className="px-4 py-2 font-medium">Товар</th>
                    <th className="px-4 py-2 font-medium text-right">Остаток</th>
                    <th className="px-4 py-2 font-medium text-right">Себест.</th>
                    <th className="px-4 py-2 font-medium text-right">Заморожено</th>
                  </tr>
                </thead>
                <tbody>
                  {deadStock.map((r) => (
                    <tr key={r.productId} className="border-t border-gray-50 hover:bg-gray-50/40">
                      <td className="px-4 py-2">
                        <Link href={prodLink(r.productId)} target="_blank" className="text-admin hover:underline">
                          {r.name}
                        </Link>
                        {r.sku && <span className="ml-2 text-xs text-gray-400 font-mono">{r.sku}</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{fmtNum(r.available)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                        {r.costPrice == null ? '—' : fmtPrice(r.costPrice)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-800">
                        {r.frozen == null ? '—' : fmtPrice(r.frozen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Товары без себестоимости показаны без суммы заморозки. «Заморожено» = остаток × себестоимость.
            </p>
          </>
        )}
      </Section>
    </div>
  )
}

// Кнопка привязки «потерянных» позиций: сначала dry-run (GET), показываем сколько привяжется,
// затем по подтверждению — apply (POST) и обновление страницы.
type RelinkSample = { kaspiSku: string; kaspiName: string | null; matchedBy: 'sku' | 'name' | null }

function RelinkButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Непривязанные позиции (SKU + название) — чтобы можно было найти и привязать вручную.
  const [unmatched, setUnmatched] = useState<RelinkSample[]>([])

  const run = async () => {
    setBusy(true); setMsg(null); setUnmatched([])
    try {
      // dry-run
      const dry = await fetch('/api/admin/kaspi-orders/relink').then((r) => r.json())
      if (dry.error) throw new Error(dry.error)
      const stuck: RelinkSample[] = Array.isArray(dry.samples)
        ? dry.samples.filter((s: RelinkSample) => s.matchedBy === null)
        : []
      const willLink = dry.bySku + dry.byName
      if (willLink === 0) {
        setMsg(`Привязать не удалось: ${dry.total} позиций без совпадений по SKU и названию.`)
        setUnmatched(stuck)
        return
      }
      if (!confirm(`Привязать ${willLink} из ${dry.total} позиций?\n• по SKU: ${dry.bySku}\n• по названию: ${dry.byName}\n• останется без привязки: ${dry.stillNull}`)) {
        return
      }
      const res = await fetch('/api/admin/kaspi-orders/relink', { method: 'POST' }).then((r) => r.json())
      if (res.error) throw new Error(res.error)
      setMsg(`Привязано: ${res.bySku + res.byName} (SKU ${res.bySku}, имя ${res.byName}). Осталось: ${res.stillNull}.`)
      setUnmatched(
        Array.isArray(res.samples) ? res.samples.filter((s: RelinkSample) => s.matchedBy === null) : []
      )
      router.refresh()
    } catch (e) {
      setMsg('Ошибка: ' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex flex-col gap-2 w-full">
      <span className="flex items-center gap-2 flex-wrap">
        <button
          onClick={run}
          disabled={busy}
          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
        >
          {busy ? 'Привязываю…' : 'Привязать к товарам'}
        </button>
        {msg && <span className="text-xs text-amber-900">{msg}</span>}
      </span>

      {unmatched.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 text-xs font-semibold text-amber-900 border-b border-amber-100">
            Не привязаны ({unmatched.length}) — найдите товар по SKU и привяжите оффер вручную:
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 bg-gray-50/60">
                <th className="px-3 py-1.5 font-medium">SKU (Kaspi)</th>
                <th className="px-3 py-1.5 font-medium">Название в заказе</th>
              </tr>
            </thead>
            <tbody>
              {unmatched.map((s, i) => (
                <tr key={`${s.kaspiSku}-${i}`} className="border-t border-gray-50">
                  <td className="px-3 py-1.5 font-mono text-gray-800 whitespace-nowrap">
                    {s.kaspiSku ? (
                      <a
                        href={`/admin/products?search=${encodeURIComponent(s.kaspiSku)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-admin hover:underline"
                      >
                        {s.kaspiSku}
                      </a>
                    ) : (
                      <span className="text-gray-400">— нет SKU —</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700">
                    {s.kaspiName ? (
                      <a
                        href={`/admin/products?search=${encodeURIComponent(s.kaspiName)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {s.kaspiName}
                      </a>
                    ) : (
                      <span className="text-gray-400">— нет названия —</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </span>
  )
}

// Бар-чарт из списка товаров (Section + TopBarChart) с селектором значения.
function BarSection({
  title,
  subtitle,
  rows,
  value,
  unit,
  empty,
}: {
  title: string
  subtitle?: string
  rows: ProductRow[]
  value: (r: ProductRow) => number
  unit: '₸' | '%' | 'шт'
  empty?: string
}) {
  const items: TopBarItem[] = rows.map((r) => ({ name: r.name, value: value(r) }))
  // TopBarChart умеет ₸/%; для 'шт' используем ₸-стиль без знака валюты — упрощаем до ₸-форматтера? Нет:
  const chartUnit: '₸' | '%' = unit === '%' ? '%' : '₸'
  return (
    <Section title={title} subtitle={subtitle}>
      {items.length ? (
        unit === 'шт' ? (
          <UnitBars items={items} />
        ) : (
          <TopBarChart items={items} unit={chartUnit} />
        )
      ) : (
        <Empty text={empty || 'Нет данных за выбранный период'} />
      )}
    </Section>
  )
}

// Простой бар-чарт для счётных величин (шт) — без знака ₸/%.
function UnitBars({ items }: { items: TopBarItem[] }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.name} className="flex items-center gap-2 text-xs">
          <span className="w-1/2 truncate text-gray-700" title={i.name}>{i.name}</span>
          <div className="flex-1 bg-gray-100 rounded h-4 relative">
            <div className="bg-admin h-4 rounded" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right tabular-nums font-medium text-gray-800">{fmtNum(i.value)}</span>
        </div>
      ))}
    </div>
  )
}

// Сортируемая потоварная таблица.
type SortKey = 'name' | 'qtySold' | 'revenue' | 'cost' | 'profit' | 'marginPct' | 'markupPct' | 'returnCount'

function SortableProductTable({ rows }: { rows: ProductRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const cols: { key: SortKey; label: string; align: 'left' | 'right'; render: (r: ProductRow) => string; cls?: (r: ProductRow) => string }[] = [
    { key: 'name', label: 'Товар', align: 'left', render: (r) => r.name },
    { key: 'qtySold', label: 'Продано', align: 'right', render: (r) => fmtNum(r.qtySold) },
    { key: 'revenue', label: 'Выручка', align: 'right', render: (r) => fmtPrice(r.revenue) },
    { key: 'cost', label: 'Себест.', align: 'right', render: (r) => (r.cost == null ? '—' : fmtPrice(r.cost)) },
    { key: 'profit', label: 'Прибыль', align: 'right', render: (r) => (r.profit == null ? '—' : fmtPrice(r.profit)), cls: (r) => ((r.profit || 0) < 0 ? 'text-red-600 font-medium' : 'text-gray-800') },
    { key: 'marginPct', label: 'Маржа', align: 'right', render: (r) => fmtPct(r.marginPct) },
    { key: 'markupPct', label: 'Наценка', align: 'right', render: (r) => fmtPct(r.markupPct) },
    { key: 'returnCount', label: 'Возвраты', align: 'right', render: (r) => fmtNum(r.returnCount) },
  ]

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const NEG = -Infinity
    return [...rows].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ru') * dir
      const av = (a[sortKey] as number | null) ?? NEG
      const bv = (b[sortKey] as number | null) ?? NEG
      return (av - bv) * dir
    })
  }, [rows, sortKey, sortDir])

  const clickHeader = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-semibold text-gray-900">
        Все товары за период ({fmtNum(rows.length)})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => clickHeader(c.key)}
                  className={`px-4 py-2 font-medium cursor-pointer select-none hover:text-gray-800 ${c.align === 'right' ? 'text-right' : ''} whitespace-nowrap`}
                >
                  {c.label}
                  {sortKey === c.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="px-4 py-6 text-center text-gray-400 text-sm">
                  Нет данных за выбранный период
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.productId || r.name} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  {cols.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2 ${c.align === 'right' ? 'text-right tabular-nums whitespace-nowrap' : ''} ${c.cls?.(r) || 'text-gray-700'}`}
                    >
                      {c.key === 'name' ? <ProductNameLink row={r} /> : c.render(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function Empty({ text = 'Нет данных за выбранный период' }: { text?: string }) {
  return <div className="py-10 text-center text-gray-400 text-sm">{text}</div>
}

// Русская плюрализация (1 товар / 2 товара / 5 товаров).
function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

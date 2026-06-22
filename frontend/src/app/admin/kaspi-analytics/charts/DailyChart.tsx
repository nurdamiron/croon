'use client'

// Дневная динамика. mode='revenue' — столбцы выручки; mode='margin' — прибыль (₸, столбцы)
// + маржа (%, линия на второй оси). Грузится только на клиенте (next/dynamic ssr:false).
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const ADMIN_INDIGO = '#5c6ac4'
const BLUE = '#3b82f6'
const GREEN = '#22c55e'

export type DailyItem = {
  date: string
  revenue: number
  profit: number
  marginPct: number | null
}

// '2026-05-24' → '24.05'
function shortDay(d: string) {
  const [, m, day] = d.split('-')
  return `${day}.${m}`
}

export default function DailyChart({
  items,
  mode,
}: {
  items: DailyItem[]
  mode: 'revenue' | 'margin' | 'combined'
}) {
  const cats = items.map((i) => shortDay(i.date))
  const fmtT = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₸`

  // Комбинированный: Выручка + Прибыль (столбцы) + Маржа % (линия, 2-я ось).
  if (mode === 'combined') {
    const option = {
      grid: { left: 8, right: 8, top: 32, bottom: 24, containLabel: true },
      legend: { data: ['Выручка', 'Прибыль', 'Маржа %'], top: 0, textStyle: { fontSize: 11, color: '#6b7280' } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any[]) => {
          const lines = params.map((p) =>
            p.seriesName === 'Маржа %'
              ? `${p.marker} ${p.seriesName}: <b>${p.value == null ? '—' : p.value.toFixed(1) + '%'}</b>`
              : `${p.marker} ${p.seriesName}: <b>${fmtT(p.value)}</b>`
          )
          return `${params[0].axisValue}<br/>${lines.join('<br/>')}`
        },
      },
      xAxis: { type: 'category', data: cats, axisLabel: { color: '#9ca3af', fontSize: 10 } },
      yAxis: [
        {
          type: 'value',
          name: '₸',
          nameTextStyle: { color: '#9ca3af', fontSize: 10 },
          axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`) },
          splitLine: { lineStyle: { color: '#f3f4f6' } },
        },
        {
          type: 'value',
          name: '%',
          nameTextStyle: { color: '#9ca3af', fontSize: 10 },
          axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v: number) => `${v}%` },
          splitLine: { show: false },
        },
      ],
      series: [
        { name: 'Выручка', type: 'bar', data: items.map((i) => Math.round(i.revenue)), itemStyle: { color: BLUE, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 22 },
        { name: 'Прибыль', type: 'bar', data: items.map((i) => Math.round(i.profit)), itemStyle: { color: ADMIN_INDIGO, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 22 },
        { name: 'Маржа %', type: 'line', yAxisIndex: 1, data: items.map((i) => (i.marginPct == null ? null : Math.round(i.marginPct * 10) / 10)), smooth: true, symbol: 'circle', symbolSize: 5, itemStyle: { color: GREEN }, lineStyle: { color: GREEN, width: 2 }, connectNulls: true },
      ],
    }
    return <ReactECharts echarts={echarts} option={option} style={{ height: 340, width: '100%' }} notMerge lazyUpdate />
  }

  const option =
    mode === 'revenue'
      ? {
          grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
          tooltip: { trigger: 'axis', valueFormatter: (v: number) => fmtT(v) },
          xAxis: { type: 'category', data: cats, axisLabel: { color: '#9ca3af', fontSize: 10 } },
          yAxis: {
            type: 'value',
            axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`) },
            splitLine: { lineStyle: { color: '#f3f4f6' } },
          },
          series: [{ type: 'bar', data: items.map((i) => i.revenue), itemStyle: { color: ADMIN_INDIGO, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 28 }],
        }
      : {
          grid: { left: 8, right: 8, top: 28, bottom: 24, containLabel: true },
          legend: { data: ['Прибыль', 'Маржа %'], top: 0, textStyle: { fontSize: 11, color: '#6b7280' } },
          tooltip: {
            trigger: 'axis',
            formatter: (params: any[]) => {
              const lines = params.map((p) =>
                p.seriesName === 'Маржа %'
                  ? `${p.marker} ${p.seriesName}: <b>${p.value == null ? '—' : p.value.toFixed(1) + '%'}</b>`
                  : `${p.marker} ${p.seriesName}: <b>${fmtT(p.value)}</b>`
              )
              return `${params[0].axisValue}<br/>${lines.join('<br/>')}`
            },
          },
          xAxis: { type: 'category', data: cats, axisLabel: { color: '#9ca3af', fontSize: 10 } },
          yAxis: [
            {
              type: 'value',
              axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`) },
              splitLine: { lineStyle: { color: '#f3f4f6' } },
            },
            { type: 'value', axisLabel: { color: '#9ca3af', fontSize: 10, formatter: (v: number) => `${v}%` }, splitLine: { show: false } },
          ],
          series: [
            { name: 'Прибыль', type: 'bar', data: items.map((i) => Math.round(i.profit)), itemStyle: { color: ADMIN_INDIGO, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 28 },
            { name: 'Маржа %', type: 'line', yAxisIndex: 1, data: items.map((i) => (i.marginPct == null ? null : Math.round(i.marginPct * 10) / 10)), smooth: true, itemStyle: { color: GREEN }, lineStyle: { color: GREEN, width: 2 }, connectNulls: true },
          ],
        }

  return <ReactECharts echarts={echarts} option={option} style={{ height: 240, width: '100%' }} notMerge lazyUpdate />
}

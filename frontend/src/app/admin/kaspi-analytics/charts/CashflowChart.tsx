'use client'

// «Денежные поступления» (как у AlgaTop): диверг. столбцы по дням —
// поступление продавцу (вверх) и удержания Kaspi: комиссия + доставка (вниз).
// Грузится только на клиенте (next/dynamic ssr:false).
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const INDIGO = '#5c6ac4'
const AMBER = '#f59e0b'
const PURPLE = '#a78bfa'

export type CashflowItem = {
  date: string
  deposit: number
  commission: number
  delivery: number
}

// '2026-05-24' → '24.05'
function shortDay(d: string) {
  const [, m, day] = d.split('-')
  return `${day}.${m}`
}

export default function CashflowChart({ items }: { items: CashflowItem[] }) {
  const cats = items.map((i) => shortDay(i.date))
  const fmtT = (v: number) => `${Math.round(Math.abs(v)).toLocaleString('ru-RU')} ₸`

  const option = {
    grid: { left: 8, right: 8, top: 28, bottom: 24, containLabel: true },
    legend: { data: ['Денежное поступление', 'Комиссия Kaspi', 'Доставка'], top: 0, textStyle: { fontSize: 11, color: '#6b7280' } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const lines = params.map((p) => `${p.marker} ${p.seriesName}: <b>${fmtT(p.value)}</b>`)
        return `${params[0].axisValue}<br/>${lines.join('<br/>')}`
      },
    },
    xAxis: { type: 'category', data: cats, axisLabel: { color: '#9ca3af', fontSize: 10 } },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        fontSize: 10,
        formatter: (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`),
      },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
    },
    series: [
      { name: 'Денежное поступление', type: 'bar', data: items.map((i) => Math.round(i.deposit)), itemStyle: { color: INDIGO, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 26 },
      { name: 'Комиссия Kaspi', type: 'bar', data: items.map((i) => -Math.round(i.commission)), itemStyle: { color: AMBER, borderRadius: [0, 0, 3, 3] }, barMaxWidth: 26 },
      { name: 'Доставка', type: 'bar', data: items.map((i) => -Math.round(i.delivery)), itemStyle: { color: PURPLE, borderRadius: [0, 0, 3, 3] }, barMaxWidth: 26 },
    ],
  }

  return <ReactECharts echarts={echarts} option={option} style={{ height: 300, width: '100%' }} notMerge lazyUpdate />
}

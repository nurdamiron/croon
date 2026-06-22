'use client'

// Донат «Структура выручки» (как у AlgaTop): из чего складывается выручка —
// закуп / комиссия Kaspi / Kaspi Pay / доставка / налог / чистая прибыль.
// Грузится только на клиенте (next/dynamic ssr:false).
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

export type RevenueStructureProps = {
  cost: number
  commission: number
  pay: number
  delivery: number
  tax: number
  netProfit: number
}

export default function RevenueStructure({ s }: { s: RevenueStructureProps }) {
  const data = [
    { name: 'Закупочная стоимость', value: Math.max(0, s.cost), itemStyle: { color: '#64748b' } },
    { name: 'Комиссия Kaspi', value: Math.max(0, s.commission), itemStyle: { color: '#f59e0b' } },
    { name: 'Комиссия Kaspi Pay', value: Math.max(0, s.pay), itemStyle: { color: '#fbbf24' } },
    { name: 'Доставка', value: Math.max(0, s.delivery), itemStyle: { color: '#a78bfa' } },
    { name: 'Налоги', value: Math.max(0, s.tax), itemStyle: { color: '#f87171' } },
    { name: 'Чистая прибыль', value: Math.max(0, s.netProfit), itemStyle: { color: '#22c55e' } },
  ].filter((d) => d.value > 0)

  const fmtT = (v: number) => `${Math.round(v).toLocaleString('ru-RU')} ₸`

  const option = {
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}: <b>${fmtT(p.value)}</b> (${p.percent}%)` },
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { fontSize: 12, color: '#374151' }, itemWidth: 12, itemHeight: 12 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['32%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data,
      },
    ],
  }

  return <ReactECharts echarts={echarts} option={option} style={{ height: 280, width: '100%' }} notMerge lazyUpdate />
}

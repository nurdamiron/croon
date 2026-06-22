'use client'

// Донат «Статусы заказов». Грузится только на клиенте (next/dynamic ssr:false).
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

export type StatusCountsProps = {
  delivered: number
  inProgress: number
  cancelled: number
  returned: number
}

export default function StatusDonut({ counts }: { counts: StatusCountsProps }) {
  const data = [
    { name: 'Доставленные', value: counts.delivered, itemStyle: { color: '#22c55e' } },
    { name: 'Новые и на доставке', value: counts.inProgress, itemStyle: { color: '#3b82f6' } },
    { name: 'Отменённые', value: counts.cancelled, itemStyle: { color: '#ef4444' } },
    { name: 'Возвращённые', value: counts.returned, itemStyle: { color: '#9ca3af' } },
  ].filter((d) => d.value > 0)

  const option = {
    tooltip: { trigger: 'item', formatter: '{b}: <b>{c}</b> ({d}%)' },
    legend: { orient: 'vertical', right: 0, top: 'center', textStyle: { fontSize: 12, color: '#374151' }, itemWidth: 12, itemHeight: 12 },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data,
      },
    ],
  }

  return <ReactECharts echarts={echarts} option={option} style={{ height: 260, width: '100%' }} notMerge lazyUpdate />
}

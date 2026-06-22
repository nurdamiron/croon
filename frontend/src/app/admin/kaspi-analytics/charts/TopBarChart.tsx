'use client'

// Горизонтальный бар-чарт ТОП-товаров (как у AlgaTop). ECharts, грузится только на клиенте
// (подключается из KaspiAnalyticsClient через next/dynamic ssr:false).
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer])

const ADMIN_INDIGO = '#5c6ac4'

export type TopBarItem = { name: string; value: number }

function truncate(s: string, n = 38) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export default function TopBarChart({
  items,
  unit, // '₸' | '%'
}: {
  items: TopBarItem[]
  unit: '₸' | '%'
}) {
  // ECharts рисует категории снизу вверх — переворачиваем, чтобы топ был сверху.
  const ordered = [...items].reverse()
  const fmt = (v: number) =>
    unit === '%'
      ? `${v.toFixed(1)} %`
      : `${Math.round(v).toLocaleString('ru-RU')} ₸`

  const option = {
    grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params
        return `${p.name}<br/><b>${fmt(p.value)}</b>`
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        fontSize: 10,
        formatter: (v: number) =>
          unit === '%' ? `${v}%` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`,
      },
      splitLine: { lineStyle: { color: '#f3f4f6' } },
    },
    yAxis: {
      type: 'category',
      data: ordered.map((i) => truncate(i.name)),
      axisLabel: { color: '#374151', fontSize: 11 },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e5e7eb' } },
    },
    series: [
      {
        type: 'bar',
        data: ordered.map((i) => i.value),
        itemStyle: { color: ADMIN_INDIGO, borderRadius: [0, 4, 4, 0] },
        barMaxWidth: 18,
        label: {
          show: true,
          position: 'right',
          color: '#111827',
          fontSize: 11,
          fontWeight: 600,
          formatter: (p: any) => fmt(p.value),
        },
      },
    ],
  }

  const height = Math.max(160, ordered.length * 30 + 24)

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      style={{ height, width: '100%' }}
      notMerge
      lazyUpdate
    />
  )
}

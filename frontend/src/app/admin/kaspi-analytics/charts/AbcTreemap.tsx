'use client'

// ABC-treemap по прибыльности (как у AlgaTop). Группы A/B/C цветами: зелёный/жёлтый/красный.
// ECharts treemap, грузится только на клиенте (next/dynamic ssr:false из KaspiAnalyticsClient).
import ReactECharts from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { TreemapChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([TreemapChart, TooltipComponent, CanvasRenderer])

const COLORS: Record<string, string> = { A: '#22c55e', B: '#f59e0b', C: '#ef4444' }

export type AbcTreemapBucket = {
  bucket: 'A' | 'B' | 'C'
  sharePct: number
  products: { name: string; profit: number | null }[]
}

export default function AbcTreemap({ buckets }: { buckets: AbcTreemapBucket[] }) {
  const data = buckets
    .filter((b) => b.products.length > 0)
    .map((b) => ({
      name: `${b.bucket} · ${b.sharePct.toFixed(0)}%`,
      itemStyle: { color: COLORS[b.bucket], gapWidth: 2, borderColor: '#fff' },
      children: b.products.map((p) => ({
        name: p.name,
        value: Math.max(0, p.profit || 0),
      })),
    }))

  const option = {
    tooltip: {
      formatter: (info: any) => {
        const v = info.value
        const val = typeof v === 'number' ? `${Math.round(v).toLocaleString('ru-RU')} ₸` : ''
        return `${info.name}${val ? `<br/><b>${val}</b> прибыль` : ''}`
      },
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%',
        height: '100%',
        levels: [
          // Уровень групп A/B/C — крупные заголовки.
          {
            itemStyle: { gapWidth: 4, borderWidth: 0 },
            upperLabel: {
              show: true,
              height: 22,
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
            },
          },
          // Уровень товаров.
          {
            colorSaturation: [0.35, 0.55],
            itemStyle: { gapWidth: 1, borderColorSaturation: 0.6 },
          },
        ],
        label: { show: true, color: '#fff', fontSize: 10, overflow: 'truncate' },
        upperLabel: { show: true },
        data,
      },
    ],
  }

  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      style={{ height: 320, width: '100%' }}
      notMerge
      lazyUpdate
    />
  )
}

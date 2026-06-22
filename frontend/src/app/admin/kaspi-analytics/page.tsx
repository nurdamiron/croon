import { requireAdmin } from '@/lib/admin'
import { computeKaspiAnalytics, resolveRange, earliestSaleDate, clampRangeToFirstSale } from '@/lib/kaspi-analytics'
import { computeChannelComparison } from '@/lib/channel-comparison'
import KaspiAnalyticsClient from './KaspiAnalyticsClient'

export const dynamic = 'force-dynamic'

export default async function KaspiAnalyticsPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string }
}) {
  await requireAdmin()

  const resolved = resolveRange(searchParams.from, searchParams.to)
  // «Всё время» (и любой слишком ранний from) поджимаем к первой реальной продаже,
  // чтобы график «по дням» не начинался с пустых лет.
  const earliest = await earliestSaleDate()
  const { from, fromStr } = clampRangeToFirstSale(resolved.from, resolved.fromStr, earliest)
  const { to, toStr } = resolved
  // бизнес-день первой продажи (для пресета «Всё время» в UI)
  const firstSaleStr = earliest
    ? new Date(earliest.getTime() + 5 * 3600_000 + 7 * 3600_000).toISOString().slice(0, 10)
    : fromStr
  const [data, channels] = await Promise.all([
    computeKaspiAnalytics({ from, to }),
    computeChannelComparison({ from, to }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kaspi аналитика</h1>
        <p className="text-sm text-gray-500 mt-1">
          Продажи считаются <b>сразу при поступлении заказа</b>, отмены и возвраты вычитаются — заработок
          виден в реальном времени. <b>День начинается в 17:00</b>: заказы до 17:00 — сегодня, с 17:00 —
          уже следующий день (как рабочий день Kaspi). Прибыль = выручка − себестоимость − комиссия Kaspi −
          Kaspi Pay − доставка − налог (ставки в{' '}
          <a href="/admin/kaspi" className="text-admin hover:underline">Kaspi</a>).
        </p>
      </div>
      <KaspiAnalyticsClient data={data} channels={channels} fromStr={fromStr} toStr={toStr} firstSaleStr={firstSaleStr} />
    </div>
  )
}

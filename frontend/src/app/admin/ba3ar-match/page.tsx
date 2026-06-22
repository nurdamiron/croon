import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import Ba3arMatchClient from './Ba3arMatchClient'

export const dynamic = 'force-dynamic'

export default async function Ba3arMatchPage({ searchParams }: { searchParams: { tab?: string; status?: string } }) {
  await requireAdmin()
  const tab = searchParams.tab || 'matched'   // matched | only_ba3ar | only_alash
  const statusFilter = searchParams.status     // для matched: pending|confirmed|rejected

  // Вкладка «Только ba3ar» = настоящие only_ba3ar + отклонённые матчи
  // (rejected matched — товар ba3ar остался без пары, ищем вручную) +
  // matched со ВРУЧНУЮ привязанным товаром (manual_alashId).
  let where: any
  if (tab === 'only_ba3ar') {
    // ждут ручной привязки: only_ba3ar + rejected, КРОМЕ помеченных «нет в Alash»
    where = {
      status: { not: 'not_in_alash' },
      OR: [{ kind: 'only_ba3ar' }, { kind: 'matched', status: 'rejected' }],
    }
  } else if (tab === 'not_in_alash') {
    where = { status: 'not_in_alash' }
  } else {
    where = { kind: tab }
    if (tab === 'matched' && statusFilter) where.status = statusFilter
    if (tab === 'matched' && !statusFilter) where.status = { in: ['pending', 'confirmed'] }
  }

  const rows = await prisma.ba3arMatch.findMany({
    where,
    orderBy: tab === 'matched' ? [{ status: 'asc' }, { score: 'desc' }] : { ba3arTitle: 'asc' },
    take: 2000,
  })

  // сводка
  const grouped = await prisma.ba3arMatch.groupBy({ by: ['kind', 'status'], _count: { _all: true } })
  const summary: Record<string, Record<string, number>> = {}
  for (const g of grouped) {
    summary[g.kind] = summary[g.kind] || {}
    summary[g.kind][g.status] = g._count._all
  }
  const totalByKind = (k: string) => Object.values(summary[k] || {}).reduce((a, b) => a + b, 0)
  // «нет в Alash» — сумма not_in_alash по всем kind
  const notInAlashCount = Object.values(summary).reduce((a, s) => a + (s['not_in_alash'] || 0), 0)
  // «Только ba3ar» к привязке = (only_ba3ar + rejected) минус помеченные not_in_alash
  const onlyBa3arActive = totalByKind('only_ba3ar') + (summary.matched?.rejected || 0) - notInAlashCount

  const data = rows.map(r => ({
    id: r.id, kind: r.kind, status: r.status, score: r.score, stockQty: r.stockQty,
    ba3arSku: r.ba3arSku, ba3arTitle: r.ba3arTitle, ba3arImage: r.ba3arImage, ba3arPrice: r.ba3arPrice, ba3arDesc: r.ba3arDesc,
    alashId: r.alashId, alashName: r.alashName, alashImage: r.alashImage, alashPrice: r.alashPrice, alashDesc: r.alashDesc,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ba3ar ↔ Alash — сопоставление каталогов</h1>
        <p className="text-sm text-gray-500 mt-1">
          Проверьте пары товаров. «Да» — связать (артикул ba3ar = товар Alash), «Нет» — не совпадает.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase">Сматчилось</div>
          <div className="text-2xl font-bold mt-1 text-green-600">{summary.matched?.confirmed || 0}</div>
          <div className="text-xs text-gray-400 mt-1">подтверждено</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase">Нет в Alash</div>
          <div className="text-2xl font-bold mt-1 text-rose-600">{notInAlashCount}</div>
          <div className="text-xs text-gray-400 mt-1">добавить в Alash потом</div>
        </div>
      </div>

      <Ba3arMatchClient rows={data} tab={tab} statusFilter={statusFilter} loaded={totalByKind('matched') + totalByKind('only_ba3ar') + totalByKind('only_alash') > 0} />
    </div>
  )
}

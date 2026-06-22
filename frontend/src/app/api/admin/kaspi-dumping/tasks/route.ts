// Задания для внешнего воркера демпинга.
// offer-view блокируется с дата-центр IP (EC2 → 405/429), поэтому цены конкурентов
// снимает внешний воркер на резидентном IP (см. scripts/kaspi-dumping-worker.mjs).
// Этот эндпоинт отдаёт воркеру список офферов, которые надо проверить: id + PID + город.
//
// Аутентификация секретом (как крон): ?secret=CRON_SECRET или Bearer.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFlag, KASPI_DUMPING_ENABLED } from '@/lib/app-settings'
import { resolvePid } from '@/lib/kaspi-dumping'

export const dynamic = 'force-dynamic'

const CITY = (process.env.KASPI_DUMPING_CITY || '750000000').trim()

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  const qs = req.nextUrl.searchParams.get('secret')
  return auth === `Bearer ${secret}` || qs === secret
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Отметка «воркер опросил tasks» — для индикации в админке, что бот жив.
  await prisma.appSetting.upsert({
    where: { key: 'kaspi_worker_last_seen' },
    create: { key: 'kaspi_worker_last_seen', value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  }).catch(() => {})

  // Режим разведки (?scan=1): отдать ВСЕ активные офферы с PID для снятия
  // позиции/цены лидера — БЕЗ изменения цен и НЕ требуя включённого демпинга.
  // Нужен, чтобы наполнить колонку «Поз.» в админке, ничего не меняя.
  const scan = req.nextUrl.searchParams.get('scan') === '1'

  const enabled = await getFlag(KASPI_DUMPING_ENABLED, false)
  if (!enabled && !scan) return NextResponse.json({ enabled: false, city: CITY, tasks: [] })

  // Порядок проверки:
  //   1) ПРИОРИТЕТНЫЕ (dumpPriority) — товары, где конкуренты активно демпингуют:
  //      их воркер берёт ПЕРВЫМИ в КАЖДОМ прогоне, чтобы не отставать в гонке цен.
  //   2) затем остальные по lastDumpCheckAt asc (давно не проверявшиеся вперёд),
  //      чтобы за 2-3 цикла обойти все офферы по кругу.
  // БЕЗ приоритета горячие товары ждали бы своей очереди по кругу и отставали бы
  // от конкурентов, которые меняют цену каждые пару минут.
  const offers = await prisma.kaspiOffer.findMany({
    where: { active: true },
    orderBy: [
      { dumpPriority: 'desc' },
      { lastDumpCheckAt: { sort: 'asc', nulls: 'first' } },
    ],
    select: {
      id: true, kaspiSku: true, kaspiName: true, stockOverride: true, priceTenge: true,
      product: { select: { totalStock: true, reservedStock: true } },
    },
  })

  // Резолвим PID. Без PID — пропускаем (воркер их не снимет), но помечаем оффер.
  // Кабинетному воркеру нужны sku/model/stock для pricefeed/process — отдаём их сразу.
  const tasks: { offerId: string; pid: string; sku: string; model: string; stock: number; price: number }[] = []
  const noPidIds: string[] = []
  for (const o of offers) {
    const pid = await resolvePid(o.kaspiSku)
    if (pid) {
      const avail = Math.max(0, (o.product?.totalStock ?? 0) - (o.product?.reservedStock ?? 0))
      const stock = o.stockOverride != null ? Math.max(0, o.stockOverride) : avail
      tasks.push({ offerId: o.id, pid, sku: o.kaspiSku, model: o.kaspiName || '', stock, price: o.priceTenge })
    } else noPidIds.push(o.id)
  }
  if (noPidIds.length) {
    await prisma.kaspiOffer.updateMany({
      where: { id: { in: noPidIds } },
      data: { lastDumpCheckAt: new Date(), lastDumpError: 'нет PID' },
    }).catch(() => {})
  }

  return NextResponse.json({ enabled: true, scan, city: CITY, tasks, noPid: noPidIds.length })
}

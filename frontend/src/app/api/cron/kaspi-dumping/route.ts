// Cron-эндпоинт демпинга (EC2 по расписанию). Проходит по активным офферам с
// включённым автоснижением/автоповышением, снимает цены конкурентов и применяет
// новую цену. Реально меняет цену (не dry-run).
//
// Защита секретом: Authorization: Bearer <CRON_SECRET> или ?secret=<CRON_SECRET>.
// Глобальный аварийный стоп: AppSetting KASPI_DUMPING_ENABLED=false → ничего не делает.
//
// ВАЖНО (docs/kaspi-dumping.md §1.6.2): Kaspi перечитывает наш фид раз в ~60 мин,
// поэтому запускать чаще раза в ~15-30 мин бессмысленно — цена всё равно применится
// в течение часа-полутора.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFlag, KASPI_DUMPING_ENABLED } from '@/lib/app-settings'
import { runDumpingBatch, type RunOneInput, type DumpingConfig } from '@/lib/kaspi-dumping'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET не задан на сервере' }, { status: 503 })
  }
  const auth = request.headers.get('authorization')
  const qsSecret = request.nextUrl.searchParams.get('secret')
  if (!(auth === `Bearer ${secret}` || qsSecret === secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Глобальный аварийный тумблер (по умолчанию ВЫКЛ — демпинг включается осознанно).
  const enabled = await getFlag(KASPI_DUMPING_ENABLED, false)
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'KASPI_DUMPING_ENABLED=false' })
  }

  // dryRun через query (?dry=1) — для безопасной проверки крона на проде.
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  // Кандидаты: ВСЕ активные офферы (без фильтра по тумблерам). Автопилот гонит всех:
  //   один в карточке → движок ставит сайт×1.41 (allowAnyway, тумблеры не нужны);
  //   с конкурентом + autoDownscale + floor → демпинг;
  //   с конкурентом, демпинг выкл → только метрики (computeTargetPrice вернёт
  //   skipped/unchanged — цену не тронет). Так одиночные не выпадают из обхода.
  const offers = await prisma.kaspiOffer.findMany({
    where: { active: true },
    select: {
      id: true, productId: true, kaspiSku: true, priceTenge: true,
      autoDownscale: true, autoUpscale: true, minPriceTenge: true, maxPriceTenge: true,
      dumpingStep: true, strategy: true, ignoreMerchants: true,
      product: { select: { price: true, costPrice: true } },
    },
  })

  // Множитель комиссии Kaspi — для маржинальной цены «один в карточке» (сайт×mult).
  const { getKaspiCommissionMult } = await import('@/lib/app-settings')
  const commissionMult = await getKaspiCommissionMult()

  const inputs: RunOneInput[] = offers.map((o) => {
    const config: DumpingConfig = {
      currentPrice: o.priceTenge,
      autoDownscale: o.autoDownscale,
      autoUpscale: o.autoUpscale,
      minPriceTenge: o.minPriceTenge,
      maxPriceTenge: o.maxPriceTenge,
      dumpingStep: o.dumpingStep,
      strategy: o.strategy,
      ignoreMerchants: o.ignoreMerchants,
      sitePrice: o.product?.price ?? null,   // цена на сайте → ×mult когда нет конкурентов
      costPrice: o.product?.costPrice ?? null, // закуп → floor одиночного (не ниже costPrice×mult)
      commissionMult,
    }
    return { offerId: o.id, productId: o.productId, kaspiSku: o.kaspiSku, config }
  })

  const summary = await runDumpingBatch(inputs, { dryRun, delayMs: 600 })

  // В ответе не тащим весь results (может быть большим) — только сводку + ошибки.
  const errors = summary.results
    .filter((r) => r.status === 'fetch_error')
    .slice(0, 20)
    .map((r) => ({ offerId: r.offerId, pid: r.pid, error: r.error }))

  return NextResponse.json({
    ok: true,
    dryRun,
    candidates: inputs.length,
    checked: summary.checked,
    changed: summary.changed,
    noPid: summary.noPid,
    fetchErrors: summary.errors,
    errorsSample: errors,
  })
}

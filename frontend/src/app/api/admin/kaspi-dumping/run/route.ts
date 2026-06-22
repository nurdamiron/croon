// Ручной прогон демпинга по выбранным офферам («Проверить сейчас»).
// Собирает конфиг демпинга из БД и гоняет движок. По умолчанию dryRun=false
// (реально меняет цену — как и крон). Передать {"dryRun":true} чтобы только снять
// метрики конкурентов без смены цены — для безопасной разведки с прода.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runDumpingBatch, type RunOneInput, type DumpingConfig } from '@/lib/kaspi-dumping'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids : []
  const dryRun = !!body.dryRun
  if (!ids.length) return NextResponse.json({ error: 'ids пуст' }, { status: 400 })

  const offers = await prisma.kaspiOffer.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, productId: true, kaspiSku: true, priceTenge: true,
      autoDownscale: true, autoUpscale: true, minPriceTenge: true, maxPriceTenge: true,
      dumpingStep: true, strategy: true, ignoreMerchants: true,
    },
  })

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
    }
    return { offerId: o.id, productId: o.productId, kaspiSku: o.kaspiSku, config }
  })

  const summary = await runDumpingBatch(inputs, { dryRun, delayMs: 600 })
  return NextResponse.json({ ok: true, dryRun, ...summary })
}

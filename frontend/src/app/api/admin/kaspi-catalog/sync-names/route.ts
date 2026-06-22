// Приём карты реальных названий карточек Kaspi (masterTitle) от внешнего источника
// (браузер с кабинетной сессией / воркер). Обновляет kaspiName в офферах и name в
// каталожных записях по артикулу (kaspiSku == sku из кабинета).
//
// Аутентификация: ?secret=CRON_SECRET или Bearer (как cron/ingest).
// Тело: { names: { "<артикул>": "<название>" , ... }, apply?: boolean }
//   apply=false (по умолчанию) → только превью (сколько совпало, примеры), не пишет.
//   apply=true → реально обновляет.
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Секрет принимаем из заголовка Authorization: Bearer <secret> ИЛИ из тела POST
// (поле secret). НЕ из query-string — URL попадает в логи nginx/прокси (security).
function authed(req: NextRequest, bodySecret?: unknown): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${secret}` || bodySecret === secret
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (!authed(req, body.secret)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const names: Record<string, string> = body.names && typeof body.names === 'object' ? body.names : {}
  const apply = body.apply === true
  const keys = Object.keys(names)
  if (!keys.length) return NextResponse.json({ error: 'names пуст' }, { status: 400 })

  // Каталожные записи по артикулу (kaspiSku).
  const cats = await prisma.kaspiCatalogEntry.findMany({
    where: { kaspiSku: { in: keys } },
    select: { id: true, kaspiSku: true, name: true },
  })
  // Офферы по артикулу.
  const offers = await prisma.kaspiOffer.findMany({
    where: { kaspiSku: { in: keys } },
    select: { id: true, kaspiSku: true, kaspiName: true },
  })

  let catChanged = 0, offerChanged = 0
  const samples: any[] = []

  if (!apply) {
    // Превью: сколько реально изменится + примеры
    for (const c of cats) {
      const nn = (names[c.kaspiSku] || '').trim()
      if (nn && nn !== c.name) {
        catChanged++
        if (samples.length < 15) samples.push({ sku: c.kaspiSku, from: c.name, to: nn })
      }
    }
    for (const o of offers) {
      const nn = (names[o.kaspiSku] || '').trim()
      if (nn && nn !== o.kaspiName) offerChanged++
    }
    return NextResponse.json({ ok: true, apply: false, matchedCatalog: cats.length, matchedOffers: offers.length, catWouldChange: catChanged, offerWouldChange: offerChanged, samples })
  }

  // Применяем
  for (const c of cats) {
    const nn = (names[c.kaspiSku] || '').trim()
    if (nn && nn !== c.name) {
      await prisma.kaspiCatalogEntry.update({ where: { id: c.id }, data: { name: nn } }).catch(() => {})
      catChanged++
    }
  }
  for (const o of offers) {
    const nn = (names[o.kaspiSku] || '').trim()
    if (nn && nn !== o.kaspiName) {
      await prisma.kaspiOffer.update({ where: { id: o.id }, data: { kaspiName: nn } }).catch(() => {})
      offerChanged++
    }
  }
  return NextResponse.json({ ok: true, apply: true, catalogUpdated: catChanged, offersUpdated: offerChanged })
}

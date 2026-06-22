import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { kaspiLinkFromSku } from '@/lib/kaspi-url'
import { autoLinkKaspiOffersBySku } from '@/lib/kaspi-autolink'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

function parseOffers(xml: string) {
  const offers: Array<{
    kaspiSku: string
    name: string
    brand: string | null
    priceTenge: number
    cityId: string
    storeId: string
    available: boolean
  }> = []
  const offerRe = /<offer\s+sku="([^"]+)">([\s\S]*?)<\/offer>/g
  let m: RegExpExecArray | null
  while ((m = offerRe.exec(xml))) {
    const sku = m[1]
    const body = m[2]
    const brandMatch = body.match(/<brand>([^<]*)<\/brand>/)
    const brand = brandMatch ? brandMatch[1].trim() || null : null
    const modelMatch = body.match(/<model>([^<]*)<\/model>/)
    const name = (modelMatch ? modelMatch[1].trim() : '')
    const availMatch = body.match(/<availability\s+available="([^"]+)"\s+storeId="([^"]+)"/)
    const available = availMatch ? availMatch[1] === 'yes' : false
    const storeId = availMatch ? availMatch[2] : (process.env.KASPI_STORE_ID || '30383258_PP1')
    const cpMatch = body.match(/<cityprice\s+cityId="([^"]+)">\s*([0-9.]+)\s*<\/cityprice>/)
    const cityId = cpMatch ? cpMatch[1] : '750000000'
    const priceTenge = cpMatch ? Math.round(parseFloat(cpMatch[2])) : 0
    // Берём ЛЮБОЙ оффер с SKU (имя/цена опциональны — пустой <model/> или цена 0
    // встречаются в выгрузке; имя подтянется позже из кабинета/привязки). Пустое имя
    // НЕ затирает существующее в каталоге (см. upsert ниже).
    if (sku) {
      offers.push({ kaspiSku: sku, name, brand, priceTenge, cityId, storeId, available })
    }
  }
  return offers
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const ct = request.headers.get('content-type') || ''
  let xml = ''
  if (ct.includes('application/xml') || ct.includes('text/xml') || ct.includes('text/plain')) {
    xml = await request.text()
  } else if (ct.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    if (file instanceof File) xml = await file.text()
  } else if (ct.includes('application/json')) {
    const body = await request.json()
    xml = body.xml || ''
  }

  if (!xml) {
    return NextResponse.json({ error: 'XML не передан' }, { status: 400 })
  }

  const offers = parseOffers(xml)
  if (offers.length === 0) {
    return NextResponse.json({ error: 'Не удалось разобрать офферы в XML' }, { status: 400 })
  }

  let upserted = 0, linked = 0
  for (const o of offers) {
    // Длинный SKU (цифры_цифры) → сразу PID + рабочая ссылка Kaspi.
    const link = kaspiLinkFromSku(o.kaspiSku)
    // ручные kaspiUrl/PID НЕ перезаписываем (только заполняем пустые)
    const existing = await prisma.kaspiCatalogEntry.findUnique({
      where: { kaspiSku: o.kaspiSku }, select: { kaspiUrl: true, kaspiProductId: true },
    })
    const setPid = link && !existing?.kaspiProductId ? { kaspiProductId: link.pid } : {}
    const setUrl = link && !existing?.kaspiUrl ? { kaspiUrl: link.url } : {}
    if (link && (!existing?.kaspiUrl || !existing?.kaspiProductId)) linked++

    await prisma.kaspiCatalogEntry.upsert({
      where: { kaspiSku: o.kaspiSku },
      update: {
        // пустое имя/цену 0 НЕ затираем — обновляем только если в файле есть значение
        ...(o.name ? { name: o.name } : {}),
        ...(o.brand ? { brand: o.brand } : {}),
        ...(o.priceTenge > 0 ? { priceTenge: o.priceTenge } : {}),
        cityId: o.cityId, storeId: o.storeId, available: o.available,
        ...setPid, ...setUrl,
      },
      create: {
        ...o,
        ...(link ? { kaspiProductId: link.pid, kaspiUrl: link.url } : {}),
      },
    })
    upserted++
  }

  // АВТО-ПРИВЯЗКА: после импорта сразу пытаемся привязать карточки к товарам по
  // артикулу (Product.sku) и создать офферы — чтобы товары сами выкладывались на
  // Kaspi без ручной возни. Что не сматчилось — видно в ответе (autolink.noProduct).
  const autolink = await autoLinkKaspiOffersBySku({ apply: true }).catch((e) => ({
    ok: false, error: (e as Error).message,
  } as any))

  const total = await prisma.kaspiCatalogEntry.count()
  return NextResponse.json({ ok: true, parsed: offers.length, upserted, linkedUrls: linked, totalInDb: total, autolink })
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { kaspiLinkFromSku, kaspiUrlFromPid, extractKaspiPid, isShortKaspiLink } from '@/lib/kaspi-url'
import { resolveKaspiUrl } from '@/lib/kaspi-resolve'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  const data: any = {}

  // Кнопка «Get URL»: построить ссылку из длинного SKU (цифры_цифры).
  if (body.action === 'geturl') {
    const entry = await prisma.kaspiCatalogEntry.findUnique({
      where: { id: params.id }, select: { kaspiSku: true },
    })
    if (!entry) return NextResponse.json({ error: 'Карточка не найдена' }, { status: 404 })
    const link = kaspiLinkFromSku(entry.kaspiSku)
    if (!link) {
      return NextResponse.json({ error: 'SKU не длинный (нет Kaspi product-id). Ссылку построить нельзя — введите вручную.' }, { status: 400 })
    }
    const updated = await prisma.kaspiCatalogEntry.update({
      where: { id: params.id }, data: { kaspiUrl: link.url, kaspiProductId: link.pid },
    })
    // продублируем в оффер, если есть
    await prisma.kaspiOffer.updateMany({ where: { kaspiSku: entry.kaspiSku }, data: { kaspiUrl: link.url } }).catch(() => {})
    return NextResponse.json({ entry: updated, kaspiUrl: link.url, kaspiProductId: link.pid })
  }

  if (body.kaspiUrl !== undefined) {
    const raw = String(body.kaspiUrl || '').trim()
    if (raw) {
      // Принимаем ЛЮБОЙ формат: голый PID / составной SKU / полная ссылка / короткая l.kaspi.kz
      let pid = extractKaspiPid(raw)
      let finalUrl = raw
      if (!pid && isShortKaspiLink(raw)) {
        // короткую ссылку размотать до финального kaspi.kz/shop/p/...-PID/
        finalUrl = await resolveKaspiUrl(raw)
        pid = extractKaspiPid(finalUrl)
      }
      if (!pid) {
        return NextResponse.json({ error: 'Не удалось извлечь Kaspi product-id. Вставьте ссылку kaspi.kz/shop/p/... , короткую l.kaspi.kz/... или сам артикул (6+ цифр).' }, { status: 400 })
      }
      data.kaspiProductId = pid
      // если ввели голый PID/SKU — строим каноническую ссылку; иначе сохраняем как есть
      data.kaspiUrl = /^\d+(_\d+)?$/.test(raw) ? kaspiUrlFromPid(pid) : finalUrl
      // продублируем ссылку в оффер, если есть
      const cur = await prisma.kaspiCatalogEntry.findUnique({ where: { id: params.id }, select: { kaspiSku: true } })
      if (cur?.kaspiSku) {
        await prisma.kaspiOffer.updateMany({ where: { kaspiSku: cur.kaspiSku }, data: { kaspiUrl: data.kaspiUrl } }).catch(() => {})
      }
    } else {
      data.kaspiUrl = null
      data.kaspiProductId = null
    }
  }
  if (body.brand !== undefined) data.brand = body.brand ? String(body.brand) : null
  if (body.name !== undefined && body.name) data.name = String(body.name)
  if (body.priceTenge !== undefined) data.priceTenge = Math.round(Number(body.priceTenge))

  const entry = await prisma.kaspiCatalogEntry.update({ where: { id: params.id }, data })
  return NextResponse.json({ entry })
}

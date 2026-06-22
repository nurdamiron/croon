import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { marked } from 'marked'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// YML-фид товаров Alash для импорта на Satu (POST /products/import_url).
// Формат — Yandex Market Language (EVO/Prom). Доступный остаток = totalStock−reservedStock.
//
// Параметры:
//   ?ids=123,456  — только эти товары (для теста/частичной выгрузки)
//   без ids       — все товары в наличии (для массовой выгрузки)
//
// id оффера = Product.id → станет external_id на Satu (надёжная связь склада).

const S3IMG = 'https://alashed-media.s3.eu-north-1.amazonaws.com'

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
function img(url: string): string {
  if (!url) return ''
  return url.startsWith('http') ? url : `${S3IMG}/${url.replace(/^\//, '')}`
}
function pad(n: number) { return String(n).padStart(2, '0') }

export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get('ids')
  const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean) : null

  // архивные товары в Satu-фид не отдаём (даже если запрошены по ids)
  const where: any = ids ? { id: { in: ids }, archived: false } : { inStock: true, archived: false }
  const products = await prisma.product.findMany({
    where,
    select: {
      id: true, name: true, slug: true, price: true, description: true,
      totalStock: true, reservedStock: true, inStock: true,
      category: { select: { id: true, name: true } },
      images: { select: { url: true }, orderBy: { sortOrder: 'asc' } },
      sku: true, // артикул товара
    },
    take: ids ? undefined : 5000,
  })

  // категории (уникальные, для блока <categories>)
  const cats = new Map<string, string>()
  for (const p of products) if (p.category) cats.set(p.category.id, p.category.name)

  const now = new Date()
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

  const categoriesXml = Array.from(cats.entries())
    .map(([id, name]) => `      <category id="${esc(id)}">${esc(name)}</category>`)
    .join('\n')

  const offersXml = products.map(p => {
    const avail = Math.max(0, p.totalStock - p.reservedStock)
    const available = p.inStock && avail > 0
    const pics = p.images.map(i => `        <picture>${esc(img(i.url))}</picture>`).join('\n')
    // Название Satu обрезает до 110 символов — обрежем сами аккуратно.
    const name = p.name.length > 110 ? p.name.slice(0, 107).trimEnd() + '…' : p.name
    // Описание в Alash — Markdown. Конвертируем в HTML (Satu рендерит HTML).
    let descHtml = ''
    if (p.description) {
      try { descHtml = marked.parse(p.description, { async: false }) as string }
      catch { descHtml = p.description }
    }
    const sku = p.sku || null  // артикул товара
    return `      <offer id="${esc(p.id)}" available="${available}">
        <name>${esc(name)}</name>
        ${sku ? `<vendorCode>${esc(sku)}</vendorCode>` : ''}
        ${sku ? `<article>${esc(sku)}</article>` : ''}
        <price>${Math.round(p.price)}</price>
        <currencyId>KZT</currencyId>
        ${p.category ? `<categoryId>${esc(p.category.id)}</categoryId>` : ''}
        <quantity_in_stock>${avail}</quantity_in_stock>
        <stock_quantity>${avail}</stock_quantity>
${pics}
        <url>https://alash-electronics.kz/product/${esc(p.slug)}</url>
        ${descHtml ? `<description><![CDATA[${descHtml.slice(0, 5000)}]]></description>` : ''}
      </offer>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog date="${date}">
  <shop>
    <name>Alash Electronics</name>
    <company>Alash Electronics</company>
    <url>https://alash-electronics.kz</url>
    <currencies>
      <currency id="KZT" rate="1"/>
    </currencies>
    <categories>
${categoriesXml}
    </categories>
    <offers>
${offersXml}
    </offers>
  </shop>
</yml_catalog>`

  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

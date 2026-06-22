import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

function extractKaspiSku(input: string): string | null {
  const s = input.trim()
  const m = s.match(/-(\d{6,})(?:[/?#]|$)/)
  if (m) return m[1]
  if (/^[\d_]+$/.test(s) && s.length >= 6) return s
  return null
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const skuOrUrl = searchParams.get('sku') || searchParams.get('url') || ''
  const sku = extractKaspiSku(skuOrUrl)
  if (!sku) {
    return NextResponse.json({ error: 'SKU не найден' }, { status: 400 })
  }
  // Поиск:
  // 1. По kaspiProductId (если админ ввёл URL Kaspi для оффера в каталоге)
  // 2. Точное совпадение kaspiSku
  // 3. Prefix-match (для составных SKU вида "<productId>_<cardId>")
  let entry = await prisma.kaspiCatalogEntry.findFirst({ where: { kaspiProductId: sku } })
  if (!entry) entry = await prisma.kaspiCatalogEntry.findUnique({ where: { kaspiSku: sku } })
  if (!entry) {
    entry = await prisma.kaspiCatalogEntry.findFirst({
      where: { kaspiSku: { startsWith: sku + '_' } },
      orderBy: { priceTenge: 'desc' },
    })
  }
  if (!entry) {
    return NextResponse.json({ sku, found: false })
  }
  return NextResponse.json({
    sku,
    matchedSku: entry.kaspiSku,
    found: true,
    name: entry.name,
    brand: entry.brand,
    price: entry.priceTenge,
    storeId: entry.storeId,
    cityId: entry.cityId,
    available: entry.available,
  })
}

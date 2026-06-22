// Авто-привязка каталога Kaspi (KaspiCatalogEntry) к товарам Сайт по АРТИКУЛУ.
//
// Логика: берём карточки каталога, чей kaspiSku — это чистый артикул нашего диапазона
// (например «1490», «953.2»), находим Product с таким же sku и создаём/обновляем
// KaspiOffer. Так после импорта ARCHIVE/ACTIVE.xml товары сами «выкладываются» на Kaspi
// без ручной возни. Дубли защищены: одну Kaspi-карточку (pid до «_») нельзя привязать
// к двум товарам.
//
// Используется:
//   • автоматически в конце импорта каталога (POST /api/admin/kaspi-catalog/import)
//   • вручную кнопкой «Авто-привязка» (POST /api/admin/kaspi-catalog/autolink)

import { prisma } from './prisma'

export type AutolinkResult = {
  ok: boolean
  candidates: number      // карточек-артикулов в каталоге
  linked: number          // создано/обновлено офферов
  created: number
  updated: number
  noProduct: number       // артикул каталога без товара Сайт
  conflicts: number       // карточка уже привязана к другому товару
  conflictSamples: string[]
  noProductSamples: string[] // артикулы без товара (чтобы было видно, что осталось)
  applied: boolean
}

// чистый числовой артикул (наш диапазон), напр. «1490» или «953.2»
function isArticleSku(sku: string): boolean {
  return /^\d+(\.\d+)?$/.test(sku)
}

export async function autoLinkKaspiOffersBySku({ apply }: { apply: boolean }): Promise<AutolinkResult> {
  const entries = await prisma.kaspiCatalogEntry.findMany({
    select: { kaspiSku: true, name: true, brand: true, priceTenge: true, storeId: true, cityId: true, kaspiUrl: true, available: true, kaspiProductId: true },
  })
  const candidates = entries.filter((e) => isArticleSku(e.kaspiSku))
  const skus = candidates.map((e) => e.kaspiSku)

  // товары Сайт по артикулу (только не архивные)
  const products = await prisma.product.findMany({
    where: { sku: { in: skus }, archived: false },
    select: { sku: true, id: true, price: true, name: true },
  })
  const bySku = new Map<string, { id: string; price: number; name: string }>()
  for (const p of products) if (p.sku) bySku.set(p.sku, { id: p.id, price: p.price, name: p.name })

  let created = 0, updated = 0, noProduct = 0, conflicts = 0
  const conflictSamples: string[] = []
  const noProductSamples: string[] = []

  for (const e of candidates) {
    const prod = bySku.get(e.kaspiSku)
    if (!prod) {
      noProduct++
      if (noProductSamples.length < 50) noProductSamples.push(e.kaspiSku)
      continue
    }
    // дубль: одна Kaspi-карточка (pid до «_») не должна висеть на другом товаре
    const kaspiPid = e.kaspiSku.split('_')[0]
    const conflict = await prisma.kaspiOffer.findFirst({
      where: {
        productId: { not: prod.id },
        OR: [{ kaspiSku: kaspiPid }, { kaspiSku: { startsWith: kaspiPid + '_' } }],
      },
      select: { kaspiSku: true, productId: true },
    })
    if (conflict) {
      conflicts++
      if (conflictSamples.length < 30) conflictSamples.push(`${e.kaspiSku} → занят товаром ${conflict.productId}`)
      continue
    }

    if (!apply) { created++; continue } // в dry-run считаем как «будет привязано»

    const price = e.priceTenge > 0 ? e.priceTenge : (prod.price || 0)
    const existing = await prisma.kaspiOffer.findUnique({ where: { kaspiSku: e.kaspiSku }, select: { id: true } })
    await prisma.kaspiOffer.upsert({
      where: { kaspiSku: e.kaspiSku },
      create: {
        kaspiSku: e.kaspiSku,
        productId: prod.id,
        priceTenge: Math.max(1, price),
        kaspiStoreId: e.storeId || '30383258_PP1',
        cityId: e.cityId || '750000000',
        kaspiName: e.name || prod.name || null,
        kaspiBrand: e.brand ?? null,
        kaspiUrl: e.kaspiUrl ?? null,
        active: e.available,
      },
      update: {
        productId: prod.id,
        ...(price > 0 ? { priceTenge: Math.max(1, price) } : {}),
        ...(e.name ? { kaspiName: e.name } : {}),
        ...(e.brand ? { kaspiBrand: e.brand } : {}),
        ...(e.kaspiUrl ? { kaspiUrl: e.kaspiUrl } : {}),
      },
    })
    if (existing) updated++; else created++
  }

  const linked = apply ? created + updated : created
  return {
    ok: true,
    candidates: candidates.length,
    linked,
    created,
    updated,
    noProduct,
    conflicts,
    conflictSamples,
    noProductSamples,
    applied: apply,
  }
}

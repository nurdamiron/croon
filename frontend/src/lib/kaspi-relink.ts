// Привязка «потерянных» позиций Kaspi-заказов (KaspiOrderItem с productId=null) к товарам.
//
// Почему появляются null: позиция импортирована, когда её SKU ещё не было в наших офферах/каталоге
// (товар добавили/привязали позже, или SKU сменился). Авто-ре-привязка в синке срабатывает только
// на следующем синке этих же заказов — а старые заказы уже не пересинкиваются.
//
// Здесь — разовый проход по всем null-позициям:
//   1) по SKU через resolveProductId (оффер → product-id → каталог),
//   2) фолбэк по ТОЧНОМУ названию: kaspiName == Product.name (или == имя варианта).
// Привязка только меняет KaspiOrderItem.productId — на остатки не влияет (это историческая разметка).

import { prisma } from './prisma'
import { resolveProductId } from './kaspi-sync'

// Нормализация имени для сопоставления: нижний регистр, схлопнуть пробелы/разделители.
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export type RelinkResult = {
  ok: boolean
  total: number // всего null-позиций
  bySku: number // привязано по SKU
  byName: number // привязано по названию
  stillNull: number // осталось без привязки
  applied: boolean // false = dry-run
  samples: { kaspiSku: string; kaspiName: string | null; matchedBy: 'sku' | 'name' | null; productName?: string }[]
}

export async function relinkKaspiItems({ apply }: { apply: boolean }): Promise<RelinkResult> {
  // Все позиции без привязки.
  const items = await prisma.kaspiOrderItem.findMany({
    where: { productId: null },
    select: { id: true, kaspiSku: true, kaspiName: true },
  })

  // Индекс товаров по нормализованному имени (Product.name + имена вариантов).
  // Строим один раз. Если на имя приходится >1 товар — пропускаем (неоднозначно).
  const nameIndex = new Map<string, string | null>() // normName → productId | null(ambiguous)
  const addName = (name: string | null | undefined, productId: string) => {
    if (!name) return
    const key = normName(name)
    if (!key) return
    if (nameIndex.has(key)) {
      if (nameIndex.get(key) !== productId) nameIndex.set(key, null) // конфликт → неоднозначно
    } else {
      nameIndex.set(key, productId)
    }
  }
  const products = await prisma.product.findMany({
    select: { id: true, name: true },
  })
  for (const p of products) {
    addName(p.name, p.id)
  }

  let bySku = 0
  let byName = 0
  let stillNull = 0
  const updates: { id: string; productId: string }[] = []
  const samples: RelinkResult['samples'] = []
  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  for (const it of items) {
    let pid: string | null = null
    let matchedBy: 'sku' | 'name' | null = null

    if (it.kaspiSku) {
      pid = await resolveProductId(it.kaspiSku)
      if (pid) matchedBy = 'sku'
    }
    if (!pid && it.kaspiName) {
      const hit = nameIndex.get(normName(it.kaspiName))
      if (hit) { pid = hit; matchedBy = 'name' }
    }

    if (pid) {
      if (matchedBy === 'sku') bySku++
      else byName++
      updates.push({ id: it.id, productId: pid })
    } else {
      stillNull++
    }

    if (samples.length < 40) {
      samples.push({
        kaspiSku: it.kaspiSku,
        kaspiName: it.kaspiName,
        matchedBy,
        productName: pid ? productNameById.get(pid) : undefined,
      })
    }
  }

  if (apply && updates.length) {
    // Батчами, чтобы не держать огромную транзакцию.
    const CHUNK = 100
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK)
      await prisma.$transaction(
        slice.map((u) => prisma.kaspiOrderItem.update({ where: { id: u.id }, data: { productId: u.productId } }))
      )
    }
  }

  return {
    ok: true,
    total: items.length,
    bySku,
    byName,
    stillNull,
    applied: apply,
    samples,
  }
}

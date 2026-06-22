// Синхронизация Kaspi-заказов с локальной БД + управление остатками (бронь/списание).
//
// Жизненный цикл остатков (по KaspiOrder.status), идемпотентно через stockApplied:
//   APPROVED_BY_BANK / ACCEPTED_BY_MERCHANT → "reserved"  (reservedStock += qty)
//   COMPLETED                               → "completed" (totalStock -= qty; reserved -= qty)
//   CANCELLED / CANCELLING / RETURNED /
//   RETURN_ACCEPTED_BY_MERCHANT /
//   KASPI_DELIVERY_RETURN_REQUESTED         → "released"  (reserved -= qty)
//   NEW (ещё не оплачен)                     → ничего
//
// Доступный остаток для фида и сайта = totalStock − reservedStock.
// stockApplied хранит уже применённый эффект, поэтому повторный синк того же
// заказа не задваивает бронь/списание; меняем остатки только при переходе.

import { prisma } from '@/lib/prisma'
import { mirrorSingleVariantStock } from '@/lib/variant-stock'
import {
  getAllOrders,
  getOrderEntries,
  getEntryProduct,
  isKaspiConfigured,
  type KaspiOrderData,
  type KaspiOrderState,
  type KaspiOrderStatus,
} from '@/lib/kaspi-api'

const ALL_STATES: KaspiOrderState[] = [
  'NEW', 'SIGN_REQUIRED', 'PICKUP', 'DELIVERY', 'KASPI_DELIVERY', 'ARCHIVE',
]

type StockEffect = 'none' | 'reserved' | 'completed' | 'released'

// Желаемый эффект на остатки по статусу заказа Kaspi.
function desiredEffect(status: KaspiOrderStatus): StockEffect {
  switch (status) {
    case 'APPROVED_BY_BANK':
    case 'ACCEPTED_BY_MERCHANT':
      return 'reserved'
    case 'COMPLETED':
      return 'completed'
    case 'CANCELLED':
    case 'CANCELLING':
    case 'RETURNED':
    case 'RETURN_ACCEPTED_BY_MERCHANT':
    case 'KASPI_DELIVERY_RETURN_REQUESTED':
      return 'released'
    default:
      return 'none'
  }
}

const MS_14_DAYS = 14 * 24 * 60 * 60 * 1000

// Разбить период на чанки ≤14 дней (лимит Kaspi на диапазон дат заказов).
function splitRange(fromMs: number, toMs: number): Array<[number, number]> {
  const chunks: Array<[number, number]> = []
  let start = fromMs
  while (start < toMs) {
    const end = Math.min(start + MS_14_DAYS, toMs)
    chunks.push([start, end])
    start = end
  }
  return chunks
}

// Сопоставить merchant SKU позиции с нашим Product.
// Сначала по KaspiOffer.kaspiSku, затем по KaspiCatalogEntry (kaspiSku/kaspiProductId).
export async function resolveProductId(merchantSku: string): Promise<string | null> {
  // Kaspi в позициях заказа отдаёт kaspi PRODUCT ID (например "113363255"),
  // а KaspiOffer хранится под merchant SKU из ACTIVE.xml ("113363255_469963102").
  // Связь между ними — в KaspiCatalogEntry (kaspiProductId ↔ kaspiSku).
  // Перебираем все варианты от точного к косвенному.

  // 1) прямое совпадение оффера по присланному ключу
  const direct = await prisma.kaspiOffer.findFirst({
    where: { kaspiSku: merchantSku },
    select: { productId: true },
  })
  if (direct?.productId) return direct.productId

  // 2) оффер по голому product-id (если прислан составной SKU "<pid>_<x>")
  const pid = merchantSku.split('_')[0]
  if (pid && pid !== merchantSku) {
    const byPid = await prisma.kaspiOffer.findFirst({
      where: { kaspiSku: pid },
      select: { productId: true },
    })
    if (byPid?.productId) return byPid.productId
  }

  // 3) через каталог: присланный ключ — product id или sku каталожной записи.
  //    Берём её merchant SKU и ищем оффер уже по нему.
  const cat = await prisma.kaspiCatalogEntry.findFirst({
    where: { OR: [{ kaspiProductId: merchantSku }, { kaspiProductId: pid }, { kaspiSku: merchantSku }] },
    select: { kaspiSku: true, kaspiProductId: true },
  })
  if (cat) {
    const candidates = [cat.kaspiSku, cat.kaspiProductId].filter((x): x is string => !!x)
    const offerViaCatalog = await prisma.kaspiOffer.findFirst({
      where: { kaspiSku: { in: candidates } },
      select: { productId: true },
    })
    if (offerViaCatalog?.productId) return offerViaCatalog.productId
  }

  return null
}

export interface SyncResult {
  ok: boolean
  fetched: number
  upserted: number
  reserved: number
  completed: number
  released: number
  unmatchedItems: number
  errors: string[]
}

// Применить переход эффекта остатков для одной позиции в транзакции.
// from → to. Меняем reservedStock/totalStock только на дельту перехода.
async function applyItemTransition(
  productId: string,
  qty: number,
  from: StockEffect,
  to: StockEffect,
) {
  if (from === to) return
  // Нормализуем переходы в две операции над reserved/total.
  // reserved: +qty при входе в reserved; -qty при выходе из reserved (в completed/released)
  // total: -qty только при входе в completed
  const ops: Array<{ field: 'reservedStock' | 'totalStock'; delta: number }> = []

  const wasReserved = from === 'reserved'
  const willReserved = to === 'reserved'
  if (!wasReserved && willReserved) ops.push({ field: 'reservedStock', delta: qty })
  if (wasReserved && !willReserved) ops.push({ field: 'reservedStock', delta: -qty })

  // списание totalStock при переходе в completed (из любого состояния)
  if (to === 'completed' && from !== 'completed') ops.push({ field: 'totalStock', delta: -qty })
  // откат списания, если заказ из completed ушёл в released (возврат после выдачи)
  if (from === 'completed' && to === 'released') ops.push({ field: 'totalStock', delta: qty })

  for (const op of ops) {
    if (op.field === 'reservedStock') {
      // reservedStock не уходит ниже 0; inStock = доступный остаток > 0
      await prisma.$executeRaw`UPDATE "Product" SET "reservedStock" = GREATEST(0, "reservedStock" + ${op.delta}), "inStock" = (GREATEST(0, "reservedStock" + ${op.delta}) < "totalStock") WHERE id = ${productId}`
    } else {
      await prisma.$executeRaw`UPDATE "Product" SET "totalStock" = GREATEST(0, "totalStock" + ${op.delta}), "inStock" = ((GREATEST(0, "totalStock" + ${op.delta}) - "reservedStock") > 0) WHERE id = ${productId}`
    }
  }
  // totalStock изменился → зеркалим остаток на единственный вариант.
  if (ops.some(o => o.field === 'totalStock')) await mirrorSingleVariantStock(productId)
}

// Главная функция: тянет заказы за период, обновляет KaspiOrder/Items и остатки.
// daysBack — на сколько дней назад смотреть (по умолчанию 30).
export async function syncKaspiOrders(daysBack = 30): Promise<SyncResult> {
  const result: SyncResult = {
    ok: false, fetched: 0, upserted: 0, reserved: 0, completed: 0,
    released: 0, unmatchedItems: 0, errors: [],
  }
  if (!isKaspiConfigured()) {
    result.errors.push('KASPI_API_TOKEN не задан')
    return result
  }

  const now = Date.now()
  const fromMs = now - daysBack * 24 * 60 * 60 * 1000
  const ranges = splitRange(fromMs, now)

  // Собираем заказы по всем state и всем 14-дневным чанкам, дедуп по id.
  const byId = new Map<string, KaspiOrderData>()
  for (const state of ALL_STATES) {
    for (const [a, b] of ranges) {
      try {
        const orders = await getAllOrders({ state, fromMs: a, toMs: b })
        for (const o of orders) byId.set(o.id, o)
      } catch (e) {
        result.errors.push(`state=${state}: ${(e as Error).message}`)
      }
    }
  }
  result.fetched = byId.size

  for (const o of Array.from(byId.values())) {
    try {
      await syncOneOrder(o, result)
    } catch (e) {
      result.errors.push(`order ${o.id}: ${(e as Error).message}`)
    }
  }

  result.ok = result.errors.length === 0
  return result
}

async function syncOneOrder(o: KaspiOrderData, result: SyncResult) {
  const a = o.attributes
  const desired = desiredEffect(a.status)

  const existing = await prisma.kaspiOrder.findUnique({
    where: { kaspiOrderId: o.id },
    include: { items: true },
  })

  const customerName = a.customer?.name
    || [a.customer?.firstName, a.customer?.lastName].filter(Boolean).join(' ')
    || null

  // upsert шапки заказа (без изменения stockApplied — его меняем после переходов)
  const order = await prisma.kaspiOrder.upsert({
    where: { kaspiOrderId: o.id },
    update: {
      code: a.code, state: a.state, status: a.status,
      totalPrice: a.totalPrice ?? 0,
      customerName, customerPhone: a.customer?.cellPhone ?? null,
      deliveryMode: a.deliveryMode ?? null,
      isPreorder: !!a.preOrder, isKaspiDelivery: !!a.isKaspiDelivery,
      creationDate: a.creationDate ? new Date(a.creationDate) : null,
      raw: a as any, syncedAt: new Date(),
    },
    create: {
      kaspiOrderId: o.id, code: a.code, state: a.state, status: a.status,
      stockApplied: null,
      totalPrice: a.totalPrice ?? 0,
      customerName, customerPhone: a.customer?.cellPhone ?? null,
      deliveryMode: a.deliveryMode ?? null,
      isPreorder: !!a.preOrder, isKaspiDelivery: !!a.isKaspiDelivery,
      creationDate: a.creationDate ? new Date(a.creationDate) : null,
      raw: a as any,
    },
  })
  result.upserted += 1

  // Пуш ТОЛЬКО для по-настоящему новых: первая встреча И статус APPROVED_BY_BANK
  // (Каспи оплатил, продавец ещё не принял). Если при первом импорте уже более
  // продвинутый статус — это бэк-импорт старого заказа, не новый.
  if (!existing && a.status === 'APPROVED_BY_BANK') {
    try {
      const { notifyAdmins } = await import('./push')
      const sum = (a.totalPrice ?? 0).toLocaleString('ru-RU')
      await notifyAdmins(
        `Kaspi #${a.code ?? o.id}`,
        `${customerName ?? 'без имени'} · ${sum} ₸`,
        '/admin/kaspi-orders',
        'kaspi',
      )
    } catch (e) {
      result.errors.push(`notify Kaspi ${o.id}: ${(e as Error).message}`)
    }
  }

  // Позиции: тянем только если их ещё нет (позиции заказа неизменны).
  let items = existing?.items ?? []
  if (items.length === 0) {
    const entries = await getOrderEntries(o.id)
    for (const e of entries) {
      const product = await getEntryProduct(e.id)
      const merchantSku = product?.code || ''
      const productId = merchantSku ? await resolveProductId(merchantSku) : null
      if (!productId) result.unmatchedItems += 1
      const created = await prisma.kaspiOrderItem.create({
        data: {
          kaspiOrderId: order.id,
          kaspiSku: merchantSku,
          kaspiName: product?.name ?? null,
          productId,
          quantity: e.attributes.quantity ?? 1,
          price: e.attributes.basePrice ?? 0,
        },
      })
      items.push(created as any)
    }
  }

  const current = (order.stockApplied ?? 'none') as StockEffect

  // Переразрешить привязку позиций, у которых productId ещё null (товар/оффер
  // мог появиться позже первого импорта). Если позиция привязалась впервые,
  // а заказ уже в эффекте reserved/completed — до-применяем эффект для неё
  // (от none к current), иначе её бронь/списание потерялись бы.
  for (const it of items) {
    if (it.productId || !it.kaspiSku) continue
    const pid = await resolveProductId(it.kaspiSku)
    if (!pid) continue
    await prisma.kaspiOrderItem.update({ where: { id: it.id }, data: { productId: pid } })
    it.productId = pid
    if (current !== 'none') {
      await applyItemTransition(pid, it.quantity, 'none', current)
    }
  }

  // Применяем переход остатков, только если эффект сменился.
  if (current !== desired && desired !== 'none') {
    for (const it of items) {
      if (!it.productId) continue
      await applyItemTransition(it.productId, it.quantity, current, desired)
    }
    await prisma.kaspiOrder.update({
      where: { id: order.id },
      data: { stockApplied: desired },
    })
    if (desired === 'reserved') result.reserved += 1
    else if (desired === 'completed') result.completed += 1
    else if (desired === 'released') result.released += 1
  }
}

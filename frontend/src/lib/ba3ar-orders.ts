// Заказы ba3ar.kz на едином складе Alash. ba3ar шлёт заказ по HTTP, мы создаём
// Ba3arOrder, привязываем позиции к Product по SKU и бронируем остаток
// (reservedStock), как Satu. Списание/снятие — по смене статуса.
//
// Статусы (как у Alash): new|confirmed|processing → бронь; shipped|delivered|
// picked_up → списано; canceled|returned → возврат на склад.
// stockApplied (reserved|completed|released) — идемпотентность.

import { prisma } from '@/lib/prisma'
import { mirrorSingleVariantStock } from '@/lib/variant-stock'
import { BA3AR_STATUSES, type Ba3arStatus } from '@/lib/ba3ar-constants'
import { triggerBa3arStockSync } from '@/lib/ba3ar-sync-trigger'

export { BA3AR_STATUSES, type Ba3arStatus }

type StockEffect = 'none' | 'reserved' | 'completed' | 'released'

export function ba3arDesiredEffect(status: string): StockEffect {
  switch (status) {
    // Как у Alash: списываем со склада СРАЗУ при заказе (totalStock--), пока
    // заказ активный. Так остаток падает мгновенно и нет двойных продаж.
    case 'new':
    case 'confirmed':
    case 'processing':
    case 'shipped':
    case 'delivered':
    case 'picked_up':
      return 'completed'     // товар списан со склада (физически уменьшен)
    case 'canceled':
    case 'returned':
      return 'released'      // отмена/возврат — вернуть на склад
    default:
      return 'none'
  }
}

// Переход остатков для позиции (та же логика, что у Satu/Kaspi).
async function applyTransition(productId: string, qty: number, from: StockEffect, to: StockEffect) {
  if (from === to) return
  // Гибкий пересчёт остатков: статус можно менять в любом направлении.
  // reservedStock: +qty при входе в reserved, -qty при выходе из reserved.
  // totalStock:    -qty при входе в completed (списание),
  //                +qty при выходе из completed в любой другой статус (возврат).
  const ops: Array<{ field: 'reservedStock' | 'totalStock'; delta: number }> = []
  const wasReserved = from === 'reserved'
  const willReserved = to === 'reserved'
  if (!wasReserved && willReserved) ops.push({ field: 'reservedStock', delta: qty })
  if (wasReserved && !willReserved) ops.push({ field: 'reservedStock', delta: -qty })
  if (to === 'completed' && from !== 'completed') ops.push({ field: 'totalStock', delta: -qty })
  if (from === 'completed' && to !== 'completed') ops.push({ field: 'totalStock', delta: qty })
  for (const op of ops) {
    if (op.field === 'reservedStock') {
      await prisma.$executeRaw`UPDATE "Product" SET "reservedStock" = GREATEST(0, "reservedStock" + ${op.delta}), "inStock" = (GREATEST(0, "reservedStock" + ${op.delta}) < "totalStock") WHERE id = ${productId}`
    } else {
      await prisma.$executeRaw`UPDATE "Product" SET "totalStock" = GREATEST(0, "totalStock" + ${op.delta}), "inStock" = ((GREATEST(0, "totalStock" + ${op.delta}) - "reservedStock") > 0) WHERE id = ${productId}`
    }
  }
  // totalStock изменился → зеркалим остаток на единственный вариант.
  if (ops.some(o => o.field === 'totalStock')) await mirrorSingleVariantStock(productId)
  // остаток изменён → пометить на синхронизацию в Satu (общий склад)
  if (ops.length) {
    await prisma.product.updateMany({
      where: { id: productId, satuProducts: { some: { active: true } } },
      data: { satuDirty: true },
    }).catch(() => {})
  }
}

// productId Alash по SKU (через Product.sku — источник истины после миграции)
async function resolveProductIdBySku(skus: string[]): Promise<Map<string, string>> {
  const clean = skus.map(s => s.trim()).filter(Boolean)
  if (!clean.length) return new Map()
  const products = await prisma.product.findMany({
    where: { sku: { in: clean } },
    select: { sku: true, id: true },
  })
  const m = new Map<string, string>()
  for (const p of products) if (p.sku) m.set(p.sku, p.id)
  return m
}

// Наличие/остаток по productId. available = totalStock − reservedStock (как в каталоге).
async function fetchProductStock(productIds: string[]) {
  const ids = Array.from(new Set(productIds.filter(Boolean)))
  if (!ids.length) return new Map<string, { inStock: boolean; available: number }>()
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, inStock: true, totalStock: true, reservedStock: true },
  })
  const m = new Map<string, { inStock: boolean; available: number }>()
  for (const r of rows) {
    // totalStock=0 трактуем как «безлимит» (как в остальной логике склада)
    const available = r.totalStock === 0 ? Number.POSITIVE_INFINITY : Math.max(0, r.totalStock - r.reservedStock)
    m.set(r.id, { inStock: r.inStock, available })
  }
  return m
}

export interface Ba3arOrderInput {
  ba3arOrderId: string
  customerName?: string
  customerPhone?: string
  email?: string
  deliveryName?: string
  paymentName?: string
  address?: string
  comment?: string
  items: Array<{ sku: string; name?: string; quantity: number; price?: number }>
  // товары, которые клиент смотрел перед заказом (история просмотра)
  viewed?: Array<{ sku: string; name?: string }>
}

export interface Ba3arOrderResult {
  ok: boolean
  orderId?: string
  orderNumber?: number  // человекочитаемый № (для показа клиенту на витрине)
  reserved: number      // позиций забронировано
  unmatched: number     // позиций без товара Alash (по SKU)
  errors: string[]
}

export async function createBa3arOrder(input: Ba3arOrderInput): Promise<Ba3arOrderResult> {
  const result: Ba3arOrderResult = { ok: false, reserved: 0, unmatched: 0, errors: [] }
  if (!input.ba3arOrderId) { result.errors.push('ba3arOrderId обязателен'); return result }
  if (!input.items?.length) { result.errors.push('Нет позиций'); return result }

  // идемпотентность: если заказ с таким ba3arOrderId уже есть — не дублируем
  const existing = await prisma.ba3arOrder.findUnique({ where: { ba3arOrderId: input.ba3arOrderId } })
  if (existing) { result.ok = true; result.orderId = existing.id; result.orderNumber = existing.orderNumber; result.errors.push('Заказ уже существует'); return result }

  const skuToPid = await resolveProductIdBySku(input.items.map(i => i.sku))
  const stockByPid = await fetchProductStock(Array.from(skuToPid.values()))
  const total = input.items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0)

  // история просмотра: резолвим SKU просмотренных товаров в productId (без дублей)
  const viewedRaw = (input.viewed ?? []).filter(v => v?.sku)
  const viewedSkuToPid = await resolveProductIdBySku(viewedRaw.map(v => v.sku))
  const seenViewed = new Set<string>()
  const viewedCreate = viewedRaw
    .filter(v => { const k = v.sku.trim(); if (!k || seenViewed.has(k)) return false; seenViewed.add(k); return true })
    .map(v => ({ sku: v.sku, name: v.name ?? null, productId: viewedSkuToPid.get(v.sku.trim()) ?? null }))

  // Предзаказ (как у Alash): если хоть одна позиция не в наличии — привязки нет
  // (SKU≥3001 / нет на складе) ИЛИ товар out-of-stock / доступного остатка не
  // хватает. По таким позициям остаток НЕ бронируем (брони нет — нечего).
  let isPreorder = false
  for (const i of input.items) {
    const pid = skuToPid.get(i.sku.trim()) ?? null
    const qty = Math.max(1, Math.round(i.quantity))
    const st = pid ? stockByPid.get(pid) : undefined
    const inStock = !!st && st.inStock && st.available >= qty
    if (!inStock) { isPreorder = true; break }
  }

  const order = await prisma.ba3arOrder.create({
    data: {
      ba3arOrderId: input.ba3arOrderId,
      status: 'new',
      stockApplied: 'completed',   // списываем со склада сразу при заказе (как Alash)
      isPreorder,
      totalPrice: total,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      email: input.email ?? null,
      deliveryName: input.deliveryName ?? null,
      paymentName: input.paymentName ?? null,
      address: input.address ?? null,
      comment: input.comment ?? null,
      raw: input as any,
      statusLogs: { create: { fromStatus: null, toStatus: 'new', note: isPreorder ? 'Заказ создан (предзаказ)' : 'Заказ создан' } },
      ...(viewedCreate.length ? { viewedProducts: { create: viewedCreate } } : {}),
      items: {
        create: input.items.map(i => {
          const pid = skuToPid.get(i.sku.trim()) ?? null
          if (!pid) result.unmatched += 1
          return {
            sku: i.sku, name: i.name ?? null, productId: pid,
            quantity: Math.max(1, Math.round(i.quantity)), price: i.price ?? 0,
          }
        }),
      },
    },
    include: { items: true },
  })

  // списываем со склада сразу (totalStock--) только для позиций в наличии.
  // Предзаказные позиции (нет в наличии) не трогаем — списывать нечего.
  for (const it of order.items) {
    if (!it.productId) continue
    const st = stockByPid.get(it.productId)
    const inStock = !!st && st.inStock && st.available >= it.quantity
    if (!inStock) continue
    await applyTransition(it.productId, it.quantity, 'none', 'completed')
    result.reserved += 1
  }

  try {
    const { notifyAdmins } = await import('./push')
    const sum = total.toLocaleString('ru-RU')
    await notifyAdmins(
      `Ba3ar #${order.orderNumber ?? order.id}${isPreorder ? ' (предзаказ)' : ''}`,
      `${input.customerName ?? 'без имени'} · ${sum} ₸`,
      '/admin/ba3ar-orders',
      'ba3ar',
    )
  } catch (e) {
    result.errors.push(`notify Ba3ar: ${(e as Error).message}`)
  }
  // ВАЖНО: НЕ дёргаем здесь синк витрины ba3ar. Заказ пришёл С витрины ba3ar,
  // и обратный вызов витрина→Alash→витрина подвисал (кольцо). Витрина после
  // оформления синкает свой products.json сама (см. storefront /api/orders).

  result.ok = true
  result.orderId = order.id
  result.orderNumber = order.orderNumber
  return result
}

// Сменить статус заказа ba3ar + применить эффект на остатки + записать в историю.
export async function setBa3arOrderStatus(orderRowId: string, newStatus: string, note?: string) {
  if (!BA3AR_STATUSES.includes(newStatus as Ba3arStatus)) {
    return { ok: false, error: `Неизвестный статус: ${newStatus}` }
  }
  const order = await prisma.ba3arOrder.findUnique({ where: { id: orderRowId }, include: { items: true } })
  if (!order) return { ok: false, error: 'Заказ не найден' }
  const prevStatus = order.status
  if (prevStatus === newStatus) return { ok: true, status: newStatus, stockApplied: order.stockApplied }

  const current = (order.stockApplied ?? 'none') as StockEffect
  const desired = ba3arDesiredEffect(newStatus)
  // applyTransition сам решает, что делать: бронь, списание, возврат на склад.
  let stockChanged = false
  if (current !== desired) {
    for (const it of order.items) {
      if (!it.productId) continue
      await applyTransition(it.productId, it.quantity, current, desired)
      stockChanged = true
    }
  }
  await prisma.ba3arOrder.update({
    where: { id: order.id },
    data: {
      status: newStatus,
      stockApplied: desired,
      statusLogs: { create: { fromStatus: prevStatus, toStatus: newStatus, note: note ?? null } },
    },
  })
  // остаток изменился → мгновенно обновить витрину ba3ar (иначе ждать cron)
  if (stockChanged) await triggerBa3arStockSync()
  return { ok: true, status: newStatus, stockApplied: desired }
}

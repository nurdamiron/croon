// Синхронизация с Satu.kz: импорт товаров (зеркало + авто-связь по SKU) и
// push остатков Alash → Satu. (Заказы — отдельным этапом.)
//
// Связь Satu↔Alash: Satu.sku («Код» товара) совпадает с артикулом Alash,
// который хранится в ProductVariant.sku → даёт productId.
// Доступный остаток для Satu = totalStock − reservedStock (как у Kaspi).

import { prisma } from '@/lib/prisma'
import { mirrorSingleVariantStock } from '@/lib/variant-stock'
import { marked } from 'marked'
import { triggerBa3arStockSync } from '@/lib/ba3ar-sync-trigger'
import {
  getAllSatuProducts,
  getAllSatuOrders,
  editSatuProducts,
  startSatuImportByUrl,
  waitSatuImport,
  setSatuOrderStatus,
  isSatuConfigured,
  type SatuEditItem,
  type SatuPresence,
  type SatuSettableStatus,
  type SatuCancelReason,
} from '@/lib/satu-api'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://alash-electronics.kz').replace(/\/$/, '')

export interface SatuImportResult {
  ok: boolean
  fetched: number
  upserted: number
  autoLinked: number
  unlinked: number
  removed: number   // удалено из зеркала (товары, исчезнувшие из выдачи Satu)
  errors: string[]
}

// Импорт товаров Satu в БД (зеркало SatuProduct) + авто-связь по sku.
export async function importSatuProducts(): Promise<SatuImportResult> {
  const result: SatuImportResult = {
    ok: false, fetched: 0, upserted: 0, autoLinked: 0, unlinked: 0, removed: 0, errors: [],
  }
  if (!isSatuConfigured()) {
    result.errors.push('SATU_API_TOKEN не задан')
    return result
  }

  let products
  try {
    products = await getAllSatuProducts()
  } catch (e) {
    result.errors.push((e as Error).message)
    return result
  }
  result.fetched = products.length

  // соберём все sku для разовой загрузки соответствий артикул→productId (Product.sku)
  const skus = products.map(p => (p.sku || '').trim()).filter(Boolean)
  const matched = skus.length
    ? await prisma.product.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, id: true },
      })
    : []
  const productIdBySku = new Map<string, string>()
  for (const m of matched) if (m.sku) productIdBySku.set(m.sku, m.id)

  for (const p of products) {
    const sku = (p.sku || '').trim() || null
    try {
      // не перетираем уже выставленную вручную связь — productId меняем только
      // при создании или если он ещё пустой и нашлось авто-совпадение
      const existing = await prisma.satuProduct.findUnique({
        where: { satuId: String(p.id) },
        select: { id: true, productId: true },
      })
      const autoPid = sku ? productIdBySku.get(sku) ?? null : null

      const data = {
        sku,
        name: p.name,
        presence: p.presence ?? null,
        price: typeof p.price === 'number' ? p.price : null,
        raw: p as any,
      }

      if (existing) {
        const setPid = existing.productId ?? autoPid // не трогаем ручную привязку
        await prisma.satuProduct.update({
          where: { satuId: String(p.id) },
          data: { ...data, productId: setPid },
        })
        if (!existing.productId && autoPid) result.autoLinked += 1
        if (!setPid) result.unlinked += 1
      } else {
        await prisma.satuProduct.create({
          data: { satuId: String(p.id), productId: autoPid, active: true, ...data },
        })
        if (autoPid) result.autoLinked += 1
        else result.unlinked += 1
      }
      result.upserted += 1
    } catch (e) {
      result.errors.push(`satuId ${p.id}: ${(e as Error).message}`)
    }
  }

  // Чистка зеркала: товары, которых больше нет в выдаче Satu (удалены в кабинете),
  // убираем из SatuProduct. Защита: только если выдача непустая (иначе сбой API
  // снёс бы всё зеркало). НЕ трогаем строки с привязкой к заказу — их нет в этой
  // таблице, заказы хранят productId отдельно, так что удаление безопасно.
  if (products.length > 0) {
    try {
      const liveIds = new Set(products.map(p => String(p.id)))
      const mirror = await prisma.satuProduct.findMany({ select: { satuId: true } })
      const stale = mirror.map(m => m.satuId).filter(id => !liveIds.has(id))
      if (stale.length) {
        const del = await prisma.satuProduct.deleteMany({ where: { satuId: { in: stale } } })
        result.removed = del.count
      }
    } catch (e) {
      result.errors.push(`чистка зеркала: ${(e as Error).message}`)
    }
  }

  result.ok = result.errors.length === 0
  return result
}

export interface SatuPushResult {
  ok: boolean
  candidates: number      // связанных активных товаров
  sent: number            // отправлено в Satu
  processed: number       // подтверждено Satu (processed_ids)
  errors: string[]
  dryRun: boolean
}

// Push остатков Alash → Satu для связанных активных SatuProduct.
// quantity_in_stock = max(0, totalStock − reservedStock);
// presence = qty>0 ? available : order (по решению пользователя).
// dryRun=true — только считает, ничего не шлёт (для безопасной проверки).
export async function pushSatuStock(dryRun = false): Promise<SatuPushResult> {
  const result: SatuPushResult = {
    ok: false, candidates: 0, sent: 0, processed: 0, errors: [], dryRun,
  }
  if (!isSatuConfigured()) {
    result.errors.push('SATU_API_TOKEN не задан')
    return result
  }

  const linked = await prisma.satuProduct.findMany({
    where: { active: true, productId: { not: null } },
    select: {
      satuId: true,
      product: { select: { totalStock: true, reservedStock: true } },
    },
  })
  result.candidates = linked.length

  const items: SatuEditItem[] = []
  for (const sp of linked) {
    if (!sp.product) continue
    const qty = Math.max(0, sp.product.totalStock - sp.product.reservedStock)
    const presence: SatuPresence = qty > 0 ? 'available' : 'order'
    items.push({ id: Number(sp.satuId), presence, quantity_in_stock: qty })
  }
  result.sent = items.length

  if (dryRun) {
    result.ok = true
    return result
  }

  // Шлём батчами по 100 (лимит на размер тела).
  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100)
    try {
      const res = await editSatuProducts(batch)
      result.processed += res.processed_ids?.length ?? 0
      if (res.errors && Object.keys(res.errors).length) {
        result.errors.push(JSON.stringify(res.errors).slice(0, 300))
      }
      // отметим время отправки
      await prisma.satuProduct.updateMany({
        where: { satuId: { in: batch.map(b => String(b.id)) } },
        data: { lastPushedAt: new Date() },
      })
    } catch (e) {
      result.errors.push((e as Error).message)
    }
  }

  result.ok = result.errors.length === 0
  return result
}

// Пометить товары как требующие синхронизации остатка с Satu (очередь).
// Вызывать там, где меняется totalStock/reservedStock (заказы, ручные правки).
// Помечаем только товары со связанным активным SatuProduct. Глотает ошибки —
// не должно ломать оформление заказа.
export async function markSatuDirty(productIds: string[]): Promise<void> {
  const ids = productIds.filter(Boolean)
  if (!ids.length || !isSatuConfigured()) return
  try {
    await prisma.product.updateMany({
      where: { id: { in: ids }, satuProducts: { some: { active: true } } },
      data: { satuDirty: true },
    })
  } catch {
    // не критично — подхватит периодический полный push
  }
}

// Воркер очереди: пушит в Satu остатки ТОЛЬКО товаров с satuDirty=true,
// затем снимает флаг. Эффективно — шлём лишь изменённое.
export async function pushSatuDirty(): Promise<SatuPushResult> {
  const result: SatuPushResult = {
    ok: false, candidates: 0, sent: 0, processed: 0, errors: [], dryRun: false,
  }
  if (!isSatuConfigured()) {
    result.errors.push('SATU_API_TOKEN не задан')
    return result
  }

  const dirty = await prisma.satuProduct.findMany({
    where: { active: true, productId: { not: null }, product: { satuDirty: true } },
    select: {
      satuId: true,
      productId: true,
      product: { select: { totalStock: true, reservedStock: true } },
    },
  })
  result.candidates = dirty.length
  if (!dirty.length) { result.ok = true; return result }

  const items: SatuEditItem[] = []
  const productIds = new Set<string>()
  for (const sp of dirty) {
    if (!sp.product) continue
    const qty = Math.max(0, sp.product.totalStock - sp.product.reservedStock)
    items.push({ id: Number(sp.satuId), presence: qty > 0 ? 'available' : 'order', quantity_in_stock: qty })
    if (sp.productId) productIds.add(sp.productId)
  }
  result.sent = items.length

  for (let i = 0; i < items.length; i += 100) {
    const batch = items.slice(i, i + 100)
    try {
      const res = await editSatuProducts(batch)
      result.processed += res.processed_ids?.length ?? 0
      if (res.errors && Object.keys(res.errors).length) {
        result.errors.push(JSON.stringify(res.errors).slice(0, 300))
      }
      await prisma.satuProduct.updateMany({
        where: { satuId: { in: batch.map(b => String(b.id)) } },
        data: { lastPushedAt: new Date() },
      })
    } catch (e) {
      result.errors.push((e as Error).message)
    }
  }

  // Снимаем флаг только если push прошёл чисто (иначе попробуем снова).
  if (result.errors.length === 0 && productIds.size) {
    await prisma.product.updateMany({
      where: { id: { in: Array.from(productIds) } },
      data: { satuDirty: false },
    })
  }

  result.ok = result.errors.length === 0
  return result
}

// ─── Этап 2: импорт заказов Satu + бронь/списание остатков ───

type SatuStockEffect = 'none' | 'reserved' | 'completed' | 'released'

// Маппинг статуса заказа Satu → эффект на остатки.
// Как у Alash/Ba3ar: списываем totalStock СРАЗУ при заказе (любой активный
// статус → completed), чтобы остаток падал мгновенно и был одинаков везде.
function satuDesiredEffect(status: string): SatuStockEffect {
  switch (status) {
    case 'pending':   // Новый
    case 'paid':      // Оплаченный
    case 'delivered': // Выполнен (отправлен/выдан)
    case 'received':  // Получен
      return 'completed'  // товар списан со склада (физически уменьшен)
    case 'canceled':  // Отменён
      return 'released'   // вернуть на склад
    default:
      return 'none'
  }
}

// "650 ₸" / "1 950 ₸" / 650 → число
function parseSatuPrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.,]/g, '').replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

// Применить переход эффекта остатков для позиции (та же логика, что у Kaspi).
async function applySatuItemTransition(
  productId: string, qty: number, from: SatuStockEffect, to: SatuStockEffect,
) {
  if (from === to) return
  const ops: Array<{ field: 'reservedStock' | 'totalStock'; delta: number }> = []
  const wasReserved = from === 'reserved'
  const willReserved = to === 'reserved'
  if (!wasReserved && willReserved) ops.push({ field: 'reservedStock', delta: qty })
  if (wasReserved && !willReserved) ops.push({ field: 'reservedStock', delta: -qty })
  if (to === 'completed' && from !== 'completed') ops.push({ field: 'totalStock', delta: -qty })
  // выход из completed в любой другой статус — вернуть на склад (гибкая смена статуса)
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
  // остаток изменён → синхронизировать обратно в Satu (на случай разных карточек)
  if (ops.length) {
    await prisma.product.updateMany({
      where: { id: productId, satuProducts: { some: { active: true } } },
      data: { satuDirty: true },
    }).catch(() => {})
  }
}

// Сопоставить позицию заказа Satu с товаром Alash.
// Приоритет: по Satu product id (products[].id → SatuProduct.satuId), затем по sku.
async function resolveSatuProductId(satuItemId: string | null, sku: string | null): Promise<string | null> {
  if (satuItemId) {
    const sp = await prisma.satuProduct.findUnique({
      where: { satuId: satuItemId },
      select: { productId: true },
    })
    if (sp?.productId) return sp.productId
  }
  if (sku) {
    const pr = await prisma.product.findFirst({ where: { sku }, select: { id: true } })
    if (pr?.id) return pr.id
  }
  return null
}

export interface SatuOrdersSyncResult {
  ok: boolean
  fetched: number
  upserted: number
  reserved: number
  completed: number
  released: number
  unmatchedItems: number
  errors: string[]
}

// Импорт заказов Satu за период (daysBack) + управление остатками.
export async function syncSatuOrders(daysBack = 30): Promise<SatuOrdersSyncResult> {
  const result: SatuOrdersSyncResult = {
    ok: false, fetched: 0, upserted: 0, reserved: 0, completed: 0,
    released: 0, unmatchedItems: 0, errors: [],
  }
  if (!isSatuConfigured()) {
    result.errors.push('SATU_API_TOKEN не задан')
    return result
  }

  // Satu НЕ принимает ISO с миллисекундами/Z (вернёт 0 заказов) —
  // обрезаем до "YYYY-MM-DDTHH:MM:SS".
  const dateFrom = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 19)
  let orders
  try {
    orders = await getAllSatuOrders({ dateFrom })
  } catch (e) {
    result.errors.push((e as Error).message)
    return result
  }
  result.fetched = orders.length

  for (const o of orders) {
    try {
      await syncOneSatuOrder(o, result)
    } catch (e) {
      result.errors.push(`order ${o.id}: ${(e as Error).message}`)
    }
  }

  result.ok = result.errors.length === 0
  return result
}

async function syncOneSatuOrder(o: any, result: SatuOrdersSyncResult) {
  const desired = satuDesiredEffect(o.status)
  const existing = await prisma.satuOrder.findUnique({
    where: { satuOrderId: String(o.id) },
    include: { items: true },
  })

  const customerName = [o.client?.first_name ?? o.client_first_name, o.client?.last_name ?? o.client_last_name]
    .filter(Boolean).join(' ') || null

  const order = await prisma.satuOrder.upsert({
    where: { satuOrderId: String(o.id) },
    update: {
      status: o.status,
      totalPrice: parseSatuPrice(o.price ?? o.full_price),
      customerName,
      customerPhone: o.phone ?? o.client?.phone ?? null,
      email: o.email ?? null,
      deliveryName: o.delivery_option?.name ?? null,
      creationDate: o.date_created ? new Date(o.date_created) : null,
      raw: o, syncedAt: new Date(),
    },
    create: {
      satuOrderId: String(o.id), status: o.status, stockApplied: null,
      totalPrice: parseSatuPrice(o.price ?? o.full_price),
      customerName,
      customerPhone: o.phone ?? o.client?.phone ?? null,
      email: o.email ?? null,
      deliveryName: o.delivery_option?.name ?? null,
      creationDate: o.date_created ? new Date(o.date_created) : null,
      raw: o,
    },
  })
  result.upserted += 1

  if (!existing) {
    try {
      const { notifyAdmins } = await import('./push')
      const sum = parseSatuPrice(o.price ?? o.full_price).toLocaleString('ru-RU')
      await notifyAdmins(
        `Satu #${o.id}`,
        `${customerName ?? 'без имени'} · ${sum} ₸`,
        '/admin/satu-orders',
        'satu',
      )
    } catch (e) {
      result.errors.push(`notify Satu ${o.id}: ${(e as Error).message}`)
    }
  }

  // Позиции: создаём только при первом импорте (состав неизменен).
  let items = existing?.items ?? []
  if (items.length === 0) {
    for (const pr of (o.products ?? [])) {
      const satuItemId = pr.id != null ? String(pr.id) : null
      const sku = (pr.sku || '').trim() || null
      const productId = await resolveSatuProductId(satuItemId, sku)
      if (!productId) result.unmatchedItems += 1
      const created = await prisma.satuOrderItem.create({
        data: {
          satuOrderId: order.id,
          satuItemId,
          sku,
          name: pr.name ?? null,
          productId,
          quantity: Math.max(1, Math.round(Number(pr.quantity) || 1)),
          price: parseSatuPrice(pr.price),
        },
      })
      items.push(created as any)
    }
  }

  const current = (order.stockApplied ?? 'none') as SatuStockEffect
  let stockChanged = false  // менялся ли остаток → надо пушнуть на ba3ar (единый склад)

  // Переразрешить непривязанные позиции (товар/связь могли появиться позже) +
  // до-применить эффект для впервые привязавшихся.
  for (const it of items) {
    if (it.productId) continue
    const pid = await resolveSatuProductId(it.satuItemId, it.sku)
    if (!pid) continue
    await prisma.satuOrderItem.update({ where: { id: it.id }, data: { productId: pid } })
    it.productId = pid
    if (current !== 'none') { await applySatuItemTransition(pid, it.quantity, 'none', current); stockChanged = true }
  }

  // Применить переход остатков, если эффект сменился.
  if (current !== desired && desired !== 'none') {
    for (const it of items) {
      if (!it.productId) continue
      await applySatuItemTransition(it.productId, it.quantity, current, desired)
      stockChanged = true
    }
    await prisma.satuOrder.update({ where: { id: order.id }, data: { stockApplied: desired } })
    if (desired === 'reserved') result.reserved += 1
    else if (desired === 'completed') result.completed += 1
    else if (desired === 'released') result.released += 1
  }

  // Единый склад: импорт Satu-заказа списал/вернул остаток → обновить витрину ba3ar
  // сразу (раньше push был только при ручной смене статуса → новый заказ Satu не
  // отражался на ba3ar до cron-фолбэка). markSatuDirty не нужен — источник Satu.
  if (stockChanged) await triggerBa3arStockSync()
}

// ─────────────────────────────────────────────────────────────────────────
// Смена статуса заказа Satu из нашей админки (двусторонняя синхра).
// Пишем статус в Satu (orders/set_status) + обновляем нашу БД + применяем
// эффект на остатки (reserved/completed/released). pending задать нельзя.
// ─────────────────────────────────────────────────────────────────────────

export interface SatuSetStatusResult {
  ok: boolean
  status: string
  stockApplied: string | null
  pushedToSatu: boolean
  errors: string[]
}

export async function setSatuOrderStatusAndStock(
  orderRowId: string,
  newStatus: SatuSettableStatus,
  cancellationReason?: SatuCancelReason,
): Promise<SatuSetStatusResult> {
  const result: SatuSetStatusResult = {
    ok: false, status: newStatus, stockApplied: null, pushedToSatu: false, errors: [],
  }
  const order = await prisma.satuOrder.findUnique({
    where: { id: orderRowId },
    include: { items: true },
  })
  if (!order) { result.errors.push('Заказ не найден'); return result }

  // 1) ОБЯЗАТЕЛЬНО записать статус в Satu ПЕРВЫМ. Если упало — НЕ трогаем БД и
  //    остатки, иначе наш статус разойдётся с Satu (как было с отменами).
  if (!isSatuConfigured()) {
    result.errors.push('SATU_API_TOKEN не задан')
    return result
  }
  try {
    await setSatuOrderStatus([Number(order.satuOrderId)], newStatus, cancellationReason)
    result.pushedToSatu = true
  } catch (e) {
    result.errors.push((e as Error).message)
    return result // ← НЕ обновляем БД, статус в Satu не сменился
  }

  // 2) применить эффект на остатки (как при синхре заказов)
  const current = (order.stockApplied ?? 'none') as SatuStockEffect
  const desired = satuDesiredEffect(newStatus)
  let stockChanged = false
  if (current !== desired && desired !== 'none') {
    for (const it of order.items) {
      if (!it.productId) continue
      await applySatuItemTransition(it.productId, it.quantity, current, desired)
      stockChanged = true
    }
    result.stockApplied = desired
  } else {
    result.stockApplied = order.stockApplied
  }

  // 3) обновить нашу БД (только после успешной записи в Satu) + история статуса
  await prisma.satuOrder.update({
    where: { id: order.id },
    data: {
      status: newStatus,
      ...(result.stockApplied ? { stockApplied: result.stockApplied } : {}),
      ...(order.status !== newStatus
        ? { statusLogs: { create: { fromStatus: order.status, toStatus: newStatus, note: 'записан в Satu' } } }
        : {}),
    },
  })

  // единый склад → остаток изменился, обновить витрину ba3ar сразу
  if (stockChanged) await triggerBa3arStockSync()

  result.ok = result.errors.length === 0
  return result
}

// ─────────────────────────────────────────────────────────────────────────
// Выгрузка товаров Alash → Satu (которых ещё нет на Satu).
// Кандидаты = товары Alash в наличии, чей SKU не встречается ни у одного
// SatuProduct (зеркало). Связь после импорта — по external_id=Product.id и
// по sku (артикул). См. memory/satu-import-products.md.
// ─────────────────────────────────────────────────────────────────────────

export interface SatuExportCandidate {
  id: string
  name: string
  sku: string | null
  price: number
  available: number
}

// Нормализация названия для сравнения дублей (регистр, кавычки, тире, пробелы).
function normName(s: string): string {
  return s.toLowerCase()
    .replace(/[«»"'`]/g, ' ')
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface SatuExportCandidatesResult {
  candidates: SatuExportCandidate[]   // безопасно выгружать (нет на Satu)
  nameCollisions: Array<{             // совпали по имени с карточкой Satu без артикула —
    id: string                        // выгрузка создаст дубль, нужна ручная привязка
    name: string
    sku: string
    satuId: string
  }>
}

// Товары Alash, которых нет на Satu. Исключаем:
//  - совпадение по SKU (артикул уже на Satu),
//  - уже привязанные вручную (productId),
//  - совпадение ПО ИМЕНИ с карточкой Satu без артикула (иначе import создаст ДУБЛЬ —
//    такую карточку нельзя «удочерить» через API, нужна ручная привязка в админке).
export async function getSatuExportCandidatesEx(limit = 1000): Promise<SatuExportCandidatesResult> {
  const satu = await prisma.satuProduct.findMany({
    select: { satuId: true, sku: true, productId: true, name: true },
  })
  const satuSkus = new Set<string>()
  const satuProductIds = new Set<string>()
  // карта нормализованное имя → satuId для карточек БЕЗ артикула и БЕЗ привязки
  const orphanByName = new Map<string, string>()
  for (const s of satu) {
    const sku = (s.sku || '').trim()
    if (sku) satuSkus.add(sku)
    if (s.productId) satuProductIds.add(s.productId)
    if (!sku && !s.productId && s.name) orphanByName.set(normName(s.name), s.satuId)
  }

  const products = await prisma.product.findMany({
    where: { inStock: true, sku: { not: null } },
    select: {
      id: true, name: true, price: true, totalStock: true, reservedStock: true,
      sku: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5000,
  })

  const candidates: SatuExportCandidate[] = []
  const nameCollisions: SatuExportCandidatesResult['nameCollisions'] = []
  for (const p of products) {
    const sku = (p.sku || '').trim()
    if (!sku) continue
    if (satuSkus.has(sku)) continue
    if (satuProductIds.has(p.id)) continue
    const orphanSatuId = orphanByName.get(normName(p.name))
    if (orphanSatuId) {
      nameCollisions.push({ id: p.id, name: p.name, sku, satuId: orphanSatuId })
      continue // НЕ выгружаем — создаст дубль
    }
    candidates.push({
      id: p.id,
      name: p.name,
      sku,
      price: p.price,
      available: Math.max(0, p.totalStock - p.reservedStock),
    })
    if (candidates.length >= limit) break
  }
  return { candidates, nameCollisions }
}

// Обёртка для обратной совместимости (только безопасные кандидаты).
export async function getSatuExportCandidates(limit = 1000): Promise<SatuExportCandidate[]> {
  const { candidates } = await getSatuExportCandidatesEx(limit)
  return candidates
}

export interface SatuExportResult {
  ok: boolean
  requested: number       // сколько товаров просили выгрузить
  importStatus: string    // статус задачи импорта Satu
  imported: number        // создано/обновлено на Satu (из import-статуса)
  enriched: number        // дозалито через products/edit (qty + HTML-описание)
  mirrored: number        // обновлено зеркало SatuProduct (новых строк)
  errors: string[]
}

// Выгрузить указанные товары Alash на Satu.
// 1) import_url нашего YML-фида (?ids=...) → создаёт карточки + external_id +
//    артикул + название + цена + фото + категория.
// 2) products/edit → гарантируем количество и HTML-описание (import их не всегда
//    применяет на повторе).
// 3) importSatuProducts() → подтянуть новые карточки в зеркало + авто-связь.
export async function exportProductsToSatu(productIds: string[]): Promise<SatuExportResult> {
  const result: SatuExportResult = {
    ok: false, requested: productIds.length, importStatus: '', imported: 0,
    enriched: 0, mirrored: 0, errors: [],
  }
  if (!isSatuConfigured()) { result.errors.push('SATU_API_TOKEN не задан'); return result }
  if (!productIds.length) { result.errors.push('Не переданы товары'); return result }

  // 1) старт импорта по URL фида
  const feedUrl = `${SITE_URL}/api/satu/feed.yml?ids=${productIds.map(encodeURIComponent).join(',')}`
  try {
    const importId = await startSatuImportByUrl(feedUrl, false)
    const status = await waitSatuImport(importId, { tries: 18, intervalMs: 5000 })
    result.importStatus = status.status
    result.imported = (status.imported ?? 0) || (status.created ?? 0) || (status.updated ?? 0)
    if (status.status === 'FAIL') {
      result.errors.push(`Импорт Satu FAIL: ${JSON.stringify(status.errors)?.slice(0, 300)}`)
      return result
    }
  } catch (e) {
    result.errors.push(`import_url: ${(e as Error).message}`)
    return result
  }

  // подтянуть зеркало (создаст SatuProduct для новых карточек по их sku/ext_id)
  try {
    const imp = await importSatuProducts()
    result.mirrored = imp.upserted
  } catch (e) {
    result.errors.push(`зеркало: ${(e as Error).message}`)
  }

  // 2) дозалить количество + HTML-описание через products/edit.
  //    Находим satuId по external_id (=Product.id) среди только что импортированных.
  try {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true, description: true, totalStock: true, reservedStock: true, inStock: true,
      },
    })
    const descById = new Map<string, { desc: string | null; qty: number; inStock: boolean }>()
    for (const p of products) {
      descById.set(p.id, {
        desc: p.description,
        qty: Math.max(0, p.totalStock - p.reservedStock),
        inStock: p.inStock,
      })
    }

    // satuId этих товаров (по зеркалу, связь productId уже проставлена)
    const mirror = await prisma.satuProduct.findMany({
      where: { productId: { in: productIds } },
      select: { satuId: true, productId: true },
    })

    const edits: SatuEditItem[] = []
    for (const m of mirror) {
      const info = m.productId ? descById.get(m.productId) : null
      if (!info) continue
      let descHtml: string | undefined
      if (info.desc) {
        try { descHtml = marked.parse(info.desc, { async: false }) as string } catch { descHtml = info.desc }
      }
      edits.push({
        id: Number(m.satuId),
        quantity_in_stock: info.qty,
        presence: info.qty > 0 && info.inStock ? 'available' : 'order',
        ...(descHtml ? { description: descHtml } : {}),
      })
    }
    if (edits.length) {
      const res = await editSatuProducts(edits)
      result.enriched = res.processed_ids.length
      const errKeys = Object.keys(res.errors || {})
      if (errKeys.length) result.errors.push(`edit ошибки: ${errKeys.join(',')}`)
    }
  } catch (e) {
    result.errors.push(`дозалив полей: ${(e as Error).message}`)
  }

  result.ok = result.errors.length === 0
  return result
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mirrorSingleVariantStock } from '@/lib/variant-stock'
import { sendOrderStatusUpdate } from '@/lib/email'
import { markSatuDirty } from '@/lib/satu-sync'
import { triggerBa3arStockSync } from '@/lib/ba3ar-sync-trigger'

const ORDER_ITEMS_LOCKED_STATUSES = new Set(['CANCELLED', 'SHIPPED', 'DELIVERED', 'PICKED_UP'])

class StockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StockError'
  }
}

function mergeOrderItems(items: { productId: string; quantity: unknown }[]) {
  const map = new Map<string, number>()
  for (const raw of items) {
    if (!raw?.productId || typeof raw.productId !== 'string') continue
    const q = Math.floor(Number(raw.quantity))
    if (!Number.isFinite(q) || q < 1) continue
    map.set(raw.productId, (map.get(raw.productId) ?? 0) + q)
  }
  return Array.from(map.entries()).map(([productId, quantity]) => ({ productId, quantity }))
}

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                totalStock: true,
                sku: true,
                images: { take: 1, select: { url: true } },
              },
            },
          },
        },
        user: { select: { id: true, email: true, name: true, phone: true } },
        viewedProducts: {
          include: {
            product: {
              select: {
                name: true,
                slug: true,
                price: true,
                images: { take: 1, select: { url: true } },
              },
            },
          },
        },
        searchQueries: true,
        statusLogs: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Order detail error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()

  // ── Replace order line items (admin adjusts composition / quantities)
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      return NextResponse.json({ error: 'Некорректный список товаров' }, { status: 400 })
    }

    const merged = mergeOrderItems(body.items)
    if (merged.length === 0) {
      return NextResponse.json({ error: 'Добавьте хотя бы один товар' }, { status: 400 })
    }

    try {
      await prisma.$transaction(async (tx) => {
        const orderRow = await tx.order.findUnique({
          where: { id },
          select: { id: true, status: true, items: { select: { productId: true, quantity: true } } },
        })

        if (!orderRow) {
          throw new StockError('ORDER_NOT_FOUND')
        }
        if (ORDER_ITEMS_LOCKED_STATUSES.has(orderRow.status)) {
          throw new StockError('ORDER_LOCKED')
        }

        // Вернуть на склад все текущие позиции (как при отмене заказа с резервом)
        for (const item of orderRow.items) {
          await tx.$executeRaw`
            UPDATE "Product"
            SET
              "totalStock" = "totalStock" + ${item.quantity},
              "inStock"    = ("totalStock" + ${item.quantity} - "reservedStock") > 0,
              "updatedAt"  = now()
            WHERE id = ${item.productId}
          `
        }

        const products = await tx.product.findMany({
          where: { id: { in: merged.map((m) => m.productId) } },
          select: { id: true, name: true, price: true, inStock: true, totalStock: true },
        })

        if (products.length !== merged.length) {
          throw new StockError('Один из товаров не найден')
        }

        // Админ может добавить ЛЮБОЙ товар в ЛЮБОМ количестве к заказу —
        // даже если товара нет на складе или его меньше, чем нужно.
        // Поэтому НЕ блокируем по остатку. Списываем только реально доступное
        // количество (не уходим в минус), остаток пометим как предзаказ.
        let isPreorder = false
        for (const line of merged) {
          const p = products.find((x) => x.id === line.productId)!
          const avail = Math.max(0, p.totalStock)
          const toDeduct = Math.min(avail, line.quantity)

          // если списали меньше, чем заказано (или товар не в наличии) → это предзаказ
          if (toDeduct < line.quantity || !p.inStock) {
            isPreorder = true
          }

          if (toDeduct > 0) {
            await tx.$executeRaw`
              UPDATE "Product"
              SET
                "totalStock" = "totalStock" - ${toDeduct},
                "inStock"    = ("totalStock" - ${toDeduct} - "reservedStock") > 0,
                "updatedAt"  = now()
              WHERE id = ${p.id}
            `
          }
        }

        // totalStock пересчитан (возврат старых + списание новых) → зеркалим
        // остаток на единственный вариант для всех затронутых товаров.
        const touchedIds = Array.from(new Set<string>([
          ...orderRow.items.map((i) => i.productId),
          ...merged.map((m) => m.productId),
        ]))
        for (const pid of touchedIds) await mirrorSingleVariantStock(pid, tx)

        const priceMap = new Map(products.map((p) => [p.id, p.price]))
        const total = merged.reduce((sum, line) => sum + (priceMap.get(line.productId) ?? 0) * line.quantity, 0)

        await tx.orderItem.deleteMany({ where: { orderId: id } })
        await tx.orderItem.createMany({
          data: merged.map((line) => ({
            orderId: id,
            productId: line.productId,
            quantity: line.quantity,
            price: priceMap.get(line.productId) ?? 0,
          })),
        })

        await tx.order.update({
          where: { id },
          data: { total, isPreorder },
        })
      })
    } catch (e: unknown) {
      if (e instanceof StockError) {
        if (e.message === 'ORDER_NOT_FOUND') {
          return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
        }
        if (e.message === 'ORDER_LOCKED') {
          return NextResponse.json(
            { error: 'Нельзя менять состав в этом статусе (отправлен, доставлен или отменён)' },
            { status: 400 }
          )
        }
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      console.error('Order items update error:', e)
      return NextResponse.json({ error: 'Не удалось обновить состав заказа' }, { status: 500 })
    }

    // Состав заказа изменён админом → сток затронут, синхронизировать Satu + ba3ar.
    await markSatuDirty(merged.map((m) => m.productId)).catch(() => {})
    await triggerBa3arStockSync().catch(() => {})

    return NextResponse.json({ ok: true })
  }

  // Fetch current order for status comparison and stock restore
  const current = await prisma.order.findUnique({
    where: { id },
    select: {
      status: true,
      isPreorder: true,
      userId: true,
      items: { select: { productId: true, quantity: true } },
    },
  })

  // Restore stock if cancelling
  if (body.status === 'CANCELLED' && current && !current.isPreorder && current.status !== 'CANCELLED') {
    for (const item of current.items) {
      await prisma.$executeRaw`
        UPDATE "Product"
        SET "totalStock" = "totalStock" + ${item.quantity}, "inStock" = true, "updatedAt" = now()
        WHERE id = ${item.productId}
      `
      await mirrorSingleVariantStock(item.productId)
    }
    // остаток вернулся → синхронизировать Satu + витрину ba3ar (единый склад)
    const pids = current.items.map((it: any) => it.productId)
    await markSatuDirty(pids).catch(() => {})
    await triggerBa3arStockSync().catch(() => {})
  }

  const data: any = {}
  if (body.status) data.status = body.status
  if (body.comment !== undefined) data.comment = body.comment
  if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod
  if (body.deliveryMethod !== undefined) data.deliveryMethod = body.deliveryMethod

  const order = await prisma.order.update({ where: { id }, data })

  // Log status change + notify customer
  if (body.status && current && body.status !== current.status) {
    await prisma.orderStatusLog.create({
      data: {
        orderId: id,
        status: body.status,
        prevStatus: current.status,
        note: body.note || null,
      },
    })

    const NOTIFY_STATUSES = new Set(['CONFIRMED', 'SHIPPED', 'DELIVERED'])
    if (NOTIFY_STATUSES.has(body.status) && order.email) {
      const canNotify = current?.userId
        ? await prisma.user.findUnique({ where: { id: current.userId }, select: { emailNotifications: true } })
            .then(u => u?.emailNotifications !== false)
        : true
      if (canNotify) {
        sendOrderStatusUpdate({
          to: order.email,
          name: order.name,
          orderNumber: order.orderNumber,
          orderId: order.id,
          status: body.status,
        }).catch(err => console.error('Status email error:', err))
      }
    }
  }

  return NextResponse.json(order)
}

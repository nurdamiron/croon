import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { orderLimiter } from '@/lib/rate-limit'
import { notifyAdmins } from '@/lib/push'
import { sendTelegram, tgNewOrder } from '@/lib/telegram'
import { sendOrderConfirmation } from '@/lib/email'
import { markSatuDirty } from '@/lib/satu-sync'
import { triggerBa3arStockSync } from '@/lib/ba3ar-sync-trigger'

class StockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StockError'
  }
}

export async function POST(request: NextRequest) {
  const blocked = orderLimiter(request)
  if (blocked) return blocked

  try {
    const session = await getServerSession(authOptions)
    const body = await request.json()
    const { name, phone, email, address, deliveryMethod, paymentMethod, comment, items, viewedProductIds, searchQueries, referrer, utmSource, utmMedium, utmCampaign } = body

    if (!name || !phone || !items || items.length === 0) {
      return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 })
    }

    const productIds = items.map((item: { productId: string }) => item.productId)

    const order = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true, name: true, price: true, inStock: true, totalStock: true, reservedStock: true,
        },
      })

      // Validation pass.
      // Доступно = totalStock − reservedStock (бронь под незавершённые Kaspi-заказы).
      const stockErrors: string[] = []
      let isPreorder = false

      for (const item of items as { productId: string; quantity: number }[]) {
        const product = products.find(p => p.id === item.productId)
        if (!product) {
          stockErrors.push('Один из товаров не найден')
          continue
        }
        const available = Math.max(0, product.totalStock - product.reservedStock)
        if (!product.inStock) {
          // Out of stock → pre-order, no block
          isPreorder = true
        } else if (product.totalStock > 0 && available < item.quantity) {
          stockErrors.push(`«${product.name}» — в наличии только ${available} шт.`)
        }
      }

      if (stockErrors.length > 0) {
        throw new StockError(stockErrors.join('. '))
      }

      // Atomic decrement — prevents overselling under concurrent load
      for (const item of items as { productId: string; variantId?: string; quantity: number }[]) {
        const product = products.find(p => p.id === item.productId)
        if (!product || !product.inStock || product.totalStock <= 0) continue

        // Списываем с учётом брони: доступно = totalStock − reservedStock.
        // Условие WHERE гарантирует, что не уйдём в минус по доступному остатку
        // даже при гонке (сайт + Kaspi-синк одновременно).
        const updated: number = await tx.$executeRaw`
          UPDATE "Product"
          SET
            "totalStock" = "totalStock" - ${item.quantity},
            "inStock"    = ("totalStock" - ${item.quantity}) > "reservedStock",
            "updatedAt"  = now()
          WHERE id = ${product.id}
            AND "inStock" = true
            AND ("totalStock" - "reservedStock") >= ${item.quantity}
        `
        if (updated === 0) {
          throw new StockError(`«${product.name}» — товар только что закончился, попробуйте уменьшить количество`)
        }
        // Источник истины остатка — Product.totalStock. Тех-вариант (legacy) больше
        // не читается нигде и удаляется на этапе 4.5 — отдельно его сток не трогаем.
      }

      // Use DB prices — never trust client-sent prices. Цена = Product.price
      // (1 карточка = 1 товар; variantId из старых корзин игнорируем).
      const validatedItems = (items as { productId: string; quantity: number }[]).map(item => {
        const product = products.find(p => p.id === item.productId)
        return {
          productId: item.productId,
          quantity: item.quantity,
          price: product?.price ?? 0,
        }
      })
      const total = validatedItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

      return tx.order.create({
        data: {
          userId: (session?.user as any)?.id || null,
          isPreorder,
          name,
          phone,
          email: email || null,
          address: address || null,
          deliveryMethod: deliveryMethod || null,
          paymentMethod: paymentMethod || null,
          comment: comment || null,
          total,
          items: {
            create: validatedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
            })),
          },
          referrer: referrer || null,
          utmSource: utmSource || null,
          utmMedium: utmMedium || null,
          utmCampaign: utmCampaign || null,
          ...(viewedProductIds?.length > 0 && {
            viewedProducts: {
              create: (viewedProductIds as string[]).map((productId) => ({ productId })),
            },
          }),
          ...(searchQueries?.length > 0 && {
            searchQueries: {
              create: (searchQueries as string[]).map((q) => ({ query: q })),
            },
          }),
        },
        include: { items: true },
      })
    })

    // Остаток изменился (для обычного заказа) → пометить товары на синхронизацию
    // остатка с Satu + сразу обновить витрину ba3ar (единый склад). Предзаказ
    // сток не трогает — не помечаем.
    if (!order.isPreorder) {
      await markSatuDirty(order.items.map(it => it.productId)).catch(() => {})
      await triggerBa3arStockSync().catch(() => {})
    }

    const label = order.isPreorder ? 'Новый предзаказ' : 'Новый заказ'
    const adminUrl = `/admin/orders/${order.id}`

    await Promise.all([
      notifyAdmins(
        `${label} #${order.orderNumber}`,
        `${name} — ${order.total.toLocaleString('ru-RU')} тг`,
        adminUrl,
        'alash',
      ).catch(err => console.error('Push notification error:', err)),

      sendTelegram(tgNewOrder({
        orderNumber: order.orderNumber,
        name,
        phone,
        total: order.total,
        isPreorder: order.isPreorder,
        deliveryMethod: deliveryMethod || null,
        itemCount: order.items.length,
        url: adminUrl,
      })).catch(err => console.error('Telegram notification error:', err)),
    ])

    if (email) {
      prisma.product.findMany({
        where: { id: { in: order.items.map((i: any) => i.productId) } },
        select: { id: true, name: true },
      }).then(prods => {
        const nameMap = new Map(prods.map(p => [p.id, p.name]))
        return sendOrderConfirmation({
          to: email,
          name,
          orderNumber: order.orderNumber,
          orderId: order.id,
          items: order.items.map((item: any) => ({
            name: nameMap.get(item.productId) ?? item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
          total: order.total,
          deliveryMethod: deliveryMethod || null,
        })
      }).catch(err => console.error('Order confirmation email error:', err))
    }

    return NextResponse.json(
      { id: order.id, orderNumber: order.orderNumber, isPreorder: order.isPreorder },
      { status: 201 }
    )
  } catch (error: any) {
    if (error instanceof StockError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Order creation error:', error)
    return NextResponse.json({ error: 'Ошибка при создании заказа' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { orderLimiter } from '@/lib/rate-limit'
import { notifyAdmins } from '@/lib/push'
import { sendTelegram, tgNewPreorderQuick } from '@/lib/telegram'

export async function POST(request: NextRequest) {
  const blocked = orderLimiter(request)
  if (blocked) return blocked

  try {
    const { productId, name, phone, comment } = await request.json()

    if (!productId || !name || !phone) {
      return NextResponse.json({ error: 'Укажите имя и телефон' }, { status: 400 })
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, price: true, inStock: true },
    })

    if (!product) {
      return NextResponse.json({ error: 'Товар не найден' }, { status: 404 })
    }

    const order = await prisma.order.create({
      data: {
        isPreorder: true,
        name,
        phone,
        comment: comment || null,
        total: product.price,
        items: {
          create: [{ productId: product.id, quantity: 1, price: product.price }],
        },
      },
    })

    const adminUrl = `/admin/orders/${order.id}`
    await Promise.all([
      notifyAdmins(
        `Новый предзаказ #${order.orderNumber}`,
        `${name} — ${product.name}`,
        adminUrl,
        'croon',
      ).catch(err => console.error('Push notification error:', err)),

      sendTelegram(tgNewPreorderQuick({
        orderNumber: order.orderNumber,
        name,
        phone,
        productName: product.name,
        url: adminUrl,
      })).catch(err => console.error('Telegram notification error:', err)),
    ])

    return NextResponse.json({ orderNumber: order.orderNumber }, { status: 201 })
  } catch (error) {
    console.error('Preorder error:', error)
    return NextResponse.json({ error: 'Ошибка при оформлении предзаказа' }, { status: 500 })
  }
}

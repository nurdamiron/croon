import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mirrorSingleVariantStock } from '@/lib/variant-stock'
import { apiLimiter } from '@/lib/rate-limit'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = apiLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const order = await prisma.order.findFirst({
    where: { id, userId: (session.user as any).id },
    include: { items: { select: { productId: true, quantity: true } } },
  })

  if (!order) {
    return NextResponse.json({ error: 'Заказ не найден' }, { status: 404 })
  }

  if (order.status !== 'NEW') {
    return NextResponse.json({ error: 'Можно отменить только новый заказ' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    if (!order.isPreorder) {
      for (const item of order.items) {
        await tx.$executeRaw`
          UPDATE "Product"
          SET "totalStock" = "totalStock" + ${item.quantity},
              "inStock" = ("totalStock" + ${item.quantity}) > 0,
              "updatedAt" = now()
          WHERE id = ${item.productId}
        `
        await mirrorSingleVariantStock(item.productId, tx)
      }
    }

    await tx.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    })

    await tx.orderStatusLog.create({
      data: {
        orderId: id,
        status: 'CANCELLED',
        prevStatus: 'NEW',
        note: 'Отменён клиентом',
        cancelledBy: 'customer',
      },
    })
  })


  return NextResponse.json({ ok: true })
}

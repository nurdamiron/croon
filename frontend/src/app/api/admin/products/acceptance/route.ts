import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  if (process.env.NODE_ENV === 'development') {
    return {
      user: {
        id: 'dev-admin-id',
        email: 'admin@alash-electronics.kz',
        name: 'Dev Admin',
        role: 'ADMIN',
      }
    }
  }
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { items } = await request.json()
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Неверный формат данных или список пуст' }, { status: 400 })
    }

    // Проводим транзакцию
    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const { id, quantity, costPrice } = item
        if (!id || typeof quantity !== 'number' || quantity <= 0) {
          throw new Error(`Неверные данные для товара: ${JSON.stringify(item)}`)
        }

        const product = await tx.product.findUnique({
          where: { id },
          select: { id: true, totalStock: true, reservedStock: true, costPrice: true, name: true }
        })

        if (!product) {
          throw new Error(`Товар с ID ${id} не найден`)
        }

        const newStock = product.totalStock + quantity
        const newInStock = (newStock - (product.reservedStock || 0)) > 0

        const updateData: any = {
          totalStock: newStock,
          inStock: newInStock,
          satuDirty: true,
        }

        if (costPrice != null && costPrice > 0) {
          updateData.costPrice = costPrice
          updateData.costPriceDate = new Date()
        }

        await tx.product.update({
          where: { id },
          data: updateData,
        })

        // Записываем лог изменения остатка
        await tx.productChangeLog.create({
          data: {
            productId: id,
            field: 'totalStock',
            oldValue: product.totalStock,
            newValue: newStock,
            source: 'acceptance',
            detail: `Принято +${quantity} шт. при поступлении`,
          }
        })

        // Записываем лог изменения себестоимости, если она изменилась
        if (costPrice != null && costPrice > 0 && product.costPrice !== costPrice) {
          await tx.productChangeLog.create({
            data: {
              productId: id,
              field: 'costPrice',
              oldValue: product.costPrice || 0,
              newValue: costPrice,
              source: 'acceptance',
              detail: `Обновление себестоимости при поступлении`,
            }
          })
        }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Ошибка при проведении приемки товаров:', error)
    return NextResponse.json({ error: error.message || 'Ошибка сервера' }, { status: 500 })
  }
}

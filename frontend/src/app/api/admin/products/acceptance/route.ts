import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  if (process.env.NODE_ENV === 'development') {
    return {
      user: {
        id: 'dev-admin-id',
        email: 'admin@croon.kz',
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
  const session = await checkAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { items, batchName, supplierId, notes } = await request.json()
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Неверный формат данных или список пуст' }, { status: 400 })
    }

    // Валидация
    for (const item of items) {
      const { id, quantity, costPrice } = item
      if (!id || typeof quantity !== 'number' || quantity <= 0) {
        return NextResponse.json({ error: `Неверные данные для товара: ${JSON.stringify(item)}` }, { status: 400 })
      }
    }

    // Проводим транзакцию
    const result = await prisma.$transaction(async (tx) => {
      // Создаём запись приёмки (StockReceipt)
      const receipt = await tx.stockReceipt.create({
        data: {
          batchNumber: batchName?.trim() || null,
          name: batchName?.trim() || `Приёмка ${new Date().toLocaleDateString('ru-RU')}`,
          supplierId: supplierId || null,
          notes: notes?.trim() || null,
          totalItems: items.length,
          totalQty: items.reduce((s: number, i: any) => s + i.quantity, 0),
          totalCost: items.reduce((s: number, i: any) => s + i.quantity * (i.costPrice || 0), 0),
          createdBy: (session.user as any)?.id || null,
        },
      })

      for (const item of items) {
        const { id, quantity, costPrice } = item

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
            stockReceiptId: receipt.id,
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
              stockReceiptId: receipt.id,
            }
          })
        }
      }

      return receipt
    })

    return NextResponse.json({ success: true, receiptId: result.id })
  } catch (error: any) {
    console.error('Ошибка при проведении приемки товаров:', error)
    return NextResponse.json({ error: error.message || 'Ошибка сервера' }, { status: 500 })
  }
}

// GET — история приёмок (группированная по StockReceipt)
export async function GET(request: NextRequest) {
  const session = await checkAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const PAGE_SIZE = 20

  const [receipts, total] = await Promise.all([
    prisma.stockReceipt.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        supplier: { select: { id: true, name: true } },
        changeLogs: {
          select: {
            id: true,
            productId: true,
            field: true,
            oldValue: true,
            newValue: true,
            detail: true,
            product: { select: { name: true, sku: true, images: { select: { url: true }, take: 1 } } },
          },
        },
      },
    }),
    prisma.stockReceipt.count(),
  ])

  return NextResponse.json({
    receipts,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
  })
}

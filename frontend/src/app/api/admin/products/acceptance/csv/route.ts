import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  if (process.env.NODE_ENV === 'development') {
    return { user: { id: 'dev-admin-id', email: 'admin@croon.kz', name: 'Dev Admin', role: 'ADMIN' } }
  }
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

interface CsvRow {
  sku: string
  quantity: number
  costPrice: number | null
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []

  // Определяем разделитель (запятая, точка с запятой, таб)
  const firstLine = lines[0]
  const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''))
    if (cols.length < 2) continue

    const sku = cols[0]
    const quantity = parseInt(cols[1], 10)
    const costPrice = cols[2] ? parseFloat(cols[2].replace(/\s/g, '')) : null

    if (!sku || isNaN(quantity) || quantity <= 0) continue

    rows.push({ sku, quantity, costPrice: costPrice && costPrice > 0 ? costPrice : null })
  }

  return rows
}

// POST — парсинг CSV (dry-run: возвращает найденные товары без проведения)
// POST с action=apply — проводит приёмку
export async function POST(request: NextRequest) {
  const session = await checkAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const contentType = request.headers.get('content-type') || ''
    let csvText = ''
    let batchName = ''
    let supplierId = ''
    let notes = ''
    let apply = false

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'Файл не найден' }, { status: 400 })
      }
      csvText = await file.text()
      batchName = (formData.get('batchName') as string) || ''
      supplierId = (formData.get('supplierId') as string) || ''
      notes = (formData.get('notes') as string) || ''
      apply = formData.get('apply') === 'true'
    } else {
      const body = await request.json()
      csvText = body.csv || ''
      batchName = body.batchName || ''
      supplierId = body.supplierId || ''
      notes = body.notes || ''
      apply = body.apply === true
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: 'CSV пуст' }, { status: 400 })
    }

    const rows = parseCsv(csvText)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Не удалось распознать строки. Формат: sku,quantity,costPrice' }, { status: 400 })
    }

    // Ищем товары по SKU
    const skus = Array.from(new Set(rows.map((r) => r.sku)))
    const products = await prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, name: true, totalStock: true, reservedStock: true, costPrice: true, images: { select: { url: true }, take: 1 } },
    })

    const productBySku = new Map(products.map((p) => [p.sku, p]))

    const matched: any[] = []
    const notFound: string[] = []

    for (const row of rows) {
      const product = productBySku.get(row.sku)
      if (product) {
        matched.push({
          id: product.id,
          sku: product.sku,
          name: product.name,
          currentStock: product.totalStock,
          currentCost: product.costPrice,
          quantity: row.quantity,
          costPrice: row.costPrice,
          imageUrl: product.images[0]?.url || null,
        })
      } else {
        notFound.push(row.sku)
      }
    }

    // Dry-run: только парсинг
    if (!apply) {
      return NextResponse.json({
        matched,
        notFound,
        totalRows: rows.length,
        totalMatched: matched.length,
        totalNotFound: notFound.length,
      })
    }

    // Проводим приёмку
    if (matched.length === 0) {
      return NextResponse.json({ error: 'Нет товаров для приёмки' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.stockReceipt.create({
        data: {
          batchNumber: batchName?.trim() || null,
          name: batchName?.trim() || `CSV импорт ${new Date().toLocaleDateString('ru-RU')}`,
          supplierId: supplierId || null,
          notes: notes?.trim() || null,
          totalItems: matched.length,
          totalQty: matched.reduce((s: number, i: any) => s + i.quantity, 0),
          totalCost: matched.reduce((s: number, i: any) => s + i.quantity * (i.costPrice || 0), 0),
          createdBy: (session.user as any)?.id || null,
        },
      })

      for (const item of matched) {
        const product = await tx.product.findUnique({
          where: { id: item.id },
          select: { id: true, totalStock: true, reservedStock: true, costPrice: true },
        })
        if (!product) continue

        const newStock = product.totalStock + item.quantity
        const newInStock = (newStock - (product.reservedStock || 0)) > 0

        const updateData: any = {
          totalStock: newStock,
          inStock: newInStock,
        }

        if (item.costPrice != null && item.costPrice > 0) {
          updateData.costPrice = item.costPrice
          updateData.costPriceDate = new Date()
        }

        await tx.product.update({ where: { id: item.id }, data: updateData })

        await tx.productChangeLog.create({
          data: {
            productId: item.id,
            field: 'totalStock',
            oldValue: product.totalStock,
            newValue: newStock,
            source: 'acceptance',
            detail: `CSV: принято +${item.quantity} шт.`,
            stockReceiptId: receipt.id,
          },
        })

        if (item.costPrice != null && item.costPrice > 0 && product.costPrice !== item.costPrice) {
          await tx.productChangeLog.create({
            data: {
              productId: item.id,
              field: 'costPrice',
              oldValue: product.costPrice || 0,
              newValue: item.costPrice,
              source: 'acceptance',
              detail: `CSV: обновление себестоимости`,
              stockReceiptId: receipt.id,
            },
          })
        }
      }

      return receipt
    })

    return NextResponse.json({
      success: true,
      receiptId: result.id,
      processed: matched.length,
      notFound,
    })
  } catch (error: any) {
    console.error('Ошибка CSV импорта:', error)
    return NextResponse.json({ error: error.message || 'Ошибка сервера' }, { status: 500 })
  }
}

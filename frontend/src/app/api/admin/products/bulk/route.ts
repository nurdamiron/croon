import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { action, productIds, categoryIds, permanent } = await request.json()

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'No products selected' }, { status: 400 })
    }

    switch (action) {
      case 'addCategories': {
        if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
          return NextResponse.json({ error: 'No categories selected' }, { status: 400 })
        }
        // Connect categories to each product (many-to-many)
        await Promise.all(
          productIds.map(pid =>
            prisma.product.update({
              where: { id: pid },
              data: {
                categories: {
                  connect: categoryIds.map((cid: string) => ({ id: cid })),
                },
              },
            })
          )
        )
        return NextResponse.json({ ok: true, updated: productIds.length })
      }

      case 'removeCategories': {
        if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
          return NextResponse.json({ error: 'No categories selected' }, { status: 400 })
        }
        await Promise.all(
          productIds.map(pid =>
            prisma.product.update({
              where: { id: pid },
              data: {
                categories: {
                  disconnect: categoryIds.map((cid: string) => ({ id: cid })),
                },
              },
            })
          )
        )
        return NextResponse.json({ ok: true, updated: productIds.length })
      }

      case 'delete': {
        // По умолчанию «удалить» = АРХИВ для ВСЕХ выбранных (скрыть с сайта/Google/каналов).
        // permanent:true → физическое удаление (товары с историей продаж остаются в архиве).
        if (!permanent) {
          const r = await prisma.product.updateMany({ where: { id: { in: productIds } }, data: { archived: true, inStock: false } })
          await prisma.kaspiOffer.updateMany({ where: { productId: { in: productIds } }, data: { active: false } })
          await prisma.satuProduct.updateMany({ where: { productId: { in: productIds } }, data: { active: false } })
          return NextResponse.json({ ok: true, archived: r.count })
        }

        // permanent: товары с продажами на сайте (OrderItem) физически удалять нельзя —
        // оставляем в архиве; остальные удаляем по одному с обнулением nullable-FK.
        const withSales = await prisma.orderItem.findMany({
          where: { productId: { in: productIds } },
          select: { productId: true },
          distinct: ['productId'],
        })
        const blockedIds = new Set(withSales.map((x) => x.productId).filter(Boolean) as string[])
        const deletable = productIds.filter((id: string) => !blockedIds.has(id))

        let deleted = 0
        for (const id of deletable) {
          try {
            await prisma.$transaction([
              prisma.kaspiOrderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
              prisma.satuOrderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
              prisma.ba3arOrderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
              prisma.ba3arOrderViewedProduct.updateMany({ where: { productId: id }, data: { productId: null } }),
              prisma.orderViewedProduct.deleteMany({ where: { productId: id } }),
              prisma.satuProduct.deleteMany({ where: { productId: id } }),
              prisma.product.delete({ where: { id } }),
            ])
            deleted++
          } catch {
            blockedIds.add(id) // не удалился → оставляем в архиве
          }
        }
        // товары с историей оставляем в архиве (на всякий — гарантируем archived=true)
        const stayArchived = Array.from(blockedIds)
        if (stayArchived.length) {
          await prisma.product.updateMany({ where: { id: { in: stayArchived } }, data: { archived: true, inStock: false } })
        }
        return NextResponse.json({
          ok: true,
          deleted,
          skipped: stayArchived.length,
          skippedReason: stayArchived.length > 0 ? 'есть продажи на сайте — оставлены в архиве (удаление сломало бы аналитику).' : undefined,
        })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (err: any) {
    console.error('Bulk action error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}

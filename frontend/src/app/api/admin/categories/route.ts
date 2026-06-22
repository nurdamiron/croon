import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true, allProducts: true } } },
  })

  // Build recursive product counts (include both direct categoryId and many-to-many)
  const catMap = new Map(categories.map(c => [c.id, c]))
  const getDirectCount = (id: string): number => {
    const c = catMap.get(id)
    return (c?._count.products || 0) + (c?._count.allProducts || 0)
  }
  const getDescendantCount = (id: string): number => {
    let count = getDirectCount(id)
    for (const c of categories) {
      if (c.parentId === id) count += getDescendantCount(c.id)
    }
    return count
  }
  const result = categories.map(c => ({
    ...c,
    _count: { products: getDescendantCount(c.id) },
  }))

  return NextResponse.json({ categories: result })
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, slug, parentId, description, isHidden, sortOrder } = await request.json()

  const category = await prisma.category.create({
    data: {
      id: `cat_${Date.now()}`,
      name,
      slug,
      parentId: parentId || null,
      description: description || null,
      isHidden: isHidden || false,
      sortOrder: sortOrder || 0,
    },
  })

  return NextResponse.json(category, { status: 201 })
}

export async function PUT(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, name, slug, parentId, description, isHidden, sortOrder, imageUrl } = await request.json()

  const category = await prisma.category.update({
    where: { id },
    data: {
      name,
      slug,
      parentId: parentId || null,
      description: description || null,
      isHidden: isHidden ?? false,
      sortOrder: sortOrder ?? 0,
      ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
    },
  })

  return NextResponse.json(category)
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await request.json()

  // Move products to "Без категории" before deleting
  const UNCATEGORIZED_ID = 'uncategorized'
  if (id !== UNCATEGORIZED_ID) {
    // Move direct products
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: UNCATEGORIZED_ID },
    })
    // Move child categories' products too
    const children = await prisma.category.findMany({ where: { parentId: id }, select: { id: true } })
    for (const child of children) {
      await prisma.product.updateMany({
        where: { categoryId: child.id },
        data: { categoryId: UNCATEGORIZED_ID },
      })
    }
    // Re-parent child categories to deleted category's parent
    const cat = await prisma.category.findUnique({ where: { id }, select: { parentId: true } })
    await prisma.category.updateMany({
      where: { parentId: id },
      data: { parentId: cat?.parentId || null },
    })
  }

  await prisma.category.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

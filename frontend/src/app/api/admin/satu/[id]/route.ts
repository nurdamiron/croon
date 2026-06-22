import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// PATCH /api/admin/satu/:id — привязка к товару Alash, активность.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await request.json()
  const data: any = {}
  if (body.productId !== undefined) {
    if (body.productId === null) {
      data.productId = null
    } else {
      const product = await prisma.product.findUnique({ where: { id: String(body.productId) }, select: { id: true } })
      if (!product) return NextResponse.json({ error: 'Product не найден' }, { status: 404 })
      data.productId = product.id
    }
  }
  if (typeof body.active === 'boolean') data.active = body.active

  const updated = await prisma.satuProduct.update({ where: { id: params.id }, data })
  return NextResponse.json({ satuProduct: updated })
}

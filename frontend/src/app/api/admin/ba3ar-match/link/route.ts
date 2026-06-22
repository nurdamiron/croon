import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const S3IMG = 'https://alashed-media.s3.eu-north-1.amazonaws.com'

async function checkAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'ADMIN') return null
  return session
}

// POST /api/admin/ba3ar-match/link
// body: { id, alashId } — вручную привязать запись ba3ar к товару Alash.
// Запись становится matched/confirmed, подтягиваются данные карточки Alash.
export async function POST(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id, alashId } = await request.json()
  if (!id || !alashId) return NextResponse.json({ error: 'id и alashId обязательны' }, { status: 400 })

  const product = await prisma.product.findUnique({
    where: { id: String(alashId) },
    select: { id: true, name: true, price: true, description: true, images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 } },
  })
  if (!product) return NextResponse.json({ error: 'Товар Alash не найден' }, { status: 404 })

  let img = product.images[0]?.url || null
  if (img && !img.startsWith('http')) img = `${S3IMG}/${img.replace(/^\//, '')}`

  const updated = await prisma.ba3arMatch.update({
    where: { id: String(id) },
    data: {
      kind: 'matched',
      status: 'confirmed',
      alashId: product.id,
      alashName: product.name,
      alashImage: img,
      alashPrice: product.price != null ? Math.round(product.price) : null,
      alashDesc: product.description ? product.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : null,
      score: 1,
    },
  })
  return NextResponse.json({ match: updated })
}

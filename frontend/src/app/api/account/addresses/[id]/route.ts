import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return session.user as any
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const existing = await prisma.address.findFirst({ where: { id, userId: user.id } })
  if (!existing) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })

  const { label, address, city, isDefault } = body

  if (label !== undefined && (typeof label !== 'string' || label.length > 50)) {
    return NextResponse.json({ error: 'Некорректное название' }, { status: 400 })
  }
  if (address !== undefined && (typeof address !== 'string' || address.length > 300)) {
    return NextResponse.json({ error: 'Некорректный адрес' }, { status: 400 })
  }

  if (isDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
  }

  const updated = await prisma.address.update({
    where: { id },
    data: {
      ...(label !== undefined && { label: label.trim() }),
      ...(address !== undefined && { address: address.trim() }),
      ...(city !== undefined && { city: city?.trim() || null }),
      ...(isDefault !== undefined && { isDefault }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const { id } = await params

  const existing = await prisma.address.findFirst({ where: { id, userId: user.id } })
  if (!existing) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })

  await prisma.address.delete({ where: { id } })

  // If deleted the default, make the first remaining one default
  if (existing.isDefault) {
    const first = await prisma.address.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
    if (first) await prisma.address.update({ where: { id: first.id }, data: { isDefault: true } })
  }

  return NextResponse.json({ ok: true })
}

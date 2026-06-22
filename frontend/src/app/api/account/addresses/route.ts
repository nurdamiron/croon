import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function getUser(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  return session.user as any
}

export async function GET(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const addresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(addresses)
}

export async function POST(request: NextRequest) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const body = await request.json()
  const { label, address, city, isDefault } = body

  if (!label || typeof label !== 'string' || label.length > 50) {
    return NextResponse.json({ error: 'Некорректное название' }, { status: 400 })
  }
  if (!address || typeof address !== 'string' || address.length > 300) {
    return NextResponse.json({ error: 'Некорректный адрес' }, { status: 400 })
  }

  const count = await prisma.address.count({ where: { userId: user.id } })
  if (count >= 10) {
    return NextResponse.json({ error: 'Максимум 10 адресов' }, { status: 400 })
  }

  const setDefault = isDefault || count === 0

  if (setDefault) {
    await prisma.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
  }

  const created = await prisma.address.create({
    data: {
      userId: user.id,
      label: label.trim(),
      address: address.trim(),
      city: city?.trim() || null,
      isDefault: setDefault,
    },
  })

  return NextResponse.json(created)
}

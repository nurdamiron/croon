import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apiLimiter } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const blocked = apiLimiter(request)
  if (blocked) return blocked
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { name: true, email: true, phone: true, emailNotifications: true },
  })

  return NextResponse.json(user)
}

export async function PUT(request: NextRequest) {
  const blocked = apiLimiter(request)
  if (blocked) return blocked
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }

  const body = await request.json()
  const { name, phone, emailNotifications } = body

  if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
    return NextResponse.json({ error: 'Некорректное имя' }, { status: 400 })
  }
  if (phone !== undefined && (typeof phone !== 'string' || phone.length > 30)) {
    return NextResponse.json({ error: 'Некорректный телефон' }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: (session.user as any).id },
    data: {
      ...(name !== undefined && { name: name.trim() || null }),
      ...(phone !== undefined && { phone: phone.trim() || null }),
      ...(emailNotifications !== undefined && { emailNotifications: Boolean(emailNotifications) }),
    },
    select: { name: true, email: true, phone: true, emailNotifications: true },
  })

  return NextResponse.json(updated)
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { authLimiter } from '@/lib/rate-limit'
import bcrypt from 'bcryptjs'

export async function PATCH(request: NextRequest) {
  const limited = authLimiter(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = await request.json()

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: 'Все поля обязательны' }, { status: 400 })
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Пароль должен быть не менее 8 символов' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { passwordHash: true },
  })

  if (!user?.passwordHash) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Неверный текущий пароль' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: (session.user as any).id },
    data: { passwordHash: hashed },
  })

  return NextResponse.json({ ok: true })
}

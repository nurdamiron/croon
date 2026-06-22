import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forgotPasswordLimiter } from '@/lib/rate-limit'
import { sendPasswordReset } from '@/lib/email'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const limited = forgotPasswordLimiter(request)
  if (limited) return limited

  const { email } = await request.json()

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email обязателен' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })

  // Always return 200 — don't leak whether email exists
  if (!user) {
    return NextResponse.json({ ok: true })
  }

  // Delete all existing tokens for this user (prevents accumulation + race condition from double-submit)
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } })

  const token = crypto.randomBytes(32).toString('hex')
  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  })

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`
  sendPasswordReset({ to: user.email, resetUrl }).catch(console.error)

  return NextResponse.json({ ok: true })
}

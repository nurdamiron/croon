import { NextRequest } from 'next/server'
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'
import { authLimiter } from '@/lib/rate-limit'

const nextAuth = NextAuth(authOptions)

export { nextAuth as GET }

export async function POST(request: NextRequest, context: any) {
  // Rate limit login/callback POST requests
  const blocked = authLimiter(request)
  if (blocked) return blocked

  return nextAuth(request, context)
}

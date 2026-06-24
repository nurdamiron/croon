import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/middleware'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const whitelistedPaths = [
    '/client_account/login',
    '/forgot-password',
    '/reset-password',
  ]
  const isAllowed = whitelistedPaths.includes(pathname) || pathname.startsWith('/admin')

  if (!isAllowed) {
    return NextResponse.redirect(new URL('/admin', request.nextUrl))
  }

  return createClient(request)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
}

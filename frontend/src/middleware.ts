import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public paths that don't require auth
  const publicPaths = [
    '/client_account/login',
    '/forgot-password',
    '/reset-password',
    '/api/',
  ]
  const isPublic = publicPaths.some(p => pathname.startsWith(p)) ||
    pathname.match(/\.(png|jpg|svg|ico|css|js|woff2?)$/)

  if (isPublic) return NextResponse.next()

  // Check NextAuth session token
  const token = request.cookies.get('next-auth.session-token')?.value ||
                request.cookies.get('__Secure-next-auth.session-token')?.value

  // Unauthenticated → login
  if (!token) {
    return NextResponse.redirect(new URL('/client_account/login', request.nextUrl))
  }

  // Authenticated on root → admin
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/admin', request.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest).*)'],
}

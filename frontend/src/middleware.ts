import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Canonical: /collection/{cat}/product/{slug} → /product/{slug}
  const collectionProduct = pathname.match(/^\/collection\/[^/]+\/product\/(.+)$/)
  if (collectionProduct) {
    return NextResponse.redirect(new URL(`/product/${collectionProduct[1]}`, request.nextUrl), 301)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
}

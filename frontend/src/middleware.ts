import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // Old InSales /collection/{cat}/product/{slug} URLs — redirect to /product/{slug} in one hop,
  // stripping any legacy params (?lang=, etc.) at the same time.
  // Must be checked before next.config.js redirects would fire, so we handle it here to avoid
  // a two-hop chain for URLs that also carry ?lang=kz.
  const insalesMatch = pathname.match(/^\/collection\/[^/]+\/product\/([^/]+)$/)
  if (insalesMatch) {
    const url = request.nextUrl.clone()
    url.pathname = `/product/${insalesMatch[1]}`
    url.search = ''
    return NextResponse.redirect(url, { status: 301 })
  }

  const page = searchParams.get('page')
  const sort = searchParams.get('sort')
  const lang = searchParams.get('lang')

  // Strip legacy InSales params and canonical deduplication
  if (page === '1' || sort === 'default' || lang !== null) {
    const url = request.nextUrl.clone()
    if (page === '1') url.searchParams.delete('page')
    if (sort === 'default') url.searchParams.delete('sort')
    if (lang !== null) url.searchParams.delete('lang')
    return NextResponse.redirect(url, { status: 301 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|sw\\.js|manifest|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
}

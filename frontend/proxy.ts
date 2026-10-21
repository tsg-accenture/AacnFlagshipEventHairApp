import { NextResponse, type NextRequest } from 'next/server'

// Optimistic check only (Next.js 16 "proxy", formerly middleware): no session cookie means sign in first.
// The real check happens in FastAPI on every API call.
export function proxy(request: NextRequest) {
  if (!request.cookies.has('crown_session')) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/today/:path*', '/start/:path*', '/check-in/:path*', '/wash-day/:path*', '/journal/:path*', '/goals/:path*',
    '/ask/:path*', '/map/:path*', '/check/:path*', '/take-down/:path*', '/get-checked/:path*', '/stylist-note/:path*',
    '/settings/:path*', '/privacy/:path*', '/plan/:path*',
  ],
}

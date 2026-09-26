import { getSessionCookie } from 'better-auth/cookies'
import { type NextRequest, NextResponse } from 'next/server'

// Next 16 proxy. Only a cheap cookie-presence check that redirects signed-out visitors to
// sign-in: no DB, no session validation (docs/07 §2). Services re-check every request.

export function proxy(request: NextRequest) {
  if (getSessionCookie(request, { cookiePrefix: 'tokslearn' })) return NextResponse.next()
  const url = new URL('/sign-in', request.url)
  url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
  return NextResponse.redirect(url)
}

export const config = {
  // `/teach` itself is the public instructor landing page; the studio lives under it.
  matcher: ['/learn/:path*', '/account/:path*', '/teach/:path+', '/admin/:path*'],
}

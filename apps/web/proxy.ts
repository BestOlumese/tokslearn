import { type NextRequest, NextResponse } from 'next/server'

// Next 16 proxy (formerly middleware). Only cheap cookie-presence redirects live here: no DB,
// no business logic (docs/07 §2). Matches signed-in areas only, so public pages stay on the CDN.

const SESSION_COOKIES = ['__Secure-tokslearn.session_token', 'tokslearn.session_token']

export function proxy(request: NextRequest) {
  // Phase 1 turns this on once Better Auth issues the session cookie.
  const authEnabled = false
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name))
  if (authEnabled && !hasSession) {
    const url = new URL('/sign-in', request.url)
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/learn/:path*', '/account/:path*', '/teach/:path*', '/admin/:path*'],
}

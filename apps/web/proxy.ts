import { getSessionCookie } from 'better-auth/cookies'
import { type NextRequest, NextResponse } from 'next/server'

// Next 16 proxy. Two jobs, both cheap (no DB, no session validation, docs/07 §2):
// 1. Signed-in areas: redirect visitors without a session cookie to sign-in. Services
//    re-check every request.
// 2. `/courses` with a query string is rewritten to /course-results, so the plain listing stays
//    fully static (ADR-032). The address bar keeps /courses?….

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (pathname === '/courses') {
    return search
      ? NextResponse.rewrite(new URL(`/course-results${search}`, request.url))
      : NextResponse.next()
  }
  if (getSessionCookie(request, { cookiePrefix: 'tokslearn' })) return NextResponse.next()
  const url = new URL('/sign-in', request.url)
  url.searchParams.set('next', pathname + search)
  return NextResponse.redirect(url)
}

export const config = {
  // `/teach` itself is the public instructor landing page; the studio lives under it.
  matcher: ['/courses', '/learn/:path*', '/account/:path*', '/teach/:path+', '/admin/:path*'],
}

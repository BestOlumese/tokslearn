import { type NextRequest, NextResponse } from 'next/server'
import { getAuth } from '@/lib/auth'
import { safeNext } from '@/lib/auth-client'

// Starts Google sign-in from a plain link (no client JS on the auth pages, docs/12 §1).
// Better Auth sets its OAuth state cookie; we pass it on with the redirect to Google.
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get('next'))
  const res = await getAuth().api.signInSocial({
    body: {
      provider: 'google',
      callbackURL: next,
      newUserCallbackURL: next,
      errorCallbackURL: '/sign-in?error=google',
    },
    headers: request.headers,
    asResponse: true,
  })
  const body = (await res.json().catch(() => null)) as { url?: string } | null
  if (!res.ok || !body?.url) {
    return NextResponse.redirect(new URL('/sign-in?error=google', request.url), 303)
  }
  const redirect = NextResponse.redirect(body.url, 303)
  for (const cookie of res.headers.getSetCookie()) redirect.headers.append('set-cookie', cookie)
  return redirect
}

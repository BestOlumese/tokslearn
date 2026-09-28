import * as commerce from '@tokslearn/core/commerce'
import { isUser } from '@tokslearn/core/kernel'
import { cookies } from 'next/headers'
import { ANON_COOKIE, ANON_MAX_AGE, readAnonymousId } from '@/lib/anonymous-id'
import { getServerCtx } from '@/lib/server-ctx'

// Referral link `/r/{code}` (docs/20): records the visit for 30-day attribution, then sends the
// visitor to the course or the instructor's profile. Unknown codes go home. The only cookie set
// is a random browser id; the attribution itself is stored on our side.

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const jar = await cookies()
  const anonymousId = readAnonymousId(jar.get(ANON_COOKIE)?.value) ?? crypto.randomUUID()
  const ctx = await getServerCtx()
  const target = await commerce.recordReferralVisit(ctx, {
    code,
    anonymousId,
    userId: isUser(ctx.actor) ? ctx.actor.userId : null,
  })
  const response = Response.redirect(new URL(target?.path ?? '/', request.url), 302)
  const headers = new Headers(response.headers)
  headers.append(
    'set-cookie',
    `${ANON_COOKIE}=${anonymousId}; Path=/; Max-Age=${ANON_MAX_AGE}; HttpOnly; SameSite=Lax${request.url.startsWith('https') ? '; Secure' : ''}`,
  )
  headers.set('cache-control', 'no-store')
  return new Response(null, { status: 302, headers })
}

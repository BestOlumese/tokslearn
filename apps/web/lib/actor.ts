import 'server-only'
import { loadUserActor } from '@tokslearn/core/identity'
import { type Actor, anonymousActor } from '@tokslearn/core/kernel'
import { getDb } from '@tokslearn/db'
import { getAuth } from './auth'

/**
 * Session → Actor for web (cookie) and mobile (Authorization: Bearer) alike. The cookie cache is
 * bypassed so a revoked or suspended session stops working at once, not after 5 minutes; the
 * lookup hits Redis. Roles and 2FA freshness come from Postgres (docs/07).
 */
export async function resolveActor(headers: Headers): Promise<Actor> {
  const result = await getAuth().api.getSession({ headers, query: { disableCookieCache: true } })
  if (!result) return anonymousActor
  return loadUserActor(getDb(), {
    userId: result.user.id,
    sessionId: result.session.id,
    emailVerified: result.user.emailVerified,
    twoFactorEnabled: Boolean(result.user.twoFactorEnabled),
  })
}

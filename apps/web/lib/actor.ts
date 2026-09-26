import 'server-only'
import { type Actor, anonymousActor } from '@tokslearn/core/kernel'

/**
 * Session → Actor. Phase 1 replaces this with a Better Auth lookup (cookie on web, bearer on
 * mobile) plus the user's roles from `user_roles`. Until then everyone is anonymous.
 */
export async function resolveActor(_headers: Headers): Promise<Actor> {
  return anonymousActor
}

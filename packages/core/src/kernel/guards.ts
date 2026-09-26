import { type Actor, isUser, staffSecurityProblem, type UserActor } from './actor'
import { ForbiddenError, RuleViolationError } from './errors'

/** Signed-in user or SESSION_EXPIRED. */
export function requireUser(actor: Actor): UserActor {
  if (!isUser(actor)) throw new RuleViolationError('SESSION_EXPIRED')
  return actor
}

/**
 * Staff action guard (docs/07 §3–4): the rule must pass, the account must have 2FA on, and this
 * session must have passed a 2FA check. The service layer calls this; UI checks are cosmetic.
 */
export function requireStaff(actor: Actor, allowed: (actor: UserActor) => boolean): UserActor {
  const user = requireUser(actor)
  if (!allowed(user)) throw new ForbiddenError('STAFF_ONLY')
  const problem = staffSecurityProblem(user)
  if (problem) throw new ForbiddenError(problem)
  return user
}

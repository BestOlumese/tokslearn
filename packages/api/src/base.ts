import { implement } from '@orpc/server'
import { contract, IDEMPOTENCY_HEADER } from '@tokslearn/contract'
import * as admin from '@tokslearn/core/admin'
import {
  type Actor,
  actorUserId,
  type Ctx,
  createCtx,
  ForbiddenError,
  hasRecentStepUp,
  hasRole,
  type Role,
  RuleViolationError,
  requireStaff,
  requireUser,
} from '@tokslearn/core/kernel'
import type { ApiContext } from './context'
import { toApiError } from './errors'
import { idempotentProcedures, policyFor } from './ratelimits'
import { stableHash } from './stable-hash'

const impl = implement(contract).$context<ApiContext>()

/** Outermost: every error leaves the API with a stable `data.code`. Wraps input validation. */
const errorMapping = impl.middleware(async ({ context, next }) => {
  try {
    return await next()
  } catch (error) {
    throw toApiError(error, context.requestId)
  }
})

/** Resolves the actor and builds the core `Ctx` once per call. */
const withCtx = impl.middleware(async ({ context, next }) => {
  const actor = await context.resolveActor()
  const ctx = createCtx({
    actor,
    db: context.db,
    requestId: context.requestId,
    ipHash: context.ipHash,
    cache: context.cache,
    providers: context.providers,
    ...(context.onOutboxWritten ? { onOutboxWritten: context.onOutboxWritten } : {}),
  })
  return next({ context: { ctx, actor } })
})

const rateLimit = impl
  .$context<ApiContext & { actor: Actor }>()
  .middleware(async ({ context, next, path }) => {
    const { bucket, policy } = policyFor(path)
    const who = actorUserId(context.actor) ?? context.ipHash ?? 'unknown'
    const result = await context.rateLimiter.check(bucket, who, policy)
    if (!result.allowed) {
      throw new RuleViolationError('RATE_LIMITED', { retryAfterSec: result.retryAfterSec })
    }
    return next()
  })

/** Replays stored responses for repeated Idempotency-Key requests (docs/06 §3.5). */
const idempotency = impl
  .$context<ApiContext & { ctx: Ctx; actor: Actor }>()
  .middleware(async ({ context, next, path }, input) => {
    const name = path.join('.')
    const clientKey = context.headers.get(IDEMPOTENCY_HEADER)
    if (!clientKey || !idempotentProcedures.has(name)) return next()

    const owner = actorUserId(context.actor) ?? context.ipHash ?? 'anon'
    const key = `${name}:${owner}:${clientKey.slice(0, 200)}`
    const claim = await admin.claimIdempotencyKey(context.ctx, {
      key,
      scope: name,
      requestHash: stableHash(name, input),
    })
    if (claim.kind === 'replay') {
      return { output: claim.response as never, context: {} }
    }
    try {
      const result = await next()
      await admin.completeIdempotencyKey(context.ctx, key, result.output)
      return result
    } catch (error) {
      await admin.releaseIdempotencyKey(context.ctx, key)
      throw error
    }
  })

/** Anyone, including signed-out visitors. Authorization still happens in core. */
export const pub = impl.use(errorMapping).use(withCtx).use(rateLimit).use(idempotency)

/** Requires a signed-in user (cookie on web, bearer token on mobile). */
export const authed = pub.use(async ({ context, next }) =>
  next({ context: { user: requireUser(context.actor) } }),
)

/** Signed in with one of these roles. Core rules still decide what the user may touch. */
export const role = (...roles: Role[]) =>
  authed.use(async ({ context, next }) => {
    if (!hasRole(context.user, ...roles)) throw new ForbiddenError('FORBIDDEN')
    return next()
  })

/** Staff with one of these roles, 2FA on and verified in this session (docs/07 §3–4). */
export const staff = (...roles: Role[]) =>
  authed.use(async ({ context, next }) => {
    requireStaff(context.user, (u) => hasRole(u, ...roles))
    return next()
  })

/** Sensitive actions: 2FA verified within the last 12 hours (docs/07 §4). */
export const stepUp = authed.use(async ({ context, next }) => {
  if (!context.user.twoFactorEnabled) throw new ForbiddenError('TWO_FACTOR_REQUIRED')
  if (!hasRecentStepUp(context.user, context.ctx.now)) throw new ForbiddenError('STEP_UP_REQUIRED')
  return next()
})

export { impl }

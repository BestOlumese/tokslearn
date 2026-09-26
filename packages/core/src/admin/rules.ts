import { type Actor, hasRole, isStaff } from '../kernel/actor'

// Pure authorization rules (docs/03 §4). Services call these; the UI may call them too, but only
// the service check is binding.

export const canManageFeatureFlags = (actor: Actor): boolean =>
  hasRole(actor, 'admin', 'super_admin')

export const canViewAuditLog = (actor: Actor): boolean => hasRole(actor, 'admin', 'super_admin')

export const canViewStyleguide = (actor: Actor): boolean => isStaff(actor)

/** Outbox delivery is a background job; only system actors may run it. */
export const canDispatchOutbox = (actor: Actor): boolean => actor.kind === 'system'

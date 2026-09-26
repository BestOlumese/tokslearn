import { type Actor, hasRole, type Role, type UserActor } from '../kernel/actor'

// Pure authorization rules for identity (docs/07 §3). Services call them; UI checks are cosmetic.

export const canViewUsers = (actor: UserActor): boolean =>
  hasRole(actor, 'support', 'admin', 'super_admin')

export const canRevokeUserSessions = canViewUsers

export const canBanUsers = (actor: UserActor): boolean => hasRole(actor, 'admin', 'super_admin')

export const canViewAuditLog = (actor: UserActor): boolean => hasRole(actor, 'admin', 'super_admin')

/** Admins manage staff roles; only super admins grant or remove admin and super admin. */
export function canManageRole(actor: UserActor, role: Role): boolean {
  if (role === 'learner') return false
  if (role === 'admin' || role === 'super_admin') return hasRole(actor, 'super_admin')
  return hasRole(actor, 'admin', 'super_admin')
}

/** Nobody acts on their own account through admin tools, and admins can't touch super admins. */
export function canActOnUser(actor: UserActor, targetId: string, targetRoles: ReadonlyArray<Role>) {
  if (actor.userId === targetId) return false
  if (targetRoles.includes('super_admin') && !hasRole(actor, 'super_admin')) return false
  return true
}

const staffOrder: ReadonlyArray<Role> = ['super_admin', 'admin', 'finance', 'support', 'reviewer']

/** Value mirrored into Better Auth's `user.role` for its admin plugin (docs/07 §3). */
export function mirroredRole(roles: ReadonlyArray<Role>): string {
  return (
    staffOrder.find((r) => roles.includes(r)) ??
    (roles.includes('instructor') ? 'instructor' : 'learner')
  )
}

export const isSignedIn = (actor: Actor): actor is UserActor => actor.kind === 'user'

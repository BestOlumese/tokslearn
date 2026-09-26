/** Platform roles (docs/05 §2 `user_roles`). TA is a per-course assignment, not a role. */
export const roles = [
  'learner',
  'instructor',
  'reviewer',
  'finance',
  'support',
  'admin',
  'super_admin',
] as const
export type Role = (typeof roles)[number]

export const staffRoles: ReadonlyArray<Role> = [
  'reviewer',
  'finance',
  'support',
  'admin',
  'super_admin',
]

export interface UserSecurity {
  emailVerified: boolean
  twoFactorEnabled: boolean
  /** When this session last passed a TOTP/backup-code check; null if never. */
  twoFactorVerifiedAt: Date | null
}

export type Actor =
  | { kind: 'anonymous' }
  | ({
      kind: 'user'
      userId: string
      roles: ReadonlyArray<Role>
      sessionId: string
    } & UserSecurity)
  | { kind: 'system'; reason: string }

export type UserActor = Extract<Actor, { kind: 'user' }>

export const anonymousActor: Actor = { kind: 'anonymous' }
export const systemActor = (reason: string): Actor => ({ kind: 'system', reason })

export const isUser = (actor: Actor): actor is UserActor => actor.kind === 'user'

export const hasRole = (actor: Actor, ...wanted: Role[]): boolean =>
  isUser(actor) && actor.roles.some((r) => wanted.includes(r))

export const isStaff = (actor: Actor): boolean => hasRole(actor, ...staffRoles)

/** Staff actions need 2FA on the account and verified in this session (docs/07 §4). */
export type StaffSecurityProblem = 'TWO_FACTOR_REQUIRED' | 'STEP_UP_REQUIRED' | null

export function staffSecurityProblem(actor: UserActor): StaffSecurityProblem {
  if (!actor.twoFactorEnabled) return 'TWO_FACTOR_REQUIRED'
  if (!actor.twoFactorVerifiedAt) return 'STEP_UP_REQUIRED'
  return null
}

export const STEP_UP_WINDOW_MS = 12 * 60 * 60 * 1000

/** Sensitive actions (payout accounts, role changes) need 2FA verified in the last 12 h. */
export function hasRecentStepUp(actor: UserActor, now: Date): boolean {
  return (
    actor.twoFactorEnabled &&
    actor.twoFactorVerifiedAt !== null &&
    now.getTime() - actor.twoFactorVerifiedAt.getTime() <= STEP_UP_WINDOW_MS
  )
}

/** Id recorded in audit rows: the user id, or null for system/anonymous actors. */
export const actorUserId = (actor: Actor): string | null => (isUser(actor) ? actor.userId : null)

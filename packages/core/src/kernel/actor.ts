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

export type Actor =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; roles: ReadonlyArray<Role>; sessionId: string }
  | { kind: 'system'; reason: string }

export type UserActor = Extract<Actor, { kind: 'user' }>

export const anonymousActor: Actor = { kind: 'anonymous' }
export const systemActor = (reason: string): Actor => ({ kind: 'system', reason })

export const isUser = (actor: Actor): actor is UserActor => actor.kind === 'user'

export const hasRole = (actor: Actor, ...wanted: Role[]): boolean =>
  isUser(actor) && actor.roles.some((r) => wanted.includes(r))

export const isStaff = (actor: Actor): boolean => hasRole(actor, ...staffRoles)

/** Id recorded in audit rows: the user id, or null for system/anonymous actors. */
export const actorUserId = (actor: Actor): string | null => (isUser(actor) ? actor.userId : null)

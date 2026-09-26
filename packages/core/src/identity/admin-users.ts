import { writeAudit } from '../admin'
import type { Role } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireStaff } from '../kernel/guards'
import * as repo from './repo'
import {
  canActOnUser,
  canBanUsers,
  canManageRole,
  canRevokeUserSessions,
  canViewUsers,
  mirroredRole,
} from './rules'
import { DELETION_GRACE_DAYS, type SessionView, toSessionView } from './service'

const DAY_MS = 24 * 60 * 60 * 1000

export interface AdminUserRow {
  id: string
  name: string
  email: string
  username: string | null
  roles: Role[]
  emailVerified: boolean
  twoFactorEnabled: boolean
  banned: boolean
  deletionScheduledFor: Date | null
  createdAt: Date
}

const toRow = (u: repo.UserRow, roles: Role[]): AdminUserRow => ({
  id: u.id,
  name: u.name,
  email: u.email,
  username: u.username,
  roles,
  emailVerified: u.emailVerified,
  twoFactorEnabled: u.twoFactorEnabled ?? false,
  banned: u.banned ?? false,
  deletionScheduledFor: u.deletionRequestedAt
    ? new Date(u.deletionRequestedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS)
    : null,
  createdAt: u.createdAt,
})

export async function searchUsers(
  ctx: Ctx,
  filters: {
    q?: string | undefined
    role?: Role | undefined
    cursor?: string | undefined
    limit: number
  },
) {
  requireStaff(ctx.actor, canViewUsers)
  const { rows, nextCursor } = await repo.searchUsers(ctx.db, filters)
  const roles = await repo.rolesOfMany(
    ctx.db,
    rows.map((r) => r.id),
  )
  return { items: rows.map((u) => toRow(u, roles.get(u.id) ?? [])), nextCursor }
}

export async function getUserDetail(ctx: Ctx, userId: string) {
  requireStaff(ctx.actor, canViewUsers)
  const user = await repo.getUser(ctx.db, userId)
  if (!user) throw new NotFoundError('USER_NOT_FOUND')
  const [roles, sessions, audit] = await Promise.all([
    repo.rolesOf(ctx.db, userId),
    repo.activeSessionsOf(ctx.db, userId, ctx.now),
    repo.listAuditFor(ctx.db, 'user', userId, 20),
  ])
  return {
    ...toRow(user, roles),
    headline: user.headline,
    banReason: user.banReason,
    sessions: sessions.map((s): Omit<SessionView, 'current'> => {
      const { current: _current, ...rest } = toSessionView(s, null)
      return rest
    }),
    audit,
  }
}

async function loadTarget(ctx: Ctx, userId: string) {
  const user = await repo.getUser(ctx.db, userId)
  if (!user || user.deletedAt) throw new NotFoundError('USER_NOT_FOUND')
  return { user, roles: await repo.rolesOf(ctx.db, userId) }
}

/** Suspends or restores a user. Suspending signs them out everywhere (docs/20 §6). */
export async function setBanned(
  ctx: Ctx,
  input: { userId: string; banned: boolean; reason: string },
): Promise<void> {
  const actor = requireStaff(ctx.actor, canBanUsers)
  const target = await loadTarget(ctx, input.userId)
  if (!canActOnUser(actor, input.userId, target.roles)) throw new ForbiddenError()
  if ((target.user.banned ?? false) === input.banned) return

  await inTransaction(ctx, async (tx) => {
    await repo.updateUser(tx.db, input.userId, {
      banned: input.banned,
      banReason: input.banned ? input.reason : null,
      banExpires: null,
    })
    await writeAudit(tx, {
      action: input.banned ? 'user.ban' : 'user.unban',
      targetType: 'user',
      targetId: input.userId,
      before: { banned: target.user.banned ?? false },
      after: { banned: input.banned, reason: input.reason },
    })
    await tx.events.emit('user.banned', { userId: input.userId, banned: input.banned })
  })
  if (input.banned) await provider(ctx, 'sessions').revokeAllSessions(input.userId)
}

/** Grants or removes one role, mirrors the highest role for Better Auth, audits with a reason. */
export async function setRole(
  ctx: Ctx,
  input: { userId: string; role: Role; granted: boolean; reason: string },
): Promise<Role[]> {
  const actor = requireStaff(ctx.actor, (a) => canManageRole(a, input.role))
  const target = await loadTarget(ctx, input.userId)
  if (!canActOnUser(actor, input.userId, target.roles)) throw new ForbiddenError()
  const has = target.roles.includes(input.role)
  if (has === input.granted) return target.roles

  return inTransaction(ctx, async (tx) => {
    if (input.granted) await repo.grantRole(tx.db, input.userId, input.role, actor.userId)
    else await repo.removeRole(tx.db, input.userId, input.role)
    const roles = await repo.rolesOf(tx.db, input.userId)
    if (roles.length === 0) throw new ConflictError('FORBIDDEN', { reason: 'no_roles_left' })
    await repo.updateUser(tx.db, input.userId, { role: mirroredRole(roles) })
    await writeAudit(tx, {
      action: input.granted ? 'user.role_grant' : 'user.role_revoke',
      targetType: 'user',
      targetId: input.userId,
      before: { roles: target.roles },
      after: { roles, reason: input.reason },
    })
    return roles
  })
}

/** Signs a user out of every browser and app install. */
export async function revokeUserSessions(ctx: Ctx, input: { userId: string; reason: string }) {
  const actor = requireStaff(ctx.actor, canRevokeUserSessions)
  const target = await loadTarget(ctx, input.userId)
  if (!canActOnUser(actor, input.userId, target.roles)) throw new ForbiddenError()
  await provider(ctx, 'sessions').revokeAllSessions(input.userId)
  await writeAudit(ctx, {
    action: 'user.sessions_revoke',
    targetType: 'user',
    targetId: input.userId,
    after: { reason: input.reason },
  })
}

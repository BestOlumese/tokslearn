import type { Db, DbOrTx } from '@tokslearn/db'
import { type Actor, actorUserId, type Role, type UserActor } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { getOwnedUploadedFile, publicFileUrl } from '../media'
import { sendEmail } from '../notifications'
import { describeDevice, ipHint } from './device'
import * as repo from './repo'
import { mirroredRole } from './rules'

export const DELETION_GRACE_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

// ── Actor resolution (called by the API/auth layer per request) ──────

/**
 * Builds the Actor for a Better Auth session. Roles come from `user_roles` (source of truth) and
 * 2FA freshness from our `session.two_factor_verified_at` column, not from the cookie cache.
 */
export async function loadUserActor(
  db: Db,
  session: { userId: string; sessionId: string; emailVerified: boolean; twoFactorEnabled: boolean },
): Promise<UserActor> {
  const [roles, twoFactorVerifiedAt] = await Promise.all([
    repo.rolesOf(db, session.userId),
    session.twoFactorEnabled ? repo.sessionTwoFactorVerifiedAt(db, session.sessionId) : null,
  ])
  return {
    kind: 'user',
    userId: session.userId,
    sessionId: session.sessionId,
    roles: roles.length > 0 ? roles : ['learner'],
    emailVerified: session.emailVerified,
    twoFactorEnabled: session.twoFactorEnabled,
    twoFactorVerifiedAt,
  }
}

/** Called by the auth layer after a TOTP or backup-code check passes for this session. */
export async function markTwoFactorVerified(db: DbOrTx, sessionId: string, at: Date) {
  await repo.markSessionTwoFactorVerified(db, sessionId, at)
}

// ── Lifecycle hooks (system actor, called from Better Auth database hooks) ──

/** Every new user gets `learner` (docs/05). Emits `user.signed_up` for analytics. */
export async function onUserCreated(
  ctx: Ctx,
  input: { userId: string; method: 'password' | 'otp' | 'google' },
) {
  await inTransaction(ctx, async (tx) => {
    await repo.grantRole(tx.db, input.userId, 'learner', null)
    await tx.events.emit('user.signed_up', { userId: input.userId, method: input.method })
  })
}

/** Sends `new-sign-in` when a session starts on a device this user hasn't used before. */
export async function onSessionCreated(
  ctx: Ctx,
  input: { userId: string; sessionId: string; userAgent: string | null; ip: string | null },
) {
  const user = await repo.getUser(ctx.db, input.userId)
  if (!user) return
  const device = describeDevice(input.userAgent)
  const others = (await repo.activeSessionsOf(ctx.db, input.userId, new Date(0))).filter(
    (s) => s.id !== input.sessionId,
  )
  // First session ever (sign-up) or a device we've seen: no email.
  if (others.length === 0 || others.some((s) => describeDevice(s.userAgent) === device)) return
  await sendEmail(ctx, {
    id: 'new-sign-in',
    to: user.email,
    businessKey: input.sessionId,
    data: {
      name: user.name,
      when: ctx.now.toISOString(),
      device,
      ipHint: ipHint(input.ip),
      securityUrl: `${provider(ctx, 'urls').app}/account/settings/security`,
    },
  })
}

// ── Me ───────────────────────────────────────────────────

export interface Me {
  id: string
  name: string
  email: string
  emailVerified: boolean
  username: string | null
  headline: string | null
  bio: string | null
  avatarUrl: string | null
  timezone: string
  roles: Role[]
  twoFactorEnabled: boolean
  hasPassword: boolean
  links: Array<{ kind: LinkKind; url: string }>
  deletionScheduledFor: Date | null
  createdAt: Date
}

type LinkKind = 'website' | 'linkedin' | 'x' | 'youtube' | 'github' | 'other'

const scheduledDeletion = (requestedAt: Date | null) =>
  requestedAt ? new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * DAY_MS) : null

async function buildMe(ctx: Ctx, db: DbOrTx, userId: string): Promise<Me> {
  const [user, roles, links, hasPassword] = await Promise.all([
    repo.getUser(db, userId),
    repo.rolesOf(db, userId),
    repo.linksOf(db, userId),
    repo.hasPasswordAccount(db, userId),
  ])
  if (!user || user.deletedAt) throw new NotFoundError('USER_NOT_FOUND')
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    username: user.username,
    headline: user.headline,
    bio: user.bio,
    avatarUrl: publicFileUrl(ctx, user.avatarKey) ?? user.image,
    timezone: user.timezone ?? 'Africa/Lagos',
    roles,
    twoFactorEnabled: user.twoFactorEnabled ?? false,
    hasPassword,
    links,
    deletionScheduledFor: scheduledDeletion(user.deletionRequestedAt),
    createdAt: user.createdAt,
  }
}

export async function getMe(ctx: Ctx): Promise<Me> {
  const actor = requireUser(ctx.actor)
  return buildMe(ctx, ctx.db, actor.userId)
}

export interface UpdateMe {
  name?: string | undefined
  username?: string | undefined
  headline?: string | null | undefined
  bio?: string | null | undefined
  avatarFileId?: string | null | undefined
  links?: ReadonlyArray<{ kind: LinkKind; url: string }> | undefined
}

export async function updateMe(ctx: Ctx, input: UpdateMe): Promise<Me> {
  const actor = requireUser(ctx.actor)
  // Resolve the avatar before the transaction; media owns `files`.
  const avatarKey =
    input.avatarFileId === undefined
      ? undefined
      : input.avatarFileId === null
        ? null
        : (await getOwnedUploadedFile(ctx, input.avatarFileId, 'avatar')).key

  return inTransaction(ctx, async (tx) => {
    const current = await repo.getUser(tx.db, actor.userId)
    if (!current || current.deletedAt) throw new NotFoundError('USER_NOT_FOUND')
    if (current.deletionRequestedAt) throw new ConflictError('DELETION_PENDING')

    const username = input.username?.toLowerCase()
    if (username && username !== current.username) {
      if (await repo.isUsernameTaken(tx.db, username, actor.userId)) {
        throw new ConflictError('USERNAME_TAKEN')
      }
    }
    const values: Partial<repo.UserRow> = {}
    if (input.name !== undefined) values.name = input.name
    if (username !== undefined) values.username = username
    if (input.headline !== undefined) values.headline = input.headline || null
    if (input.bio !== undefined) values.bio = input.bio || null
    if (avatarKey !== undefined) values.avatarKey = avatarKey
    if (Object.keys(values).length > 0) {
      try {
        await repo.updateUser(tx.db, actor.userId, values)
      } catch (error) {
        // Two people claiming the same username at once: the unique index decides.
        if (String(error).includes('user_username_unique'))
          throw new ConflictError('USERNAME_TAKEN')
        throw error
      }
    }
    if (input.links !== undefined) await repo.replaceLinks(tx.db, actor.userId, input.links)
    return buildMe(tx, tx.db, actor.userId)
  })
}

// ── Sessions ─────────────────────────────────────────────

export interface SessionView {
  id: string
  current: boolean
  device: string
  ipHint: string | null
  createdAt: Date
  lastActiveAt: Date
  expiresAt: Date
}

export const toSessionView = (
  s: Awaited<ReturnType<typeof repo.activeSessionsOf>>[number],
  currentId: string | null,
): SessionView => ({
  id: s.id,
  current: s.id === currentId,
  device: describeDevice(s.userAgent),
  ipHint: ipHint(s.ipAddress),
  createdAt: s.createdAt,
  lastActiveAt: s.updatedAt,
  expiresAt: s.expiresAt,
})

export async function listMySessions(ctx: Ctx): Promise<SessionView[]> {
  const actor = requireUser(ctx.actor)
  const rows = await repo.activeSessionsOf(ctx.db, actor.userId, ctx.now)
  return rows.map((s) => toSessionView(s, actor.sessionId))
}

/** Ends one of your own sessions. Someone else's session id returns SESSION_NOT_FOUND (no leak). */
export async function revokeMySession(ctx: Ctx, sessionId: string): Promise<void> {
  const actor = requireUser(ctx.actor)
  const row = await repo.getSessionRow(ctx.db, sessionId)
  if (!row || row.userId !== actor.userId) throw new NotFoundError('SESSION_NOT_FOUND')
  await provider(ctx, 'sessions').revokeSession(sessionId)
}

export async function revokeMyOtherSessions(ctx: Ctx): Promise<void> {
  const actor = requireUser(ctx.actor)
  await provider(ctx, 'sessions').revokeAllSessions(actor.userId, {
    exceptSessionId: actor.sessionId,
  })
}

// ── Privacy: deletion and export (NDPA, docs/14 §3) ──────

export async function requestDeletion(ctx: Ctx): Promise<{ scheduledFor: Date }> {
  const actor = requireUser(ctx.actor)
  return inTransaction(ctx, async (tx) => {
    const user = await repo.getUser(tx.db, actor.userId)
    if (!user || user.deletedAt) throw new NotFoundError('USER_NOT_FOUND')
    const existing = scheduledDeletion(user.deletionRequestedAt)
    if (existing) return { scheduledFor: existing }

    await repo.updateUser(tx.db, actor.userId, { deletionRequestedAt: tx.now })
    const scheduledFor = new Date(tx.now.getTime() + DELETION_GRACE_DAYS * DAY_MS)
    await tx.events.emit('user.deletion_requested', {
      userId: actor.userId,
      scheduledFor: scheduledFor.toISOString(),
    })
    await sendEmail(tx, {
      id: 'deletion-requested',
      to: user.email,
      businessKey: `${actor.userId}:${tx.now.getTime()}`,
      data: {
        name: user.name,
        scheduledFor: scheduledFor.toISOString(),
        cancelUrl: `${provider(tx, 'urls').app}/account/settings/privacy`,
      },
    })
    return { scheduledFor }
  })
}

export async function cancelDeletion(ctx: Ctx): Promise<void> {
  const actor = requireUser(ctx.actor)
  await inTransaction(ctx, async (tx) => {
    const user = await repo.getUser(tx.db, actor.userId)
    if (!user?.deletionRequestedAt || user.deletedAt) return
    await repo.updateUser(tx.db, actor.userId, { deletionRequestedAt: null })
    await tx.events.emit('user.deletion_cancelled', { userId: actor.userId })
  })
}

/** Queues the export job. v1 job is a stub; the email `data-export-ready` arrives with it. */
export async function requestDataExport(ctx: Ctx): Promise<void> {
  const actor = requireUser(ctx.actor)
  await ctx.events.emit('user.export_requested', { userId: actor.userId })
}

/**
 * Anonymizes one user whose grace period has passed (docs/07 §6). Keeps the row so financial
 * records stay linked but de-identified. System actor only.
 */
export async function anonymizeUser(ctx: Ctx, userId: string): Promise<'anonymized' | 'skipped'> {
  if (ctx.actor.kind !== 'system') throw new ForbiddenError()
  const result = await inTransaction(ctx, async (tx) => {
    const user = await repo.getUser(tx.db, userId)
    const due = scheduledDeletion(user?.deletionRequestedAt ?? null)
    if (!user || user.deletedAt || !due || due > tx.now) return 'skipped' as const
    await repo.deleteCredentials(tx.db, userId)
    await repo.updateUser(tx.db, userId, {
      name: 'Deleted user',
      email: `deleted+${userId}@users.tokslearn.invalid`,
      emailVerified: false,
      image: null,
      username: null,
      headline: null,
      bio: null,
      avatarKey: null,
      twoFactorEnabled: false,
      deletedAt: tx.now,
    })
    return 'anonymized' as const
  })
  if (result === 'anonymized') await provider(ctx, 'sessions').revokeAllSessions(userId)
  return result
}

// ── Public profile ───────────────────────────────────────

export async function getPublicProfile(ctx: Ctx, username: string) {
  const user = await repo.getActiveUserByUsername(ctx.db, username.toLowerCase())
  if (!user?.username) throw new NotFoundError('USER_NOT_FOUND')
  return {
    username: user.username,
    name: user.name,
    headline: user.headline,
    bio: user.bio,
    avatarUrl: publicFileUrl(ctx, user.avatarKey) ?? user.image,
    links: await repo.linksOf(ctx.db, user.id),
    memberSince: user.createdAt,
  }
}

export type { Actor }

/**
 * For the instructors module only, after its own reviewer check (docs/07 §5 step 5): grants the
 * instructor role inside the caller's transaction. Staff role changes go through `setRole`.
 */
export async function grantInstructorRole(ctx: Ctx, userId: string): Promise<void> {
  await repo.grantRole(ctx.db, userId, 'instructor', actorUserId(ctx.actor))
  const roles = await repo.rolesOf(ctx.db, userId)
  await repo.updateUser(ctx.db, userId, { role: mirroredRole(roles) })
}

/** Name and email for notifications sent by other modules. Never returned to clients. */
export async function getUserContact(
  ctx: Ctx,
  userId: string,
): Promise<{ name: string; email: string }> {
  const row = await repo.getUser(ctx.db, userId)
  if (!row || row.deletedAt) throw new NotFoundError('USER_NOT_FOUND')
  return { name: row.name, email: row.email }
}

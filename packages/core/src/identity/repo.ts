import { type DbOrTx, schema } from '@tokslearn/db'
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm'
import type { Role } from '../kernel/actor'

// Reads `audit_log` (owned by admin) for the user detail page; see listAuditFor below.
const { user, session, userRoles, userLinks, account, twoFactor, auditLog } = schema

export type UserRow = typeof user.$inferSelect

// ── Cursor pagination on (created_at desc, id desc) ──────
export const encodeCursor = (createdAt: Date, id: string): string =>
  Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url')

export function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const createdAt = new Date(iso ?? '')
  return id && !Number.isNaN(createdAt.getTime()) ? { createdAt, id } : null
}

const beforeCursor = (
  cols: { createdAt: typeof user.createdAt; id: typeof user.id },
  cursor: { createdAt: Date; id: string } | null,
): SQL | undefined =>
  cursor
    ? or(
        lt(cols.createdAt, cursor.createdAt),
        and(eq(cols.createdAt, cursor.createdAt), lt(cols.id, cursor.id)),
      )
    : undefined

// ── Users ────────────────────────────────────────────────
export async function getUser(db: DbOrTx, id: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(user).where(eq(user.id, id))
  return row
}

export async function getActiveUserByUsername(db: DbOrTx, username: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(and(eq(user.username, username), isNull(user.deletedAt), eq(user.banned, false)))
  return row
}

export async function isUsernameTaken(db: DbOrTx, username: string, exceptUserId: string) {
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.username, username), sql`${user.id} <> ${exceptUserId}`))
  return Boolean(row)
}

export async function updateUser(
  db: DbOrTx,
  id: string,
  values: Partial<Omit<UserRow, 'id' | 'createdAt'>>,
): Promise<UserRow | undefined> {
  const [row] = await db.update(user).set(values).where(eq(user.id, id)).returning()
  return row
}

export async function searchUsers(
  db: DbOrTx,
  filters: {
    q?: string | undefined
    role?: Role | undefined
    cursor?: string | undefined
    limit: number
  },
) {
  const conditions: Array<SQL | undefined> = [beforeCursor(user, decodeCursor(filters.cursor))]
  if (filters.q) {
    const like = `%${filters.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
    conditions.push(or(ilike(user.email, like), ilike(user.name, like), ilike(user.username, like)))
  }
  if (filters.role) {
    conditions.push(
      inArray(
        user.id,
        db.select({ id: userRoles.userId }).from(userRoles).where(eq(userRoles.role, filters.role)),
      ),
    )
  }
  const rows = await db
    .select()
    .from(user)
    .where(and(...conditions))
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(filters.limit + 1)
  const page = rows.slice(0, filters.limit)
  const last = page.at(-1)
  return {
    rows: page,
    nextCursor: rows.length > filters.limit && last ? encodeCursor(last.createdAt, last.id) : null,
  }
}

// ── Roles ────────────────────────────────────────────────
export async function rolesOf(db: DbOrTx, userId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  return rows.map((r) => r.role)
}

export async function rolesOfMany(db: DbOrTx, userIds: ReadonlyArray<string>) {
  if (userIds.length === 0) return new Map<string, Role[]>()
  const rows = await db
    .select({ userId: userRoles.userId, role: userRoles.role })
    .from(userRoles)
    .where(inArray(userRoles.userId, [...userIds]))
  const map = new Map<string, Role[]>()
  for (const r of rows) map.set(r.userId, [...(map.get(r.userId) ?? []), r.role])
  return map
}

export async function grantRole(db: DbOrTx, userId: string, role: Role, grantedBy: string | null) {
  await db.insert(userRoles).values({ userId, role, grantedBy }).onConflictDoNothing()
}

export async function removeRole(db: DbOrTx, userId: string, role: Role) {
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)))
}

// ── Links ────────────────────────────────────────────────
export async function linksOf(db: DbOrTx, userId: string) {
  return db
    .select({ kind: userLinks.kind, url: userLinks.url })
    .from(userLinks)
    .where(eq(userLinks.userId, userId))
    .orderBy(asc(userLinks.position))
}

export async function replaceLinks(
  db: DbOrTx,
  userId: string,
  links: ReadonlyArray<{ kind: (typeof userLinks.$inferInsert)['kind']; url: string }>,
) {
  await db.delete(userLinks).where(eq(userLinks.userId, userId))
  if (links.length > 0) {
    await db
      .insert(userLinks)
      .values(links.map((l, position) => ({ userId, kind: l.kind, url: l.url, position })))
  }
}

// ── Sessions (Better Auth rows; revocation goes through the SessionAdmin port) ──
export async function activeSessionsOf(db: DbOrTx, userId: string, now: Date) {
  return db
    .select()
    .from(session)
    .where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
    .orderBy(desc(session.updatedAt))
}

export async function getSessionRow(db: DbOrTx, id: string) {
  const [row] = await db.select().from(session).where(eq(session.id, id))
  return row
}

export async function sessionTwoFactorVerifiedAt(db: DbOrTx, sessionId: string) {
  const [row] = await db
    .select({ at: session.twoFactorVerifiedAt })
    .from(session)
    .where(eq(session.id, sessionId))
  return row?.at ?? null
}

export async function markSessionTwoFactorVerified(db: DbOrTx, sessionId: string, at: Date) {
  await db.update(session).set({ twoFactorVerifiedAt: at }).where(eq(session.id, sessionId))
}

// ── Anonymization (account deletion) ────────────────────
export async function deleteCredentials(db: DbOrTx, userId: string) {
  await db.delete(account).where(eq(account.userId, userId))
  await db.delete(twoFactor).where(eq(twoFactor.userId, userId))
  await db.delete(userLinks).where(eq(userLinks.userId, userId))
}

export async function usersDueForDeletion(db: DbOrTx, cutoff: Date) {
  return db
    .select({ id: user.id })
    .from(user)
    .where(and(lt(user.deletionRequestedAt, cutoff), isNull(user.deletedAt)))
}

// ── Audit trail for the user detail page (reads admin's audit_log) ──
export async function listAuditFor(
  db: DbOrTx,
  targetType: string,
  targetId: string,
  limit: number,
) {
  return db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      actorName: user.name,
      actorKind: auditLog.actorKind,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      before: auditLog.before,
      after: auditLog.after,
      requestId: auditLog.requestId,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId))
    .where(and(eq(auditLog.targetType, targetType), eq(auditLog.targetId, targetId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
}

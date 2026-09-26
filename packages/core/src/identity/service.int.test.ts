import { type Db, newId, schema } from '@tokslearn/db'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { writeAudit } from '../admin'
import { type Actor, systemActor } from '../kernel/actor'
import { fixedClock } from '../kernel/clock'
import { createCtx } from '../kernel/ctx'
import { DomainError } from '../kernel/errors'
import { insertUser, testUser } from '../kernel/testing'
import { completeFileUpload, createFileUpload } from '../media'
import {
  anonymizeUser,
  cancelDeletion,
  getMe,
  getPublicProfile,
  getUserDetail,
  onUserCreated,
  requestDeletion,
  revokeMySession,
  setBanned,
  setRole,
  updateMe,
} from '.'

afterAll(closeTestDb)

const storage = createFakeStorage()
const sessions = { revokeSession: vi.fn(async () => {}), revokeAllSessions: vi.fn(async () => {}) }

function ctxFor(db: Db, actor: Actor, now = new Date('2026-09-26T10:00:00Z')) {
  return createCtx({
    db,
    actor,
    requestId: 'req-test',
    clock: fixedClock(now),
    providers: {
      storage,
      sessions,
      urls: { app: 'https://tokslearn.test', cdn: 'https://cdn.tokslearn.test' },
    },
  })
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return e.code
    throw e
  }
  throw new Error('expected a DomainError')
}

async function insertSession(db: Db, userId: string) {
  const id = newId()
  await db.insert(schema.session).values({
    id,
    userId,
    token: `token-${id}`,
    expiresAt: new Date('2027-01-01T00:00:00Z'),
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile Safari/537.36',
  })
  return id
}

describe('identity: sign-up and profile', () => {
  it('gives every new user the learner role and emits user.signed_up', async () => {
    await withRollback(async (db) => {
      const id = await insertUser(db, { roles: [] })
      await onUserCreated(ctxFor(db, systemActor('test')), { userId: id, method: 'password' })
      const roles = await db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, id))
      expect(roles.map((r) => r.role)).toEqual(['learner'])
      const events = await db
        .select()
        .from(schema.outbox)
        .where(eq(schema.outbox.eventName, 'user.signed_up'))
      expect(events).toHaveLength(1)
    })
  })

  it('saves a lowercase username and rejects one that is taken', async () => {
    await withRollback(async (db) => {
      const a = await insertUser(db, { username: 'ada' })
      const b = await insertUser(db)
      const me = await updateMe(ctxFor(db, testUser(['learner'], { userId: b })), {
        username: 'Bola_1',
        headline: 'Accountant',
        links: [{ kind: 'website', url: 'https://bola.example' }],
      })
      expect(me.username).toBe('bola_1')
      expect(me.links).toEqual([{ kind: 'website', url: 'https://bola.example' }])
      expect(
        await codeOf(
          updateMe(ctxFor(db, testUser(['learner'], { userId: b })), { username: 'ADA' }),
        ),
      ).toBe('USERNAME_TAKEN')
      expect(a).toBeTruthy()
    })
  })

  it('never exposes email on the public profile, and hides suspended users', async () => {
    await withRollback(async (db) => {
      const id = await insertUser(db, { username: 'chiamaka', email: 'private@example.test' })
      const profile = await getPublicProfile(ctxFor(db, { kind: 'anonymous' }), 'Chiamaka')
      expect(JSON.stringify(profile)).not.toContain('private@example.test')
      await db.update(schema.user).set({ banned: true }).where(eq(schema.user.id, id))
      expect(await codeOf(getPublicProfile(ctxFor(db, { kind: 'anonymous' }), 'chiamaka'))).toBe(
        'USER_NOT_FOUND',
      )
    })
  })
})

describe('media: avatar upload', () => {
  it('uploads through a presigned URL, then sets the avatar', async () => {
    await withRollback(async (db) => {
      const id = await insertUser(db)
      const ctx = ctxFor(db, testUser(['learner'], { userId: id }))
      const upload = await createFileUpload(ctx, {
        purpose: 'avatar',
        filename: 'me.png',
        mime: 'image/png',
        sizeBytes: 1200,
      })
      expect(upload.uploadUrl).toContain('/public/avatar/')
      // Before the browser uploads, completing fails.
      expect(await codeOf(completeFileUpload(ctx, upload.fileId))).toBe('FILE_NOT_FOUND')
      const [file] = await db.select().from(schema.files).where(eq(schema.files.id, upload.fileId))
      storage.putObject('public', file?.key ?? '', 1200, 'image/png')
      await completeFileUpload(ctx, upload.fileId)
      const me = await updateMe(ctx, { avatarFileId: upload.fileId })
      expect(me.avatarUrl).toBe(`https://cdn.tokslearn.test/${file?.key}`)
    })
  })

  it('rejects wrong types, oversize files and other people’s files', async () => {
    await withRollback(async (db) => {
      const owner = await insertUser(db)
      const other = await insertUser(db)
      const ctx = ctxFor(db, testUser(['learner'], { userId: owner }))
      expect(
        await codeOf(
          createFileUpload(ctx, {
            purpose: 'avatar',
            filename: 'a.gif',
            mime: 'image/gif',
            sizeBytes: 10,
          }),
        ),
      ).toBe('UNSUPPORTED_FILE_TYPE')
      expect(
        await codeOf(
          createFileUpload(ctx, {
            purpose: 'avatar',
            filename: 'a.png',
            mime: 'image/png',
            sizeBytes: 5_000_000,
          }),
        ),
      ).toBe('UPLOAD_TOO_LARGE')
      const upload = await createFileUpload(ctx, {
        purpose: 'avatar',
        filename: 'a.png',
        mime: 'image/png',
        sizeBytes: 10,
      })
      const otherCtx = ctxFor(db, testUser(['learner'], { userId: other }))
      expect(await codeOf(completeFileUpload(otherCtx, upload.fileId))).toBe('FILE_NOT_FOUND')
      expect(await codeOf(updateMe(otherCtx, { avatarFileId: upload.fileId }))).toBe(
        'FILE_NOT_FOUND',
      )
    })
  })
})

describe('identity: sessions and deletion', () => {
  it("won't revoke someone else's session (IDOR)", async () => {
    await withRollback(async (db) => {
      const alice = await insertUser(db)
      const bob = await insertUser(db)
      const aliceSession = await insertSession(db, alice)
      sessions.revokeSession.mockClear()
      expect(
        await codeOf(
          revokeMySession(ctxFor(db, testUser(['learner'], { userId: bob })), aliceSession),
        ),
      ).toBe('SESSION_NOT_FOUND')
      expect(sessions.revokeSession).not.toHaveBeenCalled()
      await revokeMySession(ctxFor(db, testUser(['learner'], { userId: alice })), aliceSession)
      expect(sessions.revokeSession).toHaveBeenCalledWith(aliceSession)
    })
  })

  it('schedules deletion 14 days out, emails a notice, and can be cancelled', async () => {
    await withRollback(async (db) => {
      const id = await insertUser(db)
      const ctx = ctxFor(db, testUser(['learner'], { userId: id }))
      const { scheduledFor } = await requestDeletion(ctx)
      expect(scheduledFor.toISOString()).toBe('2026-10-10T10:00:00.000Z')
      expect((await requestDeletion(ctx)).scheduledFor.toISOString()).toBe(
        scheduledFor.toISOString(),
      )
      const emails = await db
        .select()
        .from(schema.outbox)
        .where(eq(schema.outbox.eventName, 'notification.email_requested'))
      expect(emails.map((e) => (e.payload as { id: string }).id)).toContain('deletion-requested')
      expect((await getMe(ctx)).deletionScheduledFor?.toISOString()).toBe(
        scheduledFor.toISOString(),
      )
      await cancelDeletion(ctx)
      expect((await getMe(ctx)).deletionScheduledFor).toBeNull()
    })
  })

  it('anonymizes only after the grace period, keeping the row', async () => {
    await withRollback(async (db) => {
      const id = await insertUser(db, { email: 'leaving@example.test', username: 'leaving' })
      await requestDeletion(ctxFor(db, testUser(['learner'], { userId: id })))
      const job = (now: string) => ctxFor(db, systemActor('account-deletion'), new Date(now))
      expect(await anonymizeUser(job('2026-10-09T10:00:00Z'), id)).toBe('skipped')
      sessions.revokeAllSessions.mockClear()
      expect(await anonymizeUser(job('2026-10-11T10:00:00Z'), id)).toBe('anonymized')
      const [row] = await db.select().from(schema.user).where(eq(schema.user.id, id))
      expect(row?.email).not.toContain('leaving@example.test')
      expect(row?.username).toBeNull()
      expect(row?.deletedAt).not.toBeNull()
      expect(sessions.revokeAllSessions).toHaveBeenCalledWith(id)
    })
  })
})

describe('identity: admin actions', () => {
  it('needs staff 2FA, blocks self-actions and keeps admin grants for super admins', async () => {
    await withRollback(async (db) => {
      const adminId = await insertUser(db, { roles: ['learner', 'admin'] })
      const target = await insertUser(db)
      const admin = testUser(['learner', 'admin'], { userId: adminId })
      const noTwoFactor = testUser(['learner', 'admin'], {
        userId: adminId,
        twoFactorEnabled: false,
      })

      expect(await codeOf(getUserDetail(ctxFor(db, noTwoFactor), target))).toBe(
        'TWO_FACTOR_REQUIRED',
      )
      expect(
        await codeOf(
          setBanned(ctxFor(db, admin), { userId: adminId, banned: true, reason: 'self' }),
        ),
      ).toBe('FORBIDDEN')
      expect(
        await codeOf(
          setRole(ctxFor(db, admin), {
            userId: target,
            role: 'admin',
            granted: true,
            reason: 'promote',
          }),
        ),
      ).toBe('STAFF_ONLY')

      const roles = await setRole(ctxFor(db, admin), {
        userId: target,
        role: 'support',
        granted: true,
        reason: 'joined support',
      })
      expect(roles).toEqual(expect.arrayContaining(['learner', 'support']))
      const [row] = await db.select().from(schema.user).where(eq(schema.user.id, target))
      expect(row?.role).toBe('support')

      sessions.revokeAllSessions.mockClear()
      await setBanned(ctxFor(db, admin), { userId: target, banned: true, reason: 'spam reports' })
      expect(sessions.revokeAllSessions).toHaveBeenCalledWith(target)
      const detail = await getUserDetail(ctxFor(db, admin), target)
      expect(detail.audit.map((a) => a.action)).toEqual(
        expect.arrayContaining(['user.ban', 'user.role_grant']),
      )
      // writeAudit is the shared path; a system write shows up too.
      await writeAudit(ctxFor(db, systemActor('test')), {
        action: 'user.note',
        targetType: 'user',
        targetId: target,
      })
    })
  })
})

import { type Db, schema } from '@tokslearn/db'
import { closeTestDb, seed, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { type Actor, systemActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'
import { DomainError } from '../kernel/errors'
import { insertUser, testUser } from '../kernel/testing'
import {
  claimIdempotencyKey,
  completeIdempotencyKey,
  dispatchOutbox,
  isFeatureEnabled,
  listFeatureFlags,
  resetFeatureFlagCache,
  setFeatureFlag,
} from './service'

afterAll(closeTestDb)
beforeEach(resetFeatureFlagCache)

const ADMIN_ID = '0190a000-0000-7000-8000-000000000001'
const admin: Actor = testUser(['admin'], { userId: ADMIN_ID })
const learner: Actor = testUser(['learner'], { userId: ADMIN_ID })
const adminWithout2fa: Actor = testUser(['admin'], { userId: ADMIN_ID, twoFactorEnabled: false })
const adminNotSteppedUp: Actor = testUser(['admin'], {
  userId: ADMIN_ID,
  twoFactorVerifiedAt: null,
})

const ctxFor = (db: Db, actor: Actor, afterOutbox?: () => void) =>
  createCtx({
    db,
    actor,
    requestId: 'req-test',
    ...(afterOutbox ? { onOutboxWritten: afterOutbox } : {}),
  })

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof DomainError) return e.code
    throw e
  }
  throw new Error('expected a DomainError')
}

describe('feature flags', () => {
  it('refuses non-admins', async () => {
    await withRollback(async (db) => {
      await seed(db)
      expect(await codeOf(listFeatureFlags(ctxFor(db, learner)))).toBe('STAFF_ONLY')
      expect(
        await codeOf(setFeatureFlag(ctxFor(db, learner), { key: 'cohorts', enabled: true })),
      ).toBe('STAFF_ONLY')
    })
  })

  it('requires admins to have 2FA on and verified in this session', async () => {
    await withRollback(async (db) => {
      await seed(db)
      expect(await codeOf(listFeatureFlags(ctxFor(db, adminWithout2fa)))).toBe(
        'TWO_FACTOR_REQUIRED',
      )
      expect(await codeOf(listFeatureFlags(ctxFor(db, adminNotSteppedUp)))).toBe('STEP_UP_REQUIRED')
    })
  })

  it('returns FEATURE_FLAG_NOT_FOUND for unknown keys', async () => {
    await withRollback(async (db) => {
      expect(await codeOf(setFeatureFlag(ctxFor(db, admin), { key: 'nope', enabled: true }))).toBe(
        'FEATURE_FLAG_NOT_FOUND',
      )
    })
  })

  it('updates the flag, audits it and emits an outbox event in one transaction', async () => {
    await withRollback(async (db) => {
      await seed(db)
      await insertUser(db, { id: ADMIN_ID, roles: ['admin'] })
      let hookCalls = 0
      const ctx = ctxFor(db, admin, () => {
        hookCalls++
      })
      const flag = await setFeatureFlag(ctx, { key: 'cohorts', enabled: true })
      expect(flag.enabled).toBe(true)

      const audits = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.targetId, 'cohorts'))
      expect(audits).toHaveLength(1)
      expect(audits[0]?.before).toEqual({ enabled: false })
      expect(audits[0]?.after).toEqual({ enabled: true })
      expect(audits[0]?.actorId).toBe(ADMIN_ID)

      const events = await db
        .select()
        .from(schema.outbox)
        .where(eq(schema.outbox.eventName, 'feature_flag.updated'))
      expect(events).toHaveLength(1)
      expect(events[0]?.payload).toEqual({ key: 'cohorts', enabled: true })
      expect(hookCalls).toBe(1)

      expect(await isFeatureEnabled(ctx, 'cohorts')).toBe(true)
      expect(await isFeatureEnabled(ctx, 'does_not_exist')).toBe(false)
    })
  })

  it('does not audit a no-op change', async () => {
    await withRollback(async (db) => {
      await seed(db)
      await setFeatureFlag(ctxFor(db, admin), { key: 'cohorts', enabled: false })
      const audits = await db.select().from(schema.auditLog)
      expect(audits).toHaveLength(0)
    })
  })
})

describe('idempotency keys', () => {
  it('replays the stored response for the same request and rejects a different one', async () => {
    await withRollback(async (db) => {
      const ctx = ctxFor(db, admin)
      const claim = { key: 'checkout.start:u1:abc', scope: 'checkout.start', requestHash: 'h1' }
      expect(await claimIdempotencyKey(ctx, claim)).toEqual({ kind: 'new' })

      // Still running: a retry must not run the mutation twice.
      expect(await codeOf(claimIdempotencyKey(ctx, claim))).toBe('IDEMPOTENCY_CONFLICT')

      await completeIdempotencyKey(ctx, claim.key, { orderId: 'o1' })
      expect(await claimIdempotencyKey(ctx, claim)).toEqual({
        kind: 'replay',
        response: { orderId: 'o1' },
      })
      expect(await codeOf(claimIdempotencyKey(ctx, { ...claim, requestHash: 'h2' }))).toBe(
        'IDEMPOTENCY_CONFLICT',
      )
    })
  })
})

describe('outbox dispatch', () => {
  // available_at defaults to Postgres now() (microseconds); the job clock is a JS Date
  // (milliseconds). Pin rows in the past so both land on the same side.
  const past = new Date(Date.now() - 60_000)

  it('sends pending events once and marks them sent', async () => {
    await withRollback(async (db) => {
      await db.insert(schema.outbox).values([
        {
          eventName: 'feature_flag.updated',
          payload: { key: 'a', enabled: true },
          availableAt: past,
        },
        {
          eventName: 'feature_flag.updated',
          payload: { key: 'b', enabled: false },
          availableAt: past,
        },
      ])
      const sent: string[] = []
      const job = createCtx({ db, actor: systemActor('outbox-dispatch'), requestId: 'job' })
      const first = await dispatchOutbox(job, async (msgs) => {
        sent.push(...msgs.map((m) => m.id))
      })
      expect(first).toEqual({ sent: 2, failed: 0 })

      const second = await dispatchOutbox(job, async () => {
        throw new Error('should not be called')
      })
      expect(second).toEqual({ sent: 0, failed: 0 })
      expect(new Set(sent).size).toBe(2)
    })
  })

  it('keeps events pending with the error when sending fails', async () => {
    await withRollback(async (db) => {
      await db
        .insert(schema.outbox)
        .values({ eventName: 'x.happened', payload: {}, availableAt: past })
      const job = createCtx({ db, actor: systemActor('outbox-dispatch'), requestId: 'job' })
      const result = await dispatchOutbox(job, async () => {
        throw new Error('inngest down')
      })
      expect(result).toEqual({ sent: 0, failed: 1 })
      const [row] = await db.select().from(schema.outbox)
      expect(row?.status).toBe('pending')
      expect(row?.attempts).toBe(1)
      expect(row?.lastError).toBe('inngest down')
    })
  })

  it('refuses user actors', async () => {
    await withRollback(async (db) => {
      expect(await codeOf(dispatchOutbox(ctxFor(db, admin), async () => {}))).toBe('FORBIDDEN')
    })
  })
})

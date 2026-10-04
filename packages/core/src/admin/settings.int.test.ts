import { schema } from '@tokslearn/db'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createCtx } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf } from '../testing'
import {
  lastCheckResult,
  listPlatformSettings,
  recordCheckResult,
  systemStatus,
  updatePlatformSetting,
} from '.'

afterAll(closeTestDb)

const NOW = new Date('2026-10-04T10:00:00Z')

describe('platform settings and system status', () => {
  it('lets a super admin with fresh 2FA change a setting, within its limits, audit-logged', async () => {
    await withRollback(async (db) => {
      const bossId = await insertUser(db, { roles: ['learner', 'super_admin'] })
      const financeId = await insertUser(db, { roles: ['learner', 'finance'] })
      const ctx = (roles: Array<'super_admin' | 'finance' | 'learner'>, id: string, fresh = true) =>
        createCtx({
          db,
          requestId: 'req-test',
          clock: { now: () => NOW },
          actor: testUser(roles, {
            userId: id,
            twoFactorVerifiedAt: fresh
              ? new Date(NOW.getTime() - 60_000)
              : new Date('2026-10-01T00:00:00Z'),
          }),
        })
      const boss = ctx(['learner', 'super_admin'], bossId)
      const before = await listPlatformSettings(boss)
      expect(before.find((s) => s.key === 'refund_abuse_limit')).toMatchObject({
        value: 3,
        updatedAt: null,
      })
      // Finance can look, not change.
      const finance = ctx(['learner', 'finance'], financeId)
      expect((await listPlatformSettings(finance)).length).toBe(before.length)
      expect(
        await codeOf(updatePlatformSetting(finance, { key: 'refund_abuse_limit', value: 5 })),
      ).toBe('STAFF_ONLY')
      expect(
        await codeOf(
          updatePlatformSetting(ctx(['learner', 'super_admin'], bossId, false), {
            key: 'refund_abuse_limit',
            value: 5,
          }),
        ),
      ).toBe('STEP_UP_REQUIRED')
      expect(
        await codeOf(updatePlatformSetting(boss, { key: 'refund_abuse_limit', value: 0 })),
      ).toBe('VALIDATION_FAILED')
      expect(await codeOf(updatePlatformSetting(boss, { key: 'tax_rules', value: 1 }))).toBe(
        'SETTING_NOT_FOUND',
      )

      expect(
        await updatePlatformSetting(boss, { key: 'refund_abuse_limit', value: 5 }),
      ).toMatchObject({
        value: 5,
      })
      expect(
        await updatePlatformSetting(boss, { key: 'min_payout_kobo', value: '1000000' }),
      ).toMatchObject({ value: '1000000' })
      expect(
        await updatePlatformSetting(boss, {
          key: 'public_holidays',
          value: ['2026-12-25', '2026-10-01', '2026-12-25'],
        }),
      ).toMatchObject({ value: ['2026-10-01', '2026-12-25'] })
      expect(
        await codeOf(updatePlatformSetting(boss, { key: 'public_holidays', value: ['Xmas'] })),
      ).toBe('VALIDATION_FAILED')
      expect(
        await codeOf(updatePlatformSetting(boss, { key: 'gateway_fee_bearer', value: 'learner' })),
      ).toBe('VALIDATION_FAILED')

      const audit = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.action, 'setting.updated'))
      expect(audit.map((a) => a.targetId).sort()).toEqual([
        'min_payout_kobo',
        'public_holidays',
        'refund_abuse_limit',
      ])
      expect(audit.find((a) => a.targetId === 'refund_abuse_limit')).toMatchObject({
        // There was no row yet: the code's default (3) applied.
        before: { value: null },
        after: { value: 5 },
      })
    })
  })

  it('shows stuck outbox rows and failed webhooks to admins, and keeps the last ledger check', async () => {
    await withRollback(async (db) => {
      const adminId = await insertUser(db, { roles: ['learner', 'admin'] })
      const ctx = createCtx({
        db,
        requestId: 'req-test',
        clock: { now: () => NOW },
        actor: testUser(['learner', 'admin'], { userId: adminId }),
      })
      const old = new Date(NOW.getTime() - 60 * 60_000)
      await db.insert(schema.outbox).values([
        {
          eventName: 'order.paid',
          payload: {},
          status: 'pending',
          availableAt: old,
          createdAt: old,
        },
        {
          eventName: 'refund.approved',
          payload: {},
          status: 'failed',
          attempts: 8,
          lastError: 'inngest 500',
          createdAt: old,
        },
      ])
      await db.insert(schema.paymentEvents).values({
        provider: 'paystack',
        eventId: 'charge.success:1:TL-1',
        type: 'charge.success',
        payload: {},
        error: 'order not found',
        createdAt: old,
      })
      const status = await systemStatus(ctx)
      expect(status.outbox).toMatchObject({ pending: 1, stale: 1, failed: 1 })
      expect(status.failedOutbox[0]).toMatchObject({ eventName: 'refund.approved', attempts: 8 })
      expect(status.webhooks.failed).toBe(1)
      expect(status.failedWebhooks[0]).toMatchObject({
        provider: 'paystack',
        error: 'order not found',
      })

      const learner = createCtx({
        db,
        requestId: 'req-test',
        actor: testUser(['learner'], { userId: adminId }),
      })
      expect(await codeOf(systemStatus(learner))).toBe('STAFF_ONLY')

      expect(await lastCheckResult(ctx, 'ledger_integrity')).toBeNull()
      await recordCheckResult(ctx, 'ledger_integrity', {
        ok: false,
        problems: { unbalancedEntries: 1 },
      })
      expect(await lastCheckResult(ctx, 'ledger_integrity')).toEqual({
        ok: false,
        at: NOW.toISOString(),
        problems: { unbalancedEntries: 1 },
      })
    })
  })
})

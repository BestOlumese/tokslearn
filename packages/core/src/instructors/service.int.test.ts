import { type Db, schema } from '@tokslearn/db'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { createFakeKyc } from '@tokslearn/integrations/dojah'
import { createFakePayouts } from '@tokslearn/integrations/paystack'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Actor, UserActor } from '../kernel/actor'
import { fixedClock } from '../kernel/clock'
import { createCtx } from '../kernel/ctx'
import { DomainError } from '../kernel/errors'
import { insertUser, testUser } from '../kernel/testing'
import {
  addPayoutAccount,
  decideApplication,
  getApplicationDetail,
  getMyApplication,
  listApplications,
  saveApplication,
  startKyc,
  submitApplication,
} from '.'

afterAll(closeTestDb)

const BVN = '22233344456'
const ACCOUNT = '0123456789'
const SELFIE = 'A'.repeat(2000)
const about = {
  headline: 'Chartered accountant, 9 years in audit',
  topics: ['Excel', 'Financial modelling'],
  experience: 'I have taught Excel to junior auditors at my firm for five years.',
}
const expertise = {
  expertise: 'Excel for accountants: lookups, pivot tables, and month-end reporting.',
  sampleUrl: 'https://example.com/sample-lesson',
}

function setup(db: Db, actor: Actor, now = new Date('2026-09-26T10:00:00Z')) {
  const kyc = createFakeKyc()
  const payouts = createFakePayouts()
  kyc.setName('ADA', 'NNEKA', 'LOVELACE')
  payouts.setAccountName(ACCOUNT, 'LOVELACE ADA NNEKA')
  const ctx = (a: Actor = actor, at = now) =>
    createCtx({
      db,
      actor: a,
      requestId: 'req-test',
      clock: fixedClock(at),
      providers: {
        kyc: kyc.provider,
        payouts: payouts.provider,
        sessions: { revokeSession: vi.fn(), revokeAllSessions: vi.fn() },
        urls: { app: 'https://tokslearn.test', cdn: null },
      },
    })
  return { ctx, kyc, payouts }
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

async function emailsQueued(db: Db) {
  const rows = await db
    .select({ payload: schema.outbox.payload })
    .from(schema.outbox)
    .where(eq(schema.outbox.eventName, 'notification.email_requested'))
  return rows.map((r) => (r.payload as { id: string }).id)
}

async function applicant(db: Db) {
  const userId = await insertUser(db, { name: 'Ada Lovelace', roles: ['learner'] })
  // Learners don't need 2FA to apply; the first bank account needs no step-up.
  return testUser(['learner'], { userId, twoFactorEnabled: false, twoFactorVerifiedAt: null })
}

async function reviewer(db: Db) {
  const userId = await insertUser(db, { name: 'Kemi Reviewer', roles: ['learner', 'reviewer'] })
  return testUser(['learner', 'reviewer'], { userId })
}

/**
 * Every text-like column in every table, searched for a value. Proves the acceptance rule "no raw
 * BVN/NIN or full account numbers anywhere in DB" (docs/phases/phase-02).
 */
async function tablesContaining(db: Db, needle: string): Promise<string[]> {
  type Rows<T> = { rows: T[] }
  const cols = (await db.execute(sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type in ('text', 'character varying', 'character', 'jsonb', 'json', 'ARRAY')
  `)) as unknown as Rows<{ table_name: string; column_name: string }>
  const hits: string[] = []
  for (const c of cols.rows) {
    const found = (await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(c.table_name)} where ${sql.identifier(c.column_name)}::text like ${`%${needle}%`}`,
    )) as unknown as Rows<{ n: number }>
    if ((found.rows[0]?.n ?? 0) > 0) hits.push(`${c.table_name}.${c.column_name}`)
  }
  return hits
}

describe('instructor onboarding', () => {
  it('applies → KYC → bank → submits → reviewer approves → instructor', async () => {
    await withRollback(async (db) => {
      const learner = await applicant(db)
      const { ctx } = setup(db, learner)

      await saveApplication(ctx(), { about, step: 1 })
      await saveApplication(ctx(), { expertise, step: 2 })
      expect(await codeOf(submitApplication(ctx()))).toBe('APPLICATION_INCOMPLETE')

      const kyc = await startKyc(ctx(), { method: 'bvn', number: BVN, selfieImage: SELFIE })
      expect(kyc.status).toBe('verified')
      const account = await addPayoutAccount(ctx(), { bankCode: '058', accountNumber: ACCOUNT })
      expect(account).toMatchObject({
        status: 'active',
        accountNumberLast4: '6789',
        bankName: 'Guaranty Trust Bank',
      })

      const mine = await submitApplication(ctx())
      expect(mine.application?.status).toBe('submitted')
      expect(await codeOf(saveApplication(ctx(), { about, step: 1 }))).toBe(
        'APPLICATION_NOT_EDITABLE',
      )

      const rev = await reviewer(db)
      const queue = await listApplications(ctx(rev), { status: 'open', limit: 25 })
      const row = queue.items.find((i) => i.userId === learner.userId)
      expect(row).toMatchObject({ kycStatus: 'verified', payoutAccountStatus: 'active' })

      const detail = await decideApplication(ctx(rev), {
        id: mine.application?.id ?? '',
        decision: 'approve',
        reason: 'Clear sample, strong experience.',
      })
      expect(detail.status).toBe('approved')
      expect(detail.kyc).toMatchObject({ status: 'verified', nameMatchesAccount: true })

      const roles = await db
        .select({ role: schema.userRoles.role })
        .from(schema.userRoles)
        .where(eq(schema.userRoles.userId, learner.userId))
      expect(roles.map((r) => r.role)).toContain('instructor')
      const [profile] = await db
        .select()
        .from(schema.instructorProfiles)
        .where(eq(schema.instructorProfiles.userId, learner.userId))
      expect(profile?.slug).toBe('ada-lovelace')
      expect(await emailsQueued(db)).toEqual(
        expect.arrayContaining(['kyc-result', 'application-received', 'application-decision']),
      )

      // Acceptance: the BVN and the full account number are nowhere in the database. The scan
      // does find values that are stored, so an empty result means something.
      expect(await tablesContaining(db, 'LOVELACE')).toContain('kyc_checks.matched_name')
      expect(await tablesContaining(db, BVN)).toEqual([])
      expect(await tablesContaining(db, ACCOUNT)).toEqual([])
    })
  })

  it('records failed and manual-review KYC, and a bank name mismatch waits for review', async () => {
    await withRollback(async (db) => {
      const learner = await applicant(db)
      const { ctx, payouts } = setup(db, learner)
      expect(
        await codeOf(
          startKyc(ctx(), { method: 'nin', number: '12345678900', selfieImage: SELFIE }),
        ),
      ).toBe('KYC_FAILED')
      expect((await getMyApplication(ctx())).kyc?.status).toBe('failed')
      expect(
        await codeOf(addPayoutAccount(ctx(), { bankCode: '058', accountNumber: ACCOUNT })),
      ).toBe('KYC_REQUIRED')

      const manual = await startKyc(ctx(), {
        method: 'nin',
        number: '12345678901',
        selfieImage: SELFIE,
      })
      expect(manual.status).toBe('manual_review')

      payouts.setAccountName(ACCOUNT, 'BOLA ADEYEMI')
      const account = await addPayoutAccount(ctx(), { bankCode: '058', accountNumber: ACCOUNT })
      expect(account.status).toBe('pending_review')
      expect(Number(account.nameMatchScore)).toBeLessThan(0.85)

      await saveApplication(ctx(), { about, step: 1 })
      await saveApplication(ctx(), { expertise, step: 2 })
      const mine = await submitApplication(ctx())
      const rev = await reviewer(db)
      await decideApplication(ctx(rev), {
        id: mine.application?.id ?? '',
        decision: 'approve',
        reason: 'Checked the selfie and bank name by hand.',
      })
      const after = await getMyApplication(ctx())
      expect(after.kyc?.status).toBe('verified')
      expect(after.payoutAccount?.status).toBe('active')
    })
  })

  it('rejects with a reason and blocks reapplying for 30 days', async () => {
    await withRollback(async (db) => {
      const learner = await applicant(db)
      const { ctx } = setup(db, learner)
      await saveApplication(ctx(), { about, step: 1 })
      await saveApplication(ctx(), { expertise, step: 2 })
      await startKyc(ctx(), { method: 'bvn', number: BVN, selfieImage: SELFIE })
      await addPayoutAccount(ctx(), { bankCode: '058', accountNumber: ACCOUNT })
      const mine = await submitApplication(ctx())
      const rev = await reviewer(db)
      const id = mine.application?.id ?? ''
      await decideApplication(ctx(rev), {
        id,
        decision: 'reject',
        reason: 'The sample link is broken.',
      })
      expect(
        await codeOf(
          decideApplication(ctx(rev), { id, decision: 'approve', reason: 'Changed my mind.' }),
        ),
      ).toBe('APPLICATION_ALREADY_DECIDED')

      const state = await getMyApplication(ctx())
      expect(state.application?.decisionReason).toBe('The sample link is broken.')
      expect(state.canReapplyAt?.toISOString()).toBe('2026-10-26T10:00:00.000Z')
      expect(await codeOf(saveApplication(ctx(), { about, step: 1 }))).toBe('REAPPLY_TOO_SOON')

      const later = await saveApplication(ctx(learner, new Date('2026-10-27T10:00:00Z')), {
        about,
        step: 1,
      })
      expect(later.application?.status).toBe('draft')
      expect(later.application?.id).not.toBe(id)
    })
  })

  it('needs step-up to replace a payout account, then holds payouts 72 hours', async () => {
    await withRollback(async (db) => {
      const learner = await applicant(db)
      const { ctx } = setup(db, learner)
      await startKyc(ctx(), { method: 'bvn', number: BVN, selfieImage: SELFIE })
      await addPayoutAccount(ctx(), { bankCode: '058', accountNumber: ACCOUNT })
      expect(
        await codeOf(addPayoutAccount(ctx(), { bankCode: '057', accountNumber: '0123456781' })),
      ).toBe('TWO_FACTOR_REQUIRED')
      const secured: UserActor = {
        ...learner,
        twoFactorEnabled: true,
        twoFactorVerifiedAt: new Date('2026-09-26T09:00:00Z'),
      }
      const replaced = await addPayoutAccount(ctx(secured), {
        bankCode: '057',
        accountNumber: '0123456781',
      })
      expect(replaced.payoutsAllowedFrom.toISOString()).toBe('2026-09-29T10:00:00.000Z')
      const all = await db
        .select({ status: schema.payoutAccounts.status })
        .from(schema.payoutAccounts)
        .where(eq(schema.payoutAccounts.userId, learner.userId))
      expect(all.map((a) => a.status).sort()).toEqual(['active', 'disabled'])
      expect(await emailsQueued(db)).toContain('payout-account-changed')
    })
  })

  it('keeps the queue to reviewers with 2FA, and nobody decides their own application', async () => {
    await withRollback(async (db) => {
      const financeId = await insertUser(db, { roles: ['learner', 'finance'] })
      const { ctx } = setup(db, testUser(['learner', 'finance'], { userId: financeId }))
      expect(await codeOf(listApplications(ctx(), { status: 'open', limit: 10 }))).toBe(
        'STAFF_ONLY',
      )

      const rev = await reviewer(db)
      const noTwoFactor = { ...rev, twoFactorEnabled: false }
      expect(await codeOf(listApplications(ctx(noTwoFactor), { status: 'open', limit: 10 }))).toBe(
        'TWO_FACTOR_REQUIRED',
      )

      // A reviewer who applied to teach can't approve themselves.
      const own = setup(db, { ...rev, twoFactorEnabled: false, twoFactorVerifiedAt: null }).ctx
      await db
        .update(schema.user)
        .set({ name: 'Ada Lovelace' })
        .where(eq(schema.user.id, rev.userId))
      await saveApplication(own(), { about, step: 1 })
      await saveApplication(own(), { expertise, step: 2 })
      await startKyc(own(), { method: 'bvn', number: BVN, selfieImage: SELFIE })
      await addPayoutAccount(own(), { bankCode: '058', accountNumber: ACCOUNT })
      const mine = await submitApplication(own())
      expect(
        await codeOf(
          decideApplication(ctx(rev), {
            id: mine.application?.id ?? '',
            decision: 'approve',
            reason: 'Approving myself.',
          }),
        ),
      ).toBe('SELF_REVIEW_NOT_ALLOWED')
      expect(
        await codeOf(getApplicationDetail(ctx(rev), '01920000-0000-7000-8000-00000000ffff')),
      ).toBe('APPLICATION_NOT_FOUND')
    })
  })
})

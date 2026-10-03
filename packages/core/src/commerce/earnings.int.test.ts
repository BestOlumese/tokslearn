import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { insertUser, testUser } from '../kernel/testing'
import { checkLedgerIntegrity, instructorAccount, platformAccounts as P, post } from '../ledger'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  addToCart,
  completeOrder,
  earningLines,
  earningsCsv,
  earningsSummary,
  generateStatement,
  instructorsWithActivity,
  listStatements,
  releaseEarnings,
  requestRefund,
  sendRefund,
  settleRefunds,
  startCheckout,
  statementDownloadUrl,
} from '.'

afterAll(closeTestDb)

const PAID = new Date('2026-09-10T10:00:00Z')
const DAY = 86_400_000
const at = (days: number) => new Date(PAID.getTime() + days * DAY)

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  let n = 0
  const sell = async () => {
    n++
    const buyerId = await insertUser(db, { name: `Buyer ${n}`, email: `buyer${n}@example.com` })
    const c = env.ctx(testUser(['learner'], { userId: buyerId }), PAID)
    await addToCart(c, { itemType: 'course', itemId: course.id })
    const s = await startCheckout(c, {
      expectedTotalKobo: 1_500_000n,
      idempotencyKey: `sell-${n}-xxxx`,
      anonymousId: null,
    })
    await completeOrder(c, { reference: s.publicId, via: 'confirm', userId: buyerId })
    // The fake Paystack stamps the real time; put the sale on the test's clock.
    await db.update(schema.orders).set({ paidAt: PAID }).where(eq(schema.orders.id, s.orderId))
    await db
      .update(schema.orderItems)
      .set({ refundableUntil: at(7) })
      .where(eq(schema.orderItems.orderId, s.orderId))
    return { ...s, buyerId }
  }
  return { env, owner, course, sell }
}

describe('earnings', () => {
  it('releases pending shares once the window closes, once', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await w.sell()
      await w.sell()
      const me = w.env.ctx(w.owner, at(1))
      let s = await earningsSummary(me)
      // ₦15,000 at 40%, the instructor carrying 60% of a ₦325 fee: ₦8,805 each.
      expect(s).toMatchObject({ pendingKobo: 1_761_000n, availableKobo: 0n })
      expect(s.upcomingReleases.map((u) => u.amountKobo)).toEqual([1_761_000n])
      expect(s.problems).toEqual(['no_payout_account', 'kyc_not_verified', 'two_factor_off'])

      const job = (d: Date) => w.env.ctx({ kind: 'system', reason: 'earnings-release' }, d)
      expect(await releaseEarnings(job(at(6)))).toEqual({ released: 0, done: true })
      expect(await releaseEarnings(job(at(7)))).toEqual({ released: 2, done: true })
      expect(await releaseEarnings(job(at(8)))).toEqual({ released: 0, done: true })
      s = await earningsSummary(w.env.ctx(w.owner, at(8)))
      expect(s).toMatchObject({ pendingKobo: 0n, availableKobo: 1_761_000n })
      expect((await checkLedgerIntegrity(me)).ok).toBe(true)

      const lines = await earningLines(me, {})
      expect(lines.items).toHaveLength(2)
      expect(lines.items[0]).toMatchObject({
        pricePaidKobo: 1_500_000n,
        shareKobo: 880_500n,
        deductionsKobo: 619_500n,
        status: 'available',
      })
      const page = await earningLines(me, { limit: 1 })
      expect(page.hasMore).toBe(true)
      expect((await earningLines(me, { before: page.items[0]?.orderItemId })).items).toHaveLength(1)
      const csv = await earningsCsv(me, {})
      expect(csv.csv.split('\n')).toHaveLength(3)
      expect(csv.csv.split('\n')[1]).toContain(',15000.00,6195.00,195.00,8805.00,')

      // Learners don't see an earnings page.
      const learner = testUser(['learner'], { userId: await insertUser(db, { name: 'Ada' }) })
      expect(await codeOf(earningsSummary(w.env.ctx(learner, at(1))))).toBe('INSTRUCTOR_REQUIRED')
    })
  })

  it('makes a monthly statement once, emails it, and lets only the owner download it', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await w.sell()
      const job = w.env.ctx(
        { kind: 'system', reason: 'statements' },
        new Date('2026-10-01T05:00:00Z'),
      )
      await releaseEarnings(w.env.ctx({ kind: 'system', reason: 'release' }, at(8)))
      expect(await instructorsWithActivity(job, '2026-09')).toEqual([w.owner.userId])
      expect(
        await generateStatement(job, { instructorId: w.owner.userId, month: '2026-09' }),
      ).toEqual({
        created: true,
      })
      expect(
        await generateStatement(job, { instructorId: w.owner.userId, month: '2026-09' }),
      ).toEqual({
        created: false,
      })
      expect(w.env.statements.rendered).toHaveLength(1)
      expect(w.env.statements.rendered[0]).toMatchObject({
        monthLabel: 'September 2026',
        courses: [{ sales: 1, refunds: 0, gross: '₦15,000', share: '₦8,805' }],
      })
      const [statement] = await listStatements(w.env.ctx(w.owner, at(30)))
      expect(statement).toMatchObject({
        month: '2026-09',
        totals: {
          sales: 1,
          shareEarnedKobo: '880500',
          releasedKobo: '880500',
          closingAvailableKobo: '880500',
        },
      })
      expect(await statementDownloadUrl(w.env.ctx(w.owner, at(30)), '2026-09')).toContain(
        'statement',
      )
      const other = testUser(['learner', 'instructor'], {
        userId: await insertUser(db, { name: 'Other' }),
      })
      expect(await codeOf(statementDownloadUrl(w.env.ctx(other, at(30)), '2026-09'))).toBe(
        'FILE_NOT_FOUND',
      )
      const mails = (await db.select().from(schema.outbox))
        .map((o) => o.payload as { id?: string })
        .filter((p) => p.id === 'monthly-statement')
      expect(mails).toHaveLength(1)
    })
  })

  it('counts a refund, a release and a payout in the month, and moves payday past a holiday', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await db
        .insert(schema.settings)
        .values([
          { key: 'payout_day', value: 5 },
          { key: 'min_payout_kobo', value: '500000' },
          { key: 'public_holidays', value: ['2026-10-05'] },
        ])
        .onConflictDoUpdate({ target: schema.settings.key, set: { value: sql`excluded.value` } })
      const kept = await w.sell()
      const returned = await w.sell()

      // The second buyer asks for a refund two days in; Paystack processes it.
      const buyer = w.env.ctx(testUser(['learner'], { userId: returned.buyerId }), at(2))
      const [item] = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, returned.orderId))
      const r = await requestRefund(buyer, { orderItemId: item?.id ?? '', reasonCode: 'quality' })
      const job = (d: Date) => w.env.ctx({ kind: 'system', reason: 'test' }, d)
      await sendRefund(job(at(2)), r.id)
      w.env.paystack.settleRefund([...w.env.paystack.refunds.keys()][0] ?? '', 'processed')
      await settleRefunds(job(at(2)), { olderThanMs: 0 })

      // The first sale releases, then (as a payout run will) leaves for the bank.
      expect(await releaseEarnings(job(at(8)))).toEqual({ released: 1, done: true })
      const id = w.owner.userId
      const pay = (key: string, lines: Parameters<typeof post>[1]['lines']) =>
        post(job(at(15)), {
          kind: 'payout',
          ref: { type: 'order', id: kept.orderId },
          idempotencyKey: key,
          lines,
        })
      await pay('test-payout', [
        { account: instructorAccount(id, 'available'), debit: 880_500n },
        { account: instructorAccount(id, 'in_transit'), credit: 880_500n },
      ])
      await pay('test-payout-success', [
        { account: instructorAccount(id, 'in_transit'), debit: 880_500n },
        { account: P.cashPaystack, credit: 880_500n },
      ])

      const me = w.env.ctx(w.owner, at(16))
      const s = await earningsSummary(me)
      expect(s).toMatchObject({
        pendingKobo: 0n,
        availableKobo: 0n,
        inTransitKobo: 0n,
        paidThisYearKobo: 880_500n,
        minPayoutKobo: 500_000n,
      })
      // 5 October 2026 is a holiday here, so payday is Tuesday the 6th, 09:00 Lagos.
      expect(s.nextPayoutOn.toISOString()).toBe('2026-10-06T08:00:00.000Z')
      expect((await earningLines(me, { status: 'refunded' })).items).toHaveLength(1)
      // Only a payout run marks items paid out (PR 3); these entries just move the money.
      expect((await earningLines(me, { status: 'available' })).items).toHaveLength(1)

      const month = job(new Date('2026-10-01T05:00:00Z'))
      await generateStatement(month, { instructorId: id, month: '2026-09' })
      const [statement] = await listStatements(me)
      expect(statement?.totals).toMatchObject({
        sales: 2,
        refunds: 1,
        refundedShareKobo: '880500',
        releasedKobo: '880500',
        paidOutKobo: '880500',
        closingAvailableKobo: '0',
      })
      expect(w.env.statements.rendered[0]?.courses).toEqual([
        expect.objectContaining({ sales: 2, refunds: 1, share: '₦8,805' }),
      ])
      expect((await checkLedgerIntegrity(me)).ok).toBe(true)
    })
  })
})

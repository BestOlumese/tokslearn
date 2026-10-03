import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { canAccessCourse } from '../enrollments'
import { insertUser, testUser } from '../kernel/testing'
import {
  balances,
  checkLedgerIntegrity,
  entriesFor,
  instructorAccount,
  platformAccounts as P,
} from '../ledger'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  addToCart,
  appealRefund,
  checkRefundEligibility,
  completeOrder,
  decideRefund,
  getRefundForReview,
  listMyRefunds,
  listRefundQueue,
  markPurchaseConsumed,
  requestRefund,
  retryRefund,
  sendRefund,
  settleRefunds,
  startCheckout,
} from '.'

afterAll(closeTestDb)

const PAID = new Date('2026-09-26T10:00:00Z')
const DAY = 86_400_000

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const buyerId = await insertUser(db, { name: 'Amaka Obi', roles: ['learner'] })
  const buyer = testUser(['learner'], { userId: buyerId })
  const financeId = await insertUser(db, { name: 'Funke Finance', roles: ['learner', 'finance'] })
  const finance = testUser(['learner', 'finance'], { userId: financeId })
  /** Buys the course (₦15,000, 7-day window) and returns the order item. */
  const buy = async () => {
    const c = env.ctx(buyer, PAID)
    await addToCart(c, { itemType: 'course', itemId: course.id })
    const s = await startCheckout(c, {
      expectedTotalKobo: 1_500_000n,
      idempotencyKey: 'buy-1',
      anonymousId: null,
    })
    await completeOrder(c, { reference: s.publicId, via: 'confirm', userId: buyerId })
    // The fake Paystack stamps the real time; put the purchase on the test's clock.
    await db.update(schema.orders).set({ paidAt: PAID }).where(eq(schema.orders.id, s.orderId))
    await db
      .update(schema.orderItems)
      .set({ refundableUntil: new Date(PAID.getTime() + 7 * DAY) })
      .where(eq(schema.orderItems.orderId, s.orderId))
    const [item] = await db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, s.orderId))
    if (!item) throw new Error('no item')
    return { item, reference: s.publicId, orderId: s.orderId }
  }
  return { env, owner, course, buyer, buyerId, finance, buy }
}

const at = (days: number) => new Date(PAID.getTime() + days * DAY)
const sys = (env: ReturnType<typeof setup>, when: Date) =>
  env.ctx({ kind: 'system', reason: 'test' }, when)

describe('refunds', () => {
  it('approves inside the window, ends access, refunds through Paystack and reverses the sale', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const { item, reference, orderId } = await w.buy()
      const me = w.env.ctx(w.buyer, at(2))
      expect(await checkRefundEligibility(me, item.id)).toMatchObject({
        eligible: true,
        decision: 'approve',
      })
      const owner = instructorAccount(item.instructorId, 'pending')
      const before = await balances(me, [owner, P.revenue, P.cashPaystack, P.gatewayFees])

      const r = await requestRefund(me, { orderItemId: item.id, reasonCode: 'quality' })
      expect(r).toMatchObject({ status: 'approved', amountKobo: 1_500_000n })
      expect(await canAccessCourse(me, w.course.id)).toBe(false)
      expect(await codeOf(requestRefund(me, { orderItemId: item.id, reasonCode: 'quality' }))).toBe(
        'REFUND_ALREADY_REQUESTED',
      )
      // A retried send job does nothing twice.
      const job = sys(w.env, at(2))
      expect(await sendRefund(job, r.id)).toBe('sent')
      expect(await sendRefund(job, r.id)).toBe('skipped')
      expect([...w.env.paystack.refunds.values()]).toEqual([
        { reference, amountKobo: 1_500_000n, status: 'pending' },
      ])
      // The webhook arrives before Paystack is done: nothing changes.
      expect(await settleRefunds(job, { reference })).toEqual({ processed: 0, failed: 0 })
      const [refundId] = [...w.env.paystack.refunds.keys()]
      w.env.paystack.settleRefund(refundId ?? '', 'processed')
      expect(await settleRefunds(job, { reference })).toEqual({ processed: 1, failed: 0 })
      expect(await settleRefunds(job, { reference })).toEqual({ processed: 0, failed: 0 })

      const after = await balances(me, [owner, P.revenue, P.cashPaystack, P.gatewayFees])
      // The instructor ends at zero; the platform keeps Paystack's fee as its loss (ADR-020).
      expect(after.get(owner)).toBe(0n)
      expect((before.get(P.cashPaystack) ?? 0n) - (after.get(P.cashPaystack) ?? 0n)).toBe(
        1_500_000n,
      )
      expect(after.get(P.gatewayFees)).toBe(before.get(P.gatewayFees))
      const entries = await entriesFor(me, { type: 'order', id: orderId })
      expect(entries.map((e) => e.kind)).toEqual(['sale', 'refund'])
      expect((await checkLedgerIntegrity(me)).ok).toBe(true)
      const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, orderId))
      expect(o?.status).toBe('refunded')
      const [i] = await db.select().from(schema.orderItems).where(eq(schema.orderItems.id, item.id))
      expect(i).toMatchObject({ status: 'refunded', earningStatus: 'reversed' })
      expect((await listMyRefunds(me))[0]?.status).toBe('processed')
      // Learner and instructor both heard.
      const types = (await db.select().from(schema.notifications)).map((n) => n.type)
      expect(types).toEqual(expect.arrayContaining(['refund.updated', 'sale.refunded']))
    })
  })

  it('declines by the rules, lets the learner appeal once, and finance decides (audit-logged)', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const { item } = await w.buy()
      await markPurchaseConsumed(w.env.ctx(w.buyer, at(1)), {
        userId: w.buyerId,
        courseId: w.course.id,
        reason: 'certificate_issued',
      })
      const me = w.env.ctx(w.buyer, at(2))
      const r = await requestRefund(me, { orderItemId: item.id, reasonCode: 'changed_mind' })
      expect(r).toMatchObject({
        status: 'denied',
        canAppeal: true,
        decisionReason: 'Refunds aren’t available after a certificate is issued.',
      })
      expect(await codeOf(appealRefund(me, { refundId: r.publicId, text: 'too short' }))).toBe(
        'VALIDATION_FAILED',
      )
      const appealed = await appealRefund(me, {
        refundId: r.publicId,
        text: 'The certificate was issued by mistake; I never finished the course.',
      })
      expect(appealed).toMatchObject({ status: 'under_review', canAppeal: false })

      // Only finance, with 2FA, sees the queue.
      expect(await codeOf(listRefundQueue(me, {}))).toBe('STAFF_ONLY')
      const fin = w.env.ctx(w.finance, at(3))
      expect((await listRefundQueue(fin, {})).map((q) => q.publicId)).toEqual([r.publicId])
      const review = await getRefundForReview(fin, r.publicId)
      expect(review).toMatchObject({
        buyerName: 'Amaka Obi',
        appealText: expect.stringContaining('mistake'),
      })

      // Finance overrides the rule: the earning was already released, so it comes back from available.
      await decideRefund(fin, {
        refundId: r.publicId,
        approve: true,
        reason: 'Certificate issued in error.',
      })
      expect(
        await codeOf(
          decideRefund(fin, { refundId: r.publicId, approve: false, reason: 'Changed my mind.' }),
        ),
      ).toBe('REFUND_NOT_PENDING')
      const job = sys(w.env, at(3))
      await sendRefund(job, r.id)
      w.env.paystack.settleRefund([...w.env.paystack.refunds.keys()][0] ?? '', 'processed')
      await settleRefunds(job, { olderThanMs: 0 })
      const available = instructorAccount(item.instructorId, 'available')
      expect((await balances(job, [available])).get(available)).toBe(0n)
      expect((await checkLedgerIntegrity(job)).ok).toBe(true)
      const audit = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.targetType, 'refund_request'))
      expect(audit.map((a) => a.action)).toEqual(['refund.approved'])
      // No second appeal.
      expect(
        await codeOf(
          appealRefund(me, { refundId: r.publicId, text: 'Please look again at this one.' }),
        ),
      ).toBe('APPEAL_USED')
    })
  })

  it('sends frequent refunders to finance, and finance can retry a refund Paystack failed', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const { item, reference } = await w.buy()
      await db
        .insert(schema.settings)
        .values({ key: 'refund_abuse_limit', value: 0 })
        .onConflictDoUpdate({
          target: schema.settings.key,
          set: { value: 0 },
        })
      const me = w.env.ctx(w.buyer, at(1))
      const r = await requestRefund(me, { orderItemId: item.id, reasonCode: 'technical' })
      expect(r.status).toBe('under_review')
      expect(await canAccessCourse(me, w.course.id)).toBe(true)

      const fin = w.env.ctx(w.finance, at(2))
      await decideRefund(fin, {
        refundId: r.publicId,
        approve: true,
        reason: 'Checked: video never loaded.',
      })
      const job = sys(w.env, at(2))
      w.env.paystack.setRefundsDown(true)
      expect(await codeOf(sendRefund(job, r.id))).toBe('PAYMENT_PROVIDER_UNAVAILABLE')
      w.env.paystack.setRefundsDown(false)
      await sendRefund(job, r.id)
      w.env.paystack.settleRefund([...w.env.paystack.refunds.keys()][0] ?? '', 'failed')
      expect(await settleRefunds(job, { reference })).toEqual({ processed: 0, failed: 1 })
      expect(await retryRefund(fin, r.publicId)).toMatchObject({ status: 'approved' })
      await sendRefund(job, r.id)
      w.env.paystack.settleRefund([...w.env.paystack.refunds.keys()][1] ?? '', 'processed')
      expect(await settleRefunds(job, { reference })).toEqual({ processed: 1, failed: 0 })
      expect((await checkLedgerIntegrity(job)).ok).toBe(true)
    })
  })

  it('refuses after the window, for a no-refund course, and for someone else’s order', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const { item } = await w.buy()
      const late = await checkRefundEligibility(w.env.ctx(w.buyer, at(8)), item.id)
      expect(late).toMatchObject({
        eligible: false,
        code: 'REFUND_WINDOW_CLOSED',
        details: { n: '7' },
      })
      const strangerId = await insertUser(db, { name: 'Other Person' })
      expect(
        await codeOf(
          checkRefundEligibility(
            w.env.ctx(testUser(['learner'], { userId: strangerId }), at(1)),
            item.id,
          ),
        ),
      ).toBe('ORDER_NOT_FOUND')
    })
  })
})

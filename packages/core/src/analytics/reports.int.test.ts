import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import {
  addToCart,
  completeOrder,
  requestRefund,
  sendRefund,
  settleRefunds,
  startCheckout,
} from '../commerce'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import { periodRange, platformDashboard } from '.'

afterAll(closeTestDb)

const NOW = new Date('2026-10-04T15:00:00Z')
const DAY = 86_400_000

async function sell(
  db: Db,
  env: ReturnType<typeof setup>,
  courseId: string,
  n: number,
  paidAt: Date,
) {
  const buyerId = await insertUser(db, { name: `Buyer ${n}`, email: `b${n}@example.com` })
  const buyer = testUser(['learner'], { userId: buyerId })
  const c = env.ctx(buyer, paidAt)
  await addToCart(c, { itemType: 'course', itemId: courseId })
  const s = await startCheckout(c, {
    expectedTotalKobo: 1_500_000n,
    idempotencyKey: `dash-${n}-xxxx`,
    anonymousId: null,
  })
  await completeOrder(c, { reference: s.publicId, via: 'confirm', userId: buyerId })
  await db.update(schema.orders).set({ paidAt }).where(eq(schema.orders.id, s.orderId))
  await db
    .update(schema.orderItems)
    .set({ refundableUntil: new Date(paidAt.getTime() + 7 * DAY) })
    .where(eq(schema.orderItems.orderId, s.orderId))
  return { buyer, orderId: s.orderId }
}

describe('platform dashboard', () => {
  it('counts sales, revenue and refunds per period, and raises what needs attention', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      // Two sales today, one 10 days ago; today's second buyer is refunded.
      await sell(db, env, course.id, 1, new Date(NOW.getTime() - 2 * 60 * 60_000))
      const refunded = await sell(db, env, course.id, 2, new Date(NOW.getTime() - 60 * 60_000))
      await sell(db, env, course.id, 3, new Date(NOW.getTime() - 10 * DAY))
      const [item] = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, refunded.orderId))
      const r = await requestRefund(env.ctx(refunded.buyer, NOW), {
        orderItemId: item?.id ?? '',
        reasonCode: 'quality',
      })
      const job = env.ctx({ kind: 'system', reason: 'test' }, NOW)
      await sendRefund(job, r.id)
      env.paystack.settleRefund([...env.paystack.refunds.keys()][0] ?? '', 'processed')
      await settleRefunds(job, { olderThanMs: 0 })
      await db.insert(schema.payoutRuns).values({
        publicId: 'PR-2026-10',
        month: '2026-10',
        payOn: new Date('2026-10-05T08:00:00Z'),
      })

      const staffId = await insertUser(db, { roles: ['learner', 'support'] })
      const staff = env.ctx(testUser(['learner', 'support'], { userId: staffId }), NOW)
      const today = await platformDashboard(staff, { period: 'today' })
      expect(today).toMatchObject({
        orders: 2,
        gmvKobo: 3_000_000n,
        refunds: 1,
        refundedKobo: 1_500_000n,
        refundRatePct: 50,
      })
      // ₦15,000 at 40% plus the instructor's part of the fee, twice, less the refunded one.
      expect(today.revenueKobo).toBeGreaterThan(0n)
      expect(today.revenueKobo).toBeLessThan(1_500_000n)
      expect(today.alerts).toEqual(
        expect.arrayContaining([
          { kind: 'ledger_never_checked' },
          { kind: 'payout_run_waiting', runId: 'PR-2026-10', label: 'October 2026' },
        ]),
      )
      const month = await platformDashboard(staff, { period: '30d' })
      expect(month).toMatchObject({ orders: 3, gmvKobo: 4_500_000n })
      expect(month.refundRatePct).toBe(33.3)

      const learner = env.ctx(testUser(['learner'], { userId: staffId }), NOW)
      expect(await codeOf(platformDashboard(learner, { period: 'today' }))).toBe('STAFF_ONLY')
    })
  })

  it('starts "today" at midnight in Lagos', () => {
    expect(periodRange(new Date('2026-10-04T23:30:00Z'), 'today').from.toISOString()).toBe(
      '2026-10-04T23:00:00.000Z',
    )
    expect(periodRange(NOW, 'today').from.toISOString()).toBe('2026-10-03T23:00:00.000Z')
  })
})

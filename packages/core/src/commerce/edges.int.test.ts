import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createBundle } from '../courses'
import { enrollFree } from '../enrollments'
import { insertUser, testUser } from '../kernel/testing'
import { balanceOf, entriesFor, listEntries } from '../ledger'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  abandonStaleOrders,
  addToCart,
  completeOrder,
  createInstructorCoupon,
  getCart,
  getPublicBundle,
  listMyReferralLinks,
  previewCart,
  reconcilePendingOrders,
  recordReferralVisit,
  setCartCoupon,
  startCheckout,
  validateCoupon,
} from '.'

afterAll(closeTestDb)

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const buyer = testUser(['learner'], { userId: await insertUser(db, { roles: ['learner'] }) })
  return { env, owner, reviewer, course, buyer }
}

const setSetting = (db: Db, key: string, value: unknown) =>
  db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })

describe('checkout edges', () => {
  it('fails cleanly when Paystack is down at the start, and retries work afterwards', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer } = await world(db)
      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      env.paystack.setInitializeDown(true)
      expect(
        await codeOf(
          startCheckout(c, {
            expectedTotalKobo: 1_500_000n,
            idempotencyKey: 'down',
            anonymousId: null,
          }),
        ),
      ).toBe('PAYMENT_PROVIDER_UNAVAILABLE')
      const [failed] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.userId, buyer.userId))
      expect(failed).toMatchObject({ status: 'failed', failureReason: 'provider_unavailable' })
      env.paystack.setInitializeDown(false)
      const ok = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'up',
        anonymousId: null,
      })
      expect(ok.status).toBe('pending')
      expect(await codeOf(completeOrder(c, { reference: 'TL-NOSUCH01', via: 'confirm' }))).toBe(
        'ORDER_NOT_FOUND',
      )
      expect(
        await codeOf(
          startCheckout(env.ctx(testUser(['learner'], { userId: await insertUser(db) })), {
            expectedTotalKobo: 1n,
            idempotencyKey: 'empty',
            anonymousId: null,
          }),
        ),
      ).toBe('CART_EMPTY')
    })
  })

  it('carves VAT out of commission when switched on, and lets the platform bear the fee', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, buyer } = await world(db)
      await setSetting(db, 'tax_rules', { vatOnCommission: true, vatRateBps: 750 })
      await setSetting(db, 'gateway_fee_bearer', 'platform')
      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      const started = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'vat',
        anonymousId: null,
      })
      await completeOrder(c, { reference: started.publicId, via: 'confirm' })
      const [sale] = await entriesFor(c, { type: 'order', id: started.orderId })
      const line = (account: string) => sale?.lines.find((l) => l.account === account)?.amountKobo
      // Platform bears the fee: the instructor keeps 60% of ₦15,000 = ₦9,000.
      expect(line(`instructor:${owner.userId}:pending`)).toBe(900_000n)
      // VAT 7.5% of the ₦6,000 commission = ₦450, carved out of revenue.
      expect(line('tax:vat_payable')).toBe(45_000n)
      expect(line('platform:revenue')).toBe(600_000n - 45_000n)
      expect(await balanceOf(c, 'tax:vat_payable')).toBe(45_000n)
      const all = await listEntries(c, { limit: 5, cursor: 'not-a-cursor' })
      expect(all.items.length).toBeGreaterThan(0)
    })
  })

  it('keeps crons going when Paystack is unreachable', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer } = await world(db)
      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      const started = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'cron',
        anonymousId: null,
      })
      env.paystack.setOutcome(started.publicId, 'unreachable')
      // created_at comes from the database's clock; put it on the test's clock, or "next week"
      // stops being a week later once the real date passes it.
      await db
        .update(schema.orders)
        .set({ createdAt: new Date('2026-09-26T10:00:00Z') })
        .where(eq(schema.orders.id, started.orderId))
      const later = env.ctx({ kind: 'system', reason: 'cron' }, new Date('2026-09-26T10:30:00Z'))
      expect(await reconcilePendingOrders(later)).toEqual({ checked: 1, paid: 0 })
      const nextWeek = env.ctx({ kind: 'system', reason: 'cron' }, new Date('2026-10-03T10:00:00Z'))
      expect(await abandonStaleOrders(nextWeek)).toEqual({ abandoned: 0, paid: 0 })
      // Paystack back and paid meanwhile: the stale order completes instead of being abandoned.
      env.paystack.setOutcome(started.publicId, 'success')
      expect(await abandonStaleOrders(nextWeek)).toEqual({ abandoned: 0, paid: 1 })
    })
  })
})

describe('cart and coupon edges', () => {
  it('reports coupon problems on the cart, removes coupons, previews for signed-in owners', async () => {
    await withRollback(async (db) => {
      const { env, owner, reviewer, course, buyer } = await world(db)
      const other = await publishCourse(env, owner, reviewer, { title: 'Other course' })
      const c = env.ctx(buyer)
      await createInstructorCoupon(env.ctx(owner), {
        code: 'ONLYOTHER',
        kind: 'percent',
        percentOff: 10,
        appliesTo: 'course',
        targetId: other.id,
      })
      expect(await codeOf(setCartCoupon(c, 'ONLYOTHER'))).toBe('CART_EMPTY')
      expect(await codeOf(validateCoupon(c, 'ONLYOTHER'))).toBe('CART_EMPTY')
      await addToCart(c, { itemType: 'course', itemId: course.id })
      expect(await codeOf(setCartCoupon(c, 'ONLYOTHER'))).toBe('COUPON_NOT_APPLICABLE')
      expect(await codeOf(validateCoupon(c, 'ONLYOTHER'))).toBe('COUPON_NOT_APPLICABLE')
      // A saved coupon that stops fitting shows as an error, not a failure.
      await db
        .update(schema.carts)
        .set({ couponCode: 'ONLYOTHER' })
        .where(eq(schema.carts.userId, buyer.userId))
      expect((await getCart(c)).couponError).toBe('COUPON_NOT_APPLICABLE')
      await db
        .update(schema.carts)
        .set({ couponCode: 'GONE' })
        .where(eq(schema.carts.userId, buyer.userId))
      expect((await getCart(c)).couponError).toBe('COUPON_INVALID')
      expect((await setCartCoupon(c, null)).couponCode).toBeNull()
      expect((await setCartCoupon(c, '  ')).couponCode).toBeNull()

      const free = await publishCourse(env, owner, reviewer, { title: 'Free one', priceKobo: 0n })
      await enrollFree(c, free.id)
      const preview = await previewCart(c, {
        items: [
          { itemType: 'course', itemId: free.id },
          { itemType: 'course', itemId: other.id },
        ],
        couponCode: 'ONLYOTHER',
      })
      expect(preview.removed).toEqual([{ title: 'Free one', reason: 'owned' }])
      expect(preview.discountKobo).toBe(150_000n)
    })
  })

  it('shows live bundles only', async () => {
    await withRollback(async (db) => {
      const { env, owner, reviewer, course } = await world(db)
      const second = await publishCourse(env, owner, reviewer, { title: 'Second' })
      const input = { description: null, priceKobo: 2_000_000n, courseIds: [course.id, second.id] }
      const live = await createBundle(env.ctx(owner), {
        ...input,
        title: 'Live pack',
        status: 'active',
      })
      await createBundle(env.ctx(owner), { ...input, title: 'Draft pack', status: 'draft' })
      const shown = await getPublicBundle(env.ctx({ kind: 'anonymous' }), live.slug)
      expect(shown).toMatchObject({
        title: 'Live pack',
        priceKobo: 2_000_000n,
        compareAtKobo: 3_000_000n,
      })
      expect(shown?.courses.map((x) => x.title)).toEqual(['Excel for Accountants', 'Second'])
      expect(await getPublicBundle(env.ctx({ kind: 'anonymous' }), 'draft-pack-bundle')).toBeNull()
      expect(await getPublicBundle(env.ctx({ kind: 'anonymous' }), 'nope')).toBeNull()
    })
  })

  it('ignores switched-off referral links and visits with no browser id', async () => {
    await withRollback(async (db) => {
      const { env, owner } = await world(db)
      const [link] = await listMyReferralLinks(env.ctx(owner))
      const anon = env.ctx({ kind: 'anonymous' })
      expect(
        await recordReferralVisit(anon, {
          code: link?.code ?? '',
          anonymousId: null,
          userId: null,
        }),
      ).toBeNull()
      await db
        .update(schema.referralLinks)
        .set({ active: false })
        .where(eq(schema.referralLinks.id, link?.id ?? ''))
      expect(
        await recordReferralVisit(anon, { code: link?.code ?? '', anonymousId: 'b', userId: null }),
      ).toBeNull()
      expect(
        await recordReferralVisit(anon, { code: 'x', anonymousId: 'b', userId: null }),
      ).toBeNull()
    })
  })

  it('shows clicks still waiting in the counter', async () => {
    await withRollback(async (db) => {
      const { env, owner } = await world(db)
      const [first] = await listMyReferralLinks(env.ctx(owner))
      const base = env.ctx(owner)
      const live = {
        ...base,
        providers: {
          ...base.providers,
          clickCounter: {
            increment: async () => {},
            drain: async () => [],
            peek: async () => new Map([[first?.id ?? '', 4]]),
          },
        },
      }
      expect((await listMyReferralLinks(live)).find((l) => l.id === first?.id)?.clicks).toBe(4)
    })
  })
})

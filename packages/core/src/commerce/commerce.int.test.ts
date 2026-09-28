import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { canAccessCourse, enrollFree, listMyCourses } from '../enrollments'
import { insertUser, testUser } from '../kernel/testing'
import { balances, checkLedgerIntegrity, entriesFor, instructorAccount } from '../ledger'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  abandonStaleOrders,
  addToCart,
  checkOrderIntegrity,
  completeOrder,
  createInstructorCoupon,
  getCart,
  getMyOrder,
  listMyOrders,
  listMyReferralLinks,
  mergeCart,
  previewCart,
  reconcilePendingOrders,
  recordReferralVisit,
  setCartCoupon,
  startCheckout,
} from '.'

afterAll(closeTestDb)

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const buyerId = await insertUser(db, { name: 'Amaka Obi', roles: ['learner'] })
  const buyer = testUser(['learner'], { userId: buyerId })
  return { env, owner, reviewer, course, buyer, buyerId }
}

const itemsOf = (db: Db, orderId: string) =>
  db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderId))

describe('checkout and completeOrder', () => {
  it('sells a course organically at 40% with the fee shared, and enrolls the buyer', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, buyer, buyerId } = await world(db)
      const c = env.ctx(buyer)
      const cart = await addToCart(c, { itemType: 'course', itemId: course.id })
      expect(cart.totalKobo).toBe(1_500_000n)

      const started = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'k1',
        anonymousId: null,
      })
      expect(started).toMatchObject({ status: 'pending', accessCode: `ac_${started.publicId}` })
      expect(started.publicId).toMatch(/^TL-[0-9A-Z]{8}$/)
      // Same key → same order (double click).
      expect(
        (
          await startCheckout(c, {
            expectedTotalKobo: 1_500_000n,
            idempotencyKey: 'k1',
            anonymousId: null,
          })
        ).orderId,
      ).toBe(started.orderId)
      expect(await canAccessCourse(c, course.id)).toBe(false)

      const done = await completeOrder(c, {
        reference: started.publicId,
        via: 'confirm',
        userId: buyerId,
      })
      expect(done).toMatchObject({
        status: 'paid',
        courses: [{ id: course.id, slug: course.slug }],
      })
      expect(await canAccessCourse(c, course.id)).toBe(true)

      const [item] = await itemsOf(db, started.orderId)
      // Fee: 1.5% + ₦100 = ₦325. Instructor carries 60% of it (₦195).
      expect(item).toMatchObject({
        attributionSource: 'platform_organic',
        platformRateBps: 4000,
        gatewayFeeShareKobo: 32_500n,
        instructorShareKobo: 880_500n,
        platformShareKobo: 619_500n,
        status: 'active',
        earningStatus: 'pending',
      })
      // The refund window runs from Paystack's payment time.
      const [paidOrder] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, started.orderId))
      expect(item?.refundableUntil?.getTime()).toBe(
        (paidOrder?.paidAt?.getTime() ?? 0) + 7 * 86_400_000,
      )
      const [sale] = await entriesFor(c, { type: 'order', id: started.orderId })
      expect(sale?.lines.map((l) => [l.account, l.direction, l.amountKobo])).toEqual([
        ['platform:cash:paystack', 'debit', 1_467_500n],
        ['platform:gateway_fees', 'debit', 32_500n],
        [instructorAccount(owner.userId, 'pending'), 'credit', 880_500n],
        ['platform:revenue', 'credit', 619_500n],
      ])

      expect((await getCart(c)).items).toEqual([])
      const outbox = await db
        .select({ name: schema.outbox.eventName, payload: schema.outbox.payload })
        .from(schema.outbox)
      expect(outbox.map((o) => o.name)).toEqual(
        expect.arrayContaining(['order.paid', 'enrollment.created']),
      )
      expect(outbox.map((o) => (o.payload as { id?: string }).id)).toContain('order-receipt')

      const orders = await listMyOrders(c)
      expect(orders.items[0]).toMatchObject({
        publicId: started.publicId,
        status: 'paid',
        itemsCount: 1,
      })
      const receipt = await getMyOrder(c, started.publicId)
      expect(receipt.items[0]).toMatchObject({ refundPolicyDays: 7, netPriceKobo: 1_500_000n })
      expect(await codeOf(getMyOrder(env.ctx(owner), started.publicId))).toBe('ORDER_NOT_FOUND')
      expect((await listMyCourses(c))[0]).toMatchObject({ courseId: course.id, status: 'active' })
      expect(await codeOf(addToCart(c, { itemType: 'course', itemId: course.id }))).toBe(
        'ALREADY_ENROLLED',
      )

      // Confirm again, webhook, reconcile: nothing new.
      await completeOrder(c, { reference: started.publicId, via: 'webhook' })
      expect(await entriesFor(c, { type: 'order', id: started.orderId })).toHaveLength(1)
      expect((await checkOrderIntegrity(c)).ok).toBe(true)
      expect((await checkLedgerIntegrity(c)).ok).toBe(true)
    })
  })

  it('gives the referring instructor 97% and records the link', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, buyer } = await world(db)
      const links = await listMyReferralLinks(env.ctx(owner))
      const courseLink = links.find((l) => l.targetType === 'course')
      expect(links.map((l) => l.targetType).sort()).toEqual(['course', 'profile'])
      const visit = await recordReferralVisit(env.ctx({ kind: 'anonymous' }), {
        code: courseLink?.code ?? '',
        anonymousId: 'browser-1',
        userId: null,
      })
      expect(visit).toEqual({ path: `/courses/${course.slug}` })
      expect(
        await recordReferralVisit(env.ctx({ kind: 'anonymous' }), {
          code: 'nope-nope',
          anonymousId: 'b',
          userId: null,
        }),
      ).toBeNull()

      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      const started = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'r',
        anonymousId: 'browser-1',
      })
      await completeOrder(c, { reference: started.publicId, via: 'confirm' })
      const [item] = await itemsOf(db, started.orderId)
      expect(item).toMatchObject({
        attributionSource: 'instructor_referral',
        platformRateBps: 300,
        referralLinkId: courseLink?.id,
        instructorShareKobo: 1_423_475n,
        platformShareKobo: 76_525n,
      })
      const after = await listMyReferralLinks(env.ctx(owner))
      expect(after.find((l) => l.id === courseLink?.id)).toMatchObject({
        clicks: 1,
        sales: 1,
        earnedKobo: 1_423_475n,
      })
    })
  })

  it('leaves failed and pending payments unpaid, then completes a delayed bank transfer', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer } = await world(db)
      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      const failed = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'f',
        anonymousId: null,
      })
      env.paystack.setOutcome(failed.publicId, 'failed')
      expect((await completeOrder(c, { reference: failed.publicId, via: 'confirm' })).status).toBe(
        'failed',
      )
      expect(await canAccessCourse(c, course.id)).toBe(false)
      expect(await entriesFor(c, { type: 'order', id: failed.orderId })).toEqual([])

      // A new attempt: the bank transfer is still in flight when the popup closes.
      const transfer = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 't',
        anonymousId: null,
      })
      env.paystack.setOutcome(transfer.publicId, 'pending')
      expect(
        (await completeOrder(c, { reference: transfer.publicId, via: 'confirm' })).status,
      ).toBe('pending')
      // Minutes later Paystack's webhook arrives.
      env.paystack.setOutcome(transfer.publicId, 'success')
      env.paystack.setChannel(transfer.publicId, 'bank_transfer')
      const done = await completeOrder(env.ctx({ kind: 'system', reason: 'webhook' }), {
        reference: transfer.publicId,
        via: 'webhook',
      })
      expect(done.status).toBe('paid')
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, transfer.orderId))
      expect(order).toMatchObject({ status: 'paid', paymentChannel: 'bank_transfer' })
      expect(await canAccessCourse(c, course.id)).toBe(true)
    })
  })

  it('never enrolls on an amount mismatch', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer } = await world(db)
      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      const started = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'm',
        anonymousId: null,
      })
      env.paystack.setOutcome(started.publicId, 'amount_mismatch')
      expect(await codeOf(completeOrder(c, { reference: started.publicId, via: 'confirm' }))).toBe(
        'PAYMENT_AMOUNT_MISMATCH',
      )
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, started.orderId))
      expect(order?.status).toBe('pending')
      expect(await canAccessCourse(c, course.id)).toBe(false)
      env.paystack.setOutcome(started.publicId, 'unreachable')
      expect(await codeOf(completeOrder(c, { reference: started.publicId, via: 'confirm' }))).toBe(
        'PAYMENT_PROVIDER_UNAVAILABLE',
      )
    })
  })

  it('applies an instructor coupon; a 100% coupon skips Paystack and can be used once', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, buyer } = await world(db)
      await createInstructorCoupon(env.ctx(owner), {
        code: 'half',
        kind: 'percent',
        percentOff: 50,
        appliesTo: 'course',
        targetId: course.id,
      })
      await createInstructorCoupon(env.ctx(owner), {
        code: 'FREE-1',
        kind: 'percent',
        percentOff: 100,
        appliesTo: 'instructor_all',
      })
      expect(
        await codeOf(
          createInstructorCoupon(env.ctx(owner), {
            code: 'Half',
            kind: 'fixed',
            amountOffKobo: 100n,
            appliesTo: 'instructor_all',
          }),
        ),
      ).toBe('COUPON_CODE_TAKEN')

      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      expect(await codeOf(setCartCoupon(c, 'NOPE'))).toBe('COUPON_INVALID')
      const half = await setCartCoupon(c, 'half')
      expect(half).toMatchObject({
        couponCode: 'HALF',
        discountKobo: 750_000n,
        totalKobo: 750_000n,
      })
      expect(
        await codeOf(
          startCheckout(c, {
            expectedTotalKobo: 1_500_000n,
            idempotencyKey: 'x',
            anonymousId: null,
          }),
        ),
      ).toBe('CART_CHANGED')

      const free = await setCartCoupon(c, 'free-1')
      expect(free.totalKobo).toBe(0n)
      const started = await startCheckout(c, {
        expectedTotalKobo: 0n,
        idempotencyKey: 'z',
        anonymousId: null,
      })
      expect(started).toMatchObject({ status: 'paid', accessCode: null })
      expect(env.paystack.initialized.has(started.publicId)).toBe(false)
      const [enrollment] = await db
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, buyer.userId))
      expect(enrollment?.source).toBe('coupon_100')
      const [item] = await itemsOf(db, started.orderId)
      expect(item).toMatchObject({
        attributionSource: 'instructor_coupon',
        platformRateBps: 300,
        netPriceKobo: 0n,
      })
      expect(await entriesFor(c, { type: 'order', id: started.orderId })).toEqual([])
      const [coupon] = await db
        .select()
        .from(schema.coupons)
        .where(eq(schema.coupons.code, 'FREE-1'))
      expect(coupon?.redemptionCount).toBe(1)

      // Per-user limit 1: the same buyer can't use it again.
      const other = await publishCourse(env, owner, env.ctx(owner).actor as never, {
        title: 'Second course',
      }).catch(() => null)
      void other
      expect(await codeOf(setCartCoupon(c, 'FREE-1'))).toBe('COUPON_LIMIT_REACHED')
    })
  })

  it('checks cart rules: own course, previews for visitors, merging on sign-in', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, buyer } = await world(db)
      expect(
        await codeOf(addToCart(env.ctx(owner), { itemType: 'course', itemId: course.id })),
      ).toBe('OWN_COURSE')
      const preview = await previewCart(env.ctx({ kind: 'anonymous' }), {
        items: [
          { itemType: 'course', itemId: course.id },
          { itemType: 'course', itemId: course.id },
        ],
      })
      expect(preview).toMatchObject({ totalKobo: 1_500_000n, removed: [] })
      expect(preview.items).toHaveLength(1)
      const merged = await mergeCart(env.ctx(buyer), [{ itemType: 'course', itemId: course.id }])
      expect(merged.items.map((i) => i.itemId)).toEqual([course.id])
      expect(
        await codeOf(
          startCheckout(
            env.ctx(testUser(['learner'], { userId: buyer.userId, emailVerified: false })),
            { expectedTotalKobo: 1n, idempotencyKey: 'u', anonymousId: null },
          ),
        ),
      ).toBe('EMAIL_NOT_VERIFIED')
    })
  })

  it('reconciles missed confirmations and abandons stale attempts', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer } = await world(db)
      const c = env.ctx(buyer)
      await addToCart(c, { itemType: 'course', itemId: course.id })
      await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'rc',
        anonymousId: null,
      })
      const later = env.ctx({ kind: 'system', reason: 'cron' }, new Date('2026-09-26T10:30:00Z'))
      expect(await reconcilePendingOrders(later)).toEqual({ checked: 1, paid: 1 })

      await addToCart(c, {
        itemType: 'course',
        itemId: (
          await publishCourse(env, (await people(db)).owner, (await people(db)).reviewer, {
            title: 'Another',
          })
        ).id,
      }).catch(() => undefined)
      const stuck = await db
        .insert(schema.orders)
        .values({
          publicId: 'TL-STALE001',
          userId: buyer.userId,
          subtotalKobo: 100n,
          totalKobo: 100n,
          provider: 'paystack',
          providerReference: 'TL-STALE001',
          createdAt: new Date('2026-09-20T10:00:00Z'),
        })
        .returning()
      env.paystack.setOutcome('TL-STALE001', 'abandoned')
      const nextDay = env.ctx({ kind: 'system', reason: 'cron' }, new Date('2026-09-27T12:00:00Z'))
      expect((await abandonStaleOrders(nextDay)).abandoned).toBeGreaterThanOrEqual(1)
      const [row] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, stuck[0]?.id ?? ''))
      expect(row?.status).toBe('abandoned')
    })
  })

  it('releases earnings at once for courses without a refund window', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer, { refundPolicyDays: 0 })
      const buyerId = await insertUser(db, { roles: ['learner'] })
      const c = env.ctx(testUser(['learner'], { userId: buyerId }))
      await addToCart(c, { itemType: 'course', itemId: course.id })
      const started = await startCheckout(c, {
        expectedTotalKobo: 1_500_000n,
        idempotencyKey: 'n',
        anonymousId: null,
      })
      await completeOrder(c, { reference: started.publicId, via: 'confirm' })
      const [item] = await itemsOf(db, started.orderId)
      expect(item).toMatchObject({ status: 'non_refundable', earningStatus: 'available' })
      const b = await balances(c, [
        instructorAccount(owner.userId, 'pending'),
        instructorAccount(owner.userId, 'available'),
      ])
      expect([...b.values()]).toEqual([0n, 880_500n])
      expect(
        (await entriesFor(c, { type: 'order', id: started.orderId })).map((e) => e.kind),
      ).toEqual(['sale', 'release'])
    })
  })

  it('enrolls in free courses without an order', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const free = await publishCourse(env, owner, reviewer, { priceKobo: 0n })
      const paid = await publishCourse(env, owner, reviewer, { title: 'Paid one' })
      const learnerId = await insertUser(db, { roles: ['learner'] })
      const c = env.ctx(testUser(['learner'], { userId: learnerId }))
      const r = await enrollFree(c, free.id)
      expect(r).toMatchObject({ created: true, courseSlug: free.slug })
      expect((await enrollFree(c, free.id)).created).toBe(false)
      expect(await codeOf(enrollFree(c, paid.id))).toBe('COURSE_UNAVAILABLE')
      expect(await codeOf(enrollFree(env.ctx(owner), free.id))).toBe('OWN_COURSE')
      expect(await codeOf(addToCart(c, { itemType: 'course', itemId: free.id }))).toBe(
        'ALREADY_ENROLLED',
      )
      const [row] = await db
        .select()
        .from(schema.enrollments)
        .where(
          and(eq(schema.enrollments.userId, learnerId), eq(schema.enrollments.courseId, free.id)),
        )
      expect(row?.source).toBe('free')
    })
  })
})

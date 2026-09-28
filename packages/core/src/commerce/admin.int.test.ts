import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { createBundle, setCourseListing } from '../courses'
import {
  canAccessCourse,
  canAccessLesson,
  countEnrollments,
  grantEnrollment,
  revokeEnrollment,
} from '../enrollments'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  addInstructorRule,
  addToCart,
  addToWishlist,
  attributionFacts,
  cartCount,
  cartCourseIds,
  commissionInstructors,
  completeOrder,
  createInstructorCoupon,
  createPlatformCoupon,
  endRule,
  findUsableCoupon,
  flushReferralClicks,
  getCart,
  getOrderForStaff,
  ledgerOverview,
  listAllCoupons,
  listCommissionRules,
  listMyCoupons,
  listMyOrders,
  listWishlist,
  loadActiveRules,
  markPaymentEventProcessed,
  mergeCart,
  moveToWishlist,
  paystackEventId,
  recordPaidLanding,
  recordPaymentEvent,
  removeFromCart,
  removeFromWishlist,
  reverifyOrder,
  searchOrders,
  setCartCoupon,
  setCouponActive,
  setDefaultRate,
  startCheckout,
  validateCoupon,
  wishlistHas,
} from '.'

afterAll(closeTestDb)

const staffUser = async (db: Db, roles: Parameters<typeof testUser>[0]) =>
  testUser(roles, { userId: await insertUser(db, { roles }) })

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const buyer = await staffUser(db, ['learner'])
  const superAdmin = await staffUser(db, ['learner', 'super_admin'])
  const admin = await staffUser(db, ['learner', 'admin'])
  const finance = await staffUser(db, ['learner', 'finance'])
  await db.insert(schema.instructorProfiles).values({
    userId: owner.userId,
    slug: 'tobi-adeleke',
    displayName: 'Tobi Adeleke',
    approvedAt: new Date('2026-09-01T00:00:00Z'),
  })
  return { env, owner, reviewer, course, buyer, superAdmin, admin, finance }
}

async function buy(
  env: ReturnType<typeof setup>,
  buyer: ReturnType<typeof testUser>,
  courseId: string,
  key: string,
) {
  const c = env.ctx(buyer)
  await addToCart(c, { itemType: 'course', itemId: courseId })
  const cart = await getCart(c)
  const started = await startCheckout(c, {
    expectedTotalKobo: cart.totalKobo,
    idempotencyKey: key,
    anonymousId: null,
  })
  await completeOrder(c, { reference: started.publicId, via: 'confirm' })
  return started
}

describe('commission rules', () => {
  it('lets a super admin change defaults, add overrides and promos, and end them', async () => {
    await withRollback(async (db) => {
      const { env, owner, superAdmin, admin } = await world(db)
      const sa = env.ctx(superAdmin)
      expect(await codeOf(listCommissionRules(env.ctx(admin)))).toBe('STAFF_ONLY')
      expect(
        await codeOf(
          setDefaultRate(sa, { source: 'platform_organic', platformRateBps: 10_001, note: 'x' }),
        ),
      ).toBe('VALIDATION_FAILED')

      await setDefaultRate(sa, {
        source: 'platform_organic',
        platformRateBps: 3500,
        note: 'Lower for launch.',
      })
      const active = await loadActiveRules(sa)
      expect(
        active.find((r) => r.scope === 'default' && r.source === 'platform_organic')
          ?.platformRateBps,
      ).toBe(3500)

      const override = await addInstructorRule(sa, {
        scope: 'instructor',
        instructorId: owner.userId,
        source: 'platform_organic',
        platformRateBps: 3000,
        note: 'Top instructor.',
      })
      // A second override replaces the first.
      await addInstructorRule(sa, {
        scope: 'instructor',
        instructorId: owner.userId,
        source: 'platform_organic',
        platformRateBps: 2500,
        note: 'Even better.',
      })
      expect(
        await codeOf(
          addInstructorRule(sa, {
            scope: 'promo',
            instructorId: owner.userId,
            source: 'platform_organic',
            platformRateBps: 1000,
            note: 'x',
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      expect(
        await codeOf(
          addInstructorRule(sa, {
            scope: 'promo',
            instructorId: owner.userId,
            source: 'platform_organic',
            platformRateBps: 1000,
            startsAt: new Date('2026-10-10'),
            endsAt: new Date('2026-10-01'),
            note: 'x',
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      expect(
        await codeOf(
          addInstructorRule(sa, {
            scope: 'instructor',
            instructorId: superAdmin.userId,
            source: 'platform_organic',
            platformRateBps: 1000,
            note: 'x',
          }),
        ),
      ).toBe('USER_NOT_FOUND')
      const promo = await addInstructorRule(sa, {
        scope: 'promo',
        instructorId: owner.userId,
        source: 'platform_organic',
        platformRateBps: 1000,
        startsAt: new Date('2026-12-01'),
        endsAt: new Date('2026-12-31'),
        note: 'December promo.',
      })

      const rules = await listCommissionRules(sa)
      // Replaced: the first override now ends where the second begins.
      expect(rules.find((r) => r.id === override.id)?.endsAt).not.toBeNull()
      expect(rules.find((r) => r.id === promo.id)).toMatchObject({
        active: false,
        instructorName: 'Tobi Adeleke',
      })
      const defaultRule = rules.find((r) => r.scope === 'default' && r.active)
      expect(await codeOf(endRule(sa, { ruleId: defaultRule?.id ?? '', note: 'x' }))).toBe(
        'COMMISSION_DEFAULT_REQUIRED',
      )
      expect(
        await codeOf(endRule(sa, { ruleId: '01920000-0000-7000-8000-00000000dead', note: 'x' })),
      ).toBe('COMMISSION_RULE_NOT_FOUND')
      await endRule(sa, { ruleId: promo.id, note: 'Cancelled.' })
      const current = rules.find((r) => r.scope === 'instructor' && r.active)
      await endRule(sa, { ruleId: current?.id ?? '', note: 'Back to default.' })
      await endRule(sa, { ruleId: override.id, note: 'Already ended.' })
      expect((await commissionInstructors(sa)).map((i) => i.name)).toContain('Tobi Adeleke')
      const audits = await db.select({ action: schema.auditLog.action }).from(schema.auditLog)
      expect(audits.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          'commission.default_changed',
          'commission.promo_added',
          'commission.rule_ended',
        ]),
      )
    })
  })
})

describe('coupons', () => {
  it('validates terms, ownership, windows and limits', async () => {
    await withRollback(async (db) => {
      const { env, owner, reviewer, course, buyer, admin } = await world(db)
      const o = env.ctx(owner)
      const bad = [
        {
          code: 'x',
          kind: 'percent' as const,
          percentOff: 10,
          appliesTo: 'instructor_all' as const,
        },
        {
          code: 'OK1',
          kind: 'percent' as const,
          percentOff: 0,
          appliesTo: 'instructor_all' as const,
        },
        {
          code: 'OK2',
          kind: 'fixed' as const,
          amountOffKobo: 0n,
          appliesTo: 'instructor_all' as const,
        },
        { code: 'OK3', kind: 'percent' as const, percentOff: 5, appliesTo: 'course' as const },
        {
          code: 'OK4',
          kind: 'percent' as const,
          percentOff: 5,
          appliesTo: 'instructor_all' as const,
          startsAt: new Date('2026-10-02'),
          endsAt: new Date('2026-10-01'),
        },
        {
          code: 'OK5',
          kind: 'percent' as const,
          percentOff: 5,
          appliesTo: 'instructor_all' as const,
          maxRedemptions: 0,
        },
        {
          code: 'OK6',
          kind: 'percent' as const,
          percentOff: 5,
          appliesTo: 'instructor_all' as const,
          perUserLimit: 0,
        },
        { code: 'OK7', kind: 'percent' as const, percentOff: 5, appliesTo: 'all' as const },
      ]
      for (const input of bad)
        expect(await codeOf(createInstructorCoupon(o, input))).toBe('VALIDATION_FAILED')
      expect(
        await codeOf(
          createInstructorCoupon(env.ctx(buyer), {
            code: 'NOPE',
            kind: 'percent',
            percentOff: 5,
            appliesTo: 'instructor_all',
          }),
        ),
      ).toBe('INSTRUCTOR_REQUIRED')

      const other = await publishCourse(env, reviewer, owner).catch(() => null)
      void other
      const stranger = await staffUser(db, ['learner', 'instructor'])
      expect(
        await codeOf(
          createInstructorCoupon(env.ctx(stranger), {
            code: 'STEAL',
            kind: 'percent',
            percentOff: 5,
            appliesTo: 'course',
            targetId: course.id,
          }),
        ),
      ).toBe('COURSE_NOT_FOUND')
      expect(
        await codeOf(
          createInstructorCoupon(env.ctx(stranger), {
            code: 'STEAL2',
            kind: 'percent',
            percentOff: 5,
            appliesTo: 'bundle',
            targetId: course.id,
          }),
        ),
      ).toBe('BUNDLE_NOT_FOUND')

      await createInstructorCoupon(o, {
        code: 'SOON',
        kind: 'percent',
        percentOff: 5,
        appliesTo: 'instructor_all',
        startsAt: new Date('2027-01-01'),
      })
      await createInstructorCoupon(o, {
        code: 'OLD',
        kind: 'percent',
        percentOff: 5,
        appliesTo: 'instructor_all',
        startsAt: new Date('2026-01-01'),
        endsAt: new Date('2026-02-01'),
      })
      await createInstructorCoupon(o, {
        code: 'ONCE',
        kind: 'fixed',
        amountOffKobo: 100_000n,
        appliesTo: 'course',
        targetId: course.id,
        maxRedemptions: 1,
      })
      const b = env.ctx(buyer)
      expect(await codeOf(findUsableCoupon(b, 'soon', buyer.userId))).toBe('COUPON_INVALID')
      expect(await codeOf(findUsableCoupon(b, 'old', buyer.userId))).toBe('COUPON_EXPIRED')
      expect(await codeOf(findUsableCoupon(b, '!!', buyer.userId))).toBe('COUPON_INVALID')

      // Fixed coupon used once by one buyer, then exhausted for everyone.
      await addToCart(b, { itemType: 'course', itemId: course.id })
      expect(await validateCoupon(b, 'once')).toEqual({
        code: 'ONCE',
        discountKobo: 100_000n,
        totalKobo: 1_400_000n,
      })
      await setCartCoupon(b, 'once')
      const started = await startCheckout(b, {
        expectedTotalKobo: 1_400_000n,
        idempotencyKey: 'x1',
        anonymousId: null,
      })
      await completeOrder(b, { reference: started.publicId, via: 'confirm' })
      expect(await codeOf(findUsableCoupon(b, 'ONCE', null))).toBe('COUPON_LIMIT_REACHED')

      await setCouponActive(o, {
        couponId: (await listMyCoupons(o)).find((c) => c.code === 'SOON')?.id ?? '',
        active: false,
      })
      expect((await listMyCoupons(o)).find((c) => c.code === 'SOON')?.active).toBe(false)
      expect(
        await codeOf(
          setCouponActive(env.ctx(stranger), {
            couponId: (await listMyCoupons(o))[0]?.id ?? '',
            active: false,
          }),
        ),
      ).toBe('STAFF_ONLY')
      expect(
        await codeOf(
          setCouponActive(o, { couponId: '01920000-0000-7000-8000-00000000dead', active: false }),
        ),
      ).toBe('COUPON_NOT_FOUND')

      // Platform coupons: admins only, audited; "all" is theirs, "instructor_all" isn't.
      const a = env.ctx(admin)
      expect(
        await codeOf(
          createPlatformCoupon(o, {
            code: 'PLAT',
            kind: 'percent',
            percentOff: 5,
            appliesTo: 'all',
          }),
        ),
      ).toBe('STAFF_ONLY')
      expect(
        await codeOf(
          createPlatformCoupon(a, {
            code: 'PLAT',
            kind: 'percent',
            percentOff: 5,
            appliesTo: 'instructor_all',
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      const plat = await createPlatformCoupon(a, {
        code: 'plat',
        kind: 'percent',
        percentOff: 10,
        appliesTo: 'all',
      })
      expect(plat.code).toBe('PLAT')
      expect(
        await codeOf(
          createPlatformCoupon(a, {
            code: 'PLAT',
            kind: 'percent',
            percentOff: 10,
            appliesTo: 'all',
          }),
        ),
      ).toBe('COUPON_CODE_TAKEN')
      expect((await listAllCoupons(a, { scope: 'platform' })).map((c) => c.code)).toEqual(['PLAT'])
      expect((await listAllCoupons(a, { scope: 'all' })).length).toBeGreaterThan(1)
      await setCouponActive(a, { couponId: plat.id, active: false })
      expect(await codeOf(findUsableCoupon(b, 'PLAT', null))).toBe('COUPON_INVALID')
      const listed = await listMyCoupons(o)
      expect(listed.find((c) => c.code === 'ONCE')).toMatchObject({
        targetTitle: 'Excel for Accountants',
        discountGivenKobo: 100_000n,
      })
    })
  })
})

describe('cart, wishlist and bundles', () => {
  it('handles wishlists, removal, unavailable items and bundle purchases', async () => {
    await withRollback(async (db) => {
      const { env, owner, reviewer, course, buyer } = await world(db)
      const second = await publishCourse(env, owner, reviewer, {
        title: 'Second course',
        priceKobo: 1_000_000n,
      })
      const b = env.ctx(buyer)

      await addToWishlist(b, course.id)
      expect([...(await wishlistHas(b, [course.id, second.id]))]).toEqual([course.id])
      expect((await listWishlist(b)).map((i) => i.itemId)).toEqual([course.id])
      await removeFromWishlist(b, course.id)
      expect(await listWishlist(b)).toEqual([])
      expect(await codeOf(addToWishlist(b, '01920000-0000-7000-8000-00000000dead'))).toBe(
        'COURSE_NOT_FOUND',
      )

      await addToCart(b, { itemType: 'course', itemId: course.id })
      expect(await cartCount(b)).toBe(1)
      expect([...(await cartCourseIds(b, [course.id]))]).toEqual([course.id])
      const moved = await moveToWishlist(b, course.id)
      expect(moved.items).toEqual([])
      expect((await listWishlist(b)).map((i) => i.itemId)).toEqual([course.id])
      expect(await cartCount(env.ctx({ kind: 'anonymous' }))).toBe(0)

      // An item that goes off sale is taken out and reported once.
      await addToCart(b, { itemType: 'course', itemId: second.id })
      await setCourseListing(env.ctx(reviewer), {
        courseId: second.id,
        action: 'unpublish',
        reason: 'Checked.',
      })
      const view = await getCart(b)
      expect(view.removed).toEqual([{ title: 'Second course', reason: 'unavailable' }])
      expect((await getCart(b)).removed).toEqual([])
      expect(await codeOf(addToCart(b, { itemType: 'course', itemId: second.id }))).toBe(
        'COURSE_UNAVAILABLE',
      )
      expect(await codeOf(addToCart(b, { itemType: 'bundle', itemId: second.id }))).toBe(
        'BUNDLE_NOT_FOUND',
      )
      await setCourseListing(env.ctx(reviewer), {
        courseId: second.id,
        action: 'restore',
        reason: 'Fine.',
      })

      // A bundle: price split by list price, enrollments marked as bundle.
      const bundle = await createBundle(env.ctx(owner), {
        title: 'Excel pack',
        description: 'Both courses.',
        priceKobo: 2_000_000n,
        courseIds: [course.id, second.id],
        status: 'active',
      })
      await addToCart(b, { itemType: 'bundle', itemId: bundle.id })
      await removeFromCart(b, { itemType: 'bundle', itemId: bundle.id })
      await addToCart(b, { itemType: 'bundle', itemId: bundle.id })
      const cart = await getCart(b)
      expect(cart.totalKobo).toBe(2_000_000n)
      const started = await startCheckout(b, {
        expectedTotalKobo: 2_000_000n,
        idempotencyKey: 'bundle',
        anonymousId: null,
      })
      await completeOrder(b, { reference: started.publicId, via: 'confirm' })
      const items = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, started.orderId))
      expect(items.map((i) => i.listPriceKobo).sort((x, y) => Number(x - y))).toEqual([
        800_000n,
        1_200_000n,
      ])
      const enrolled = await db
        .select({ source: schema.enrollments.source })
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, buyer.userId))
      expect(enrolled.map((e) => e.source)).toEqual(['bundle', 'bundle'])
      // Owned items are skipped when a browser cart is merged.
      expect((await mergeCart(b, [{ itemType: 'course', itemId: course.id }])).items).toEqual([])
      expect(await countEnrollments(b, course.id)).toBe(1)
    })
  })
})

describe('enrollment access', () => {
  it('opens previews to anyone and the rest to enrolled learners, staff and the instructor', async () => {
    await withRollback(async (db) => {
      const { env, owner, reviewer, course, buyer } = await world(db)
      const [video, article] = course.sections[0]?.lessons ?? []
      const anon = env.ctx({ kind: 'anonymous' })
      expect(await canAccessLesson(anon, video?.id ?? '')).toBe(true)
      expect(await canAccessLesson(anon, article?.id ?? '')).toBe(false)
      expect(await canAccessLesson(anon, '01920000-0000-7000-8000-00000000dead')).toBe(false)
      expect(await canAccessCourse(env.ctx(owner), course.id)).toBe(true)
      expect(await canAccessCourse(env.ctx(reviewer), course.id)).toBe(true)
      expect(await canAccessCourse(env.ctx(buyer), '01920000-0000-7000-8000-00000000dead')).toBe(
        false,
      )

      const b = env.ctx(buyer)
      await grantEnrollment(b, { userId: buyer.userId, courseId: course.id, source: 'admin_grant' })
      expect(await canAccessLesson(b, article?.id ?? '')).toBe(true)
      await revokeEnrollment(b, { userId: buyer.userId, courseId: course.id })
      expect(await canAccessCourse(b, course.id)).toBe(false)
      // Buying again restores access.
      expect(
        (
          await grantEnrollment(b, {
            userId: buyer.userId,
            courseId: course.id,
            source: 'purchase',
          })
        ).created,
      ).toBe(true)
      expect(await canAccessCourse(b, course.id)).toBe(true)
    })
  })
})

describe('orders for staff, payment events, attribution extras', () => {
  it('searches orders, shows ledger and webhooks, re-checks with Paystack', async () => {
    await withRollback(async (db) => {
      const { env, course, buyer, finance, owner } = await world(db)
      const started = await buy(env, buyer, course.id, 'staff-1')
      const f = env.ctx(finance)
      expect(await codeOf(searchOrders(env.ctx(owner), {}))).toBe('STAFF_ONLY')
      expect(
        (await searchOrders(f, { q: started.publicId.toLowerCase() })).items[0]?.publicId,
      ).toBe(started.publicId)
      const [me] = await db
        .select({ email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.id, buyer.userId))
      expect((await searchOrders(f, { q: me?.email })).items).toHaveLength(1)
      expect((await searchOrders(f, { q: 'TL-NOTHING1' })).items).toEqual([])

      const eventId = paystackEventId('charge.success', 42, started.publicId)
      expect(await recordPaymentEvent(f, { eventId, type: 'charge.success', payload: {} })).toBe(
        'new',
      )
      expect(await recordPaymentEvent(f, { eventId, type: 'charge.success', payload: {} })).toBe(
        'duplicate',
      )
      await markPaymentEventProcessed(f, { eventId })

      const detail = await getOrderForStaff(f, started.orderId)
      expect(detail.ledger.map((e) => e.kind)).toEqual(['sale'])
      expect(detail.webhooks).toMatchObject([{ type: 'charge.success', error: null }])
      expect(detail.items[0]).toMatchObject({
        attributionSource: 'platform_organic',
        platformRateBps: 4000,
      })
      expect(await codeOf(getOrderForStaff(f, '01920000-0000-7000-8000-00000000dead'))).toBe(
        'ORDER_NOT_FOUND',
      )
      expect((await reverifyOrder(f, started.orderId)).status).toBe('paid')
      expect(await codeOf(reverifyOrder(f, '01920000-0000-7000-8000-00000000dead'))).toBe(
        'ORDER_NOT_FOUND',
      )

      const overview = await ledgerOverview(f, { kind: 'sale' })
      expect(overview.integrity.ok).toBe(true)
      expect(overview.page.items.length).toBeGreaterThan(0)
      expect(await codeOf(ledgerOverview(env.ctx(buyer), {}))).toBe('STAFF_ONLY')

      // Paging my orders.
      const page = await listMyOrders(env.ctx(buyer), { limit: 1 })
      expect(page.items).toHaveLength(1)
      expect(page.nextCursor).toBeNull()
    })
  })

  it('records paid-campaign landings and flushes counted clicks', async () => {
    await withRollback(async (db) => {
      const { env, buyer } = await world(db)
      const b = env.ctx(buyer)
      await recordPaidLanding(b, {
        anonymousId: 'browser-9',
        userId: null,
        utm: { utm_medium: 'paid' },
      })
      await recordPaidLanding(b, { anonymousId: null, userId: null, utm: {} })
      expect((await attributionFacts(b, { anonymousId: 'browser-9' })).paidCampaign).toBe(true)

      const links = await db
        .insert(schema.referralLinks)
        .values({ instructorId: buyer.userId, code: 'flush-me', targetType: 'profile' })
        .returning()
      const counted = createCountingCtx(env, [{ linkId: links[0]?.id ?? '', clicks: 3 }])
      expect(await flushReferralClicks(counted)).toBe(1)
      expect(await flushReferralClicks(b)).toBe(0)
      const [row] = await db
        .select()
        .from(schema.referralLinks)
        .where(eq(schema.referralLinks.code, 'flush-me'))
      expect(row?.clicks).toBe(3)
    })
  })
})

function createCountingCtx(
  env: ReturnType<typeof setup>,
  counts: Array<{ linkId: string; clicks: number }>,
) {
  const base = env.ctx({ kind: 'system', reason: 'test' })
  return {
    ...base,
    providers: {
      ...base.providers,
      clickCounter: { increment: async () => {}, drain: async () => counts },
    },
  }
}

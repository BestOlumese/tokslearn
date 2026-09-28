import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  type AttributionFacts,
  type CartLine,
  type CommissionRule,
  type CouponTerms,
  couponDiscount,
  type PricingError,
  priceOrder,
  resolveCommission,
  splitSale,
} from './pricing'

const now = new Date('2026-10-01T10:00:00Z')
const T = 'tobi'
const G = 'grace'
const course = (id: string, instructorId: string, naira: number, refund = 7) => ({
  id,
  title: `Course ${id}`,
  instructorId,
  priceKobo: BigInt(naira) * 100n,
  refundPolicyDays: refund,
})
const defaults: CommissionRule[] = [
  ['r-ref', 'instructor_referral', 300],
  ['r-cpn', 'instructor_coupon', 300],
  ['r-org', 'platform_organic', 4000],
  ['r-paid', 'platform_paid', 5000],
].map(([id, source, bps]) => ({
  id: id as string,
  scope: 'default',
  instructorId: null,
  source: source as CommissionRule['source'],
  platformRateBps: bps as number,
  startsAt: new Date('2026-01-01'),
  endsAt: null,
}))
const organic: AttributionFacts = { referralInstructorIds: new Set(), paidCampaign: false }
const price = (
  lines: CartLine[],
  opts: { coupon?: CouponTerms; attribution?: AttributionFacts; rules?: CommissionRule[] } = {},
) =>
  priceOrder({
    lines,
    coupon: opts.coupon ?? null,
    rules: opts.rules ?? defaults,
    attribution: opts.attribution ?? organic,
    now,
  })
const coupon = (c: Partial<CouponTerms>): CouponTerms => ({
  id: 'c1',
  code: 'SAVE',
  instructorId: null,
  kind: 'percent',
  percentOff: 10,
  amountOffKobo: null,
  appliesTo: 'all',
  targetId: null,
  ...c,
})

describe('priceOrder', () => {
  it('prices a single organic course at 40% commission', () => {
    const order = price([{ type: 'course', course: course('a', T, 10_000) }])
    expect(order).toMatchObject({
      subtotalKobo: 1_000_000n,
      discountKobo: 0n,
      totalKobo: 1_000_000n,
    })
    expect(order.lines[0]).toMatchObject({
      netPriceKobo: 1_000_000n,
      attributionSource: 'platform_organic',
      platformRateBps: 4000,
      commissionRuleId: 'r-org',
      refundPolicyDays: 7,
    })
  })

  it('expands a bundle by list price and keeps each course’s refund policy', () => {
    const order = price([
      {
        type: 'bundle',
        bundle: { id: 'b', instructorId: T, priceKobo: 2_000_000n },
        courses: [course('a', T, 15_000, 7), course('b2', T, 10_000, 14)],
      },
    ])
    expect(
      order.lines.map((l) => [l.courseId, l.listPriceKobo, l.bundleId, l.refundPolicyDays]),
    ).toEqual([
      ['a', 1_200_000n, 'b', 7],
      ['b2', 800_000n, 'b', 14],
    ])
    expect(order.totalKobo).toBe(2_000_000n)
  })

  it('credits the referring instructor only, and paid campaigns for the rest', () => {
    const order = price(
      [
        { type: 'course', course: course('a', T, 10_000) },
        { type: 'course', course: course('g', G, 10_000) },
      ],
      { attribution: { referralInstructorIds: new Set([T]), paidCampaign: true } },
    )
    expect(order.lines.map((l) => [l.attributionSource, l.platformRateBps])).toEqual([
      ['instructor_referral', 300],
      ['platform_paid', 5000],
    ])
  })

  it('applies an instructor coupon to that instructor’s lines only and marks the source', () => {
    const order = price(
      [
        { type: 'course', course: course('a', T, 10_000) },
        { type: 'course', course: course('g', G, 10_000) },
      ],
      { coupon: coupon({ instructorId: T, appliesTo: 'instructor_all', percentOff: 50 }) },
    )
    expect(
      order.lines.map((l) => [l.discountKobo, l.attributionSource, l.platformRateBps]),
    ).toEqual([
      [500_000n, 'instructor_coupon', 300],
      [0n, 'platform_organic', 4000],
    ])
    expect(order.totalKobo).toBe(1_500_000n)
  })

  it('caps fixed coupons at the eligible amount and spreads them by price', () => {
    const order = price(
      [
        { type: 'course', course: course('a', T, 3_000) },
        { type: 'course', course: course('b', T, 1_000) },
      ],
      { coupon: coupon({ kind: 'fixed', percentOff: null, amountOffKobo: 1_000_000n }) },
    )
    expect(order.lines.map((l) => l.netPriceKobo)).toEqual([0n, 0n])
    expect(order.totalKobo).toBe(0n)
    const partial = price([{ type: 'course', course: course('a', T, 3_001) }], {
      coupon: coupon({ kind: 'percent', percentOff: 33 }),
    })
    // 33% of ₦3,001 = ₦990.33 → 99,033 kobo.
    expect(partial.discountKobo).toBe(99_033n)
  })

  it('targets a course or a bundle', () => {
    const cart: CartLine[] = [
      { type: 'course', course: course('a', T, 10_000) },
      {
        type: 'bundle',
        bundle: { id: 'b', instructorId: T, priceKobo: 1_000_000n },
        courses: [course('x', T, 6_000), course('y', T, 6_000)],
      },
    ]
    const onCourse = price(cart, {
      coupon: coupon({ appliesTo: 'course', targetId: 'a', percentOff: 100 }),
    })
    expect(onCourse.lines.map((l) => l.discountKobo)).toEqual([1_000_000n, 0n, 0n])
    const onBundle = price(cart, {
      coupon: coupon({ appliesTo: 'bundle', targetId: 'b', percentOff: 100 }),
    })
    expect(onBundle.lines.map((l) => l.discountKobo)).toEqual([0n, 500_000n, 500_000n])
  })

  it('refuses empty carts, coupons that fit nothing, and missing rules', () => {
    const err = (fn: () => unknown) => {
      try {
        fn()
      } catch (e) {
        return (e as PricingError).problem
      }
      return null
    }
    expect(err(() => price([]))).toBe('CART_EMPTY')
    expect(
      err(() =>
        price([{ type: 'course', course: course('a', T, 10_000) }], {
          coupon: coupon({ instructorId: G, appliesTo: 'instructor_all' }),
        }),
      ),
    ).toBe('COUPON_NOT_APPLICABLE')
    expect(
      err(() => price([{ type: 'course', course: course('free', T, 0) }], { coupon: coupon({}) })),
    ).toBe('COUPON_NOT_APPLICABLE')
    expect(err(() => price([{ type: 'course', course: course('a', T, 1) }], { rules: [] }))).toBe(
      'COMMISSION_RULE_MISSING',
    )
    // A platform coupon can't be scoped to "an instructor".
    expect(
      err(() =>
        price([{ type: 'course', course: course('a', T, 10_000) }], {
          coupon: coupon({ appliesTo: 'instructor_all' }),
        }),
      ),
    ).toBe('COUPON_NOT_APPLICABLE')
  })

  it('keeps every line and the order consistent (property)', () => {
    const arbCourse = fc.record({
      id: fc.uuid(),
      instructorId: fc.constantFrom(T, G),
      naira: fc.integer({ min: 0, max: 500_000 }),
    })
    fc.assert(
      fc.property(
        fc.array(arbCourse, { minLength: 1, maxLength: 6 }),
        fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
        (courses, pct) => {
          const lines: CartLine[] = courses.map((c) => ({
            type: 'course',
            course: course(c.id, c.instructorId, c.naira),
          }))
          const hasValue = courses.some((c) => c.naira > 0)
          const withCoupon = pct !== null && hasValue
          const order = price(lines, withCoupon ? { coupon: coupon({ percentOff: pct }) } : {})
          expect(order.totalKobo).toBe(order.subtotalKobo - order.discountKobo)
          expect(order.lines.reduce((a, l) => a + l.netPriceKobo, 0n)).toBe(order.totalKobo)
          for (const l of order.lines) {
            expect(l.netPriceKobo).toBe(l.listPriceKobo - l.discountKobo)
            expect(l.discountKobo >= 0n && l.netPriceKobo >= 0n).toBe(true)
          }
        },
      ),
      { numRuns: 500 },
    )
  })
})

describe('resolveCommission', () => {
  const rules: CommissionRule[] = [
    ...defaults,
    {
      id: 'override',
      scope: 'instructor',
      instructorId: T,
      source: 'platform_organic',
      platformRateBps: 3000,
      startsAt: new Date('2026-02-01'),
      endsAt: null,
    },
    {
      id: 'promo',
      scope: 'promo',
      instructorId: T,
      source: 'platform_organic',
      platformRateBps: 2000,
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2026-10-15'),
    },
    {
      id: 'old-promo',
      scope: 'promo',
      instructorId: T,
      source: 'platform_organic',
      platformRateBps: 1000,
      startsAt: new Date('2026-03-01'),
      endsAt: new Date('2026-04-01'),
    },
  ]
  it('prefers an active promo, then the instructor override, then the default', () => {
    expect(resolveCommission(rules, T, 'platform_organic', now)?.id).toBe('promo')
    expect(resolveCommission(rules, T, 'platform_organic', new Date('2026-11-01'))?.id).toBe(
      'override',
    )
    expect(resolveCommission(rules, G, 'platform_organic', now)?.id).toBe('r-org')
    expect(resolveCommission(rules, T, 'instructor_referral', now)?.id).toBe('r-ref')
    expect(resolveCommission(rules, T, 'platform_organic', new Date('2025-12-01'))).toBeNull()
  })
})

describe('couponDiscount', () => {
  it('rounds percent half-up and caps fixed', () => {
    expect(couponDiscount(coupon({ percentOff: 15 }), 99_999n)).toBe(15_000n)
    expect(
      couponDiscount(coupon({ kind: 'fixed', percentOff: null, amountOffKobo: 500n }), 200n),
    ).toBe(200n)
  })
})

describe('splitSale', () => {
  it('matches the docs/08 §5 worked example', () => {
    expect(
      splitSale([{ netPriceKobo: 1_000_000n, platformRateBps: 4000 }], 25_000n, 'proportional'),
    ).toEqual([
      { gatewayFeeShareKobo: 25_000n, instructorShareKobo: 585_000n, platformShareKobo: 415_000n },
    ])
    expect(
      splitSale([{ netPriceKobo: 1_000_000n, platformRateBps: 4000 }], 25_000n, 'platform'),
    ).toEqual([
      { gatewayFeeShareKobo: 25_000n, instructorShareKobo: 600_000n, platformShareKobo: 400_000n },
    ])
  })

  it('keeps a 3% referral sale from costing the platform money', () => {
    // ₦5,000 referral sale, ₦175 fee: the instructor carries 97% of the fee.
    const [line] = splitSale(
      [{ netPriceKobo: 500_000n, platformRateBps: 300 }],
      17_500n,
      'proportional',
    )
    expect(line).toEqual({
      gatewayFeeShareKobo: 17_500n,
      instructorShareKobo: 485_000n - 16_975n,
      platformShareKobo: 15_000n + 16_975n,
    })
    expect((line?.platformShareKobo ?? 0n) - (line?.gatewayFeeShareKobo ?? 0n)).toBeGreaterThan(0n)
  })

  it('never makes an instructor share negative, and always sums (property)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            netPriceKobo: fc.bigInt({ min: 0n, max: 10n ** 10n }),
            platformRateBps: fc.integer({ min: 0, max: 10_000 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.bigInt({ min: 0n, max: 10n ** 8n }),
        fc.constantFrom('proportional' as const, 'platform' as const),
        (lines, fee, bearer) => {
          const total = lines.reduce((a, l) => a + l.netPriceKobo, 0n)
          const splits = splitSale(lines, total === 0n ? 0n : fee, bearer)
          expect(splits.reduce((a, s) => a + s.gatewayFeeShareKobo, 0n)).toBe(
            total === 0n ? 0n : fee,
          )
          splits.forEach((s, i) => {
            expect(s.instructorShareKobo + s.platformShareKobo).toBe(lines[i]?.netPriceKobo)
            expect(s.instructorShareKobo >= 0n).toBe(true)
          })
        },
      ),
      { numRuns: 1000 },
    )
  })
})

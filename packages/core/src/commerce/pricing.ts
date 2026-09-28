import { allocate, ngn, percentOf, splitBps } from '../kernel/money'

// Checkout pricing (docs/08 §2–§4). Pure functions: the service loads courses, coupon, rules and
// attribution, and these decide every number. The client never sends prices.

export type AttributionSource =
  | 'instructor_referral'
  | 'instructor_coupon'
  | 'platform_organic'
  | 'platform_paid'

export interface PricedCourse {
  id: string
  title: string
  instructorId: string
  priceKobo: bigint
  refundPolicyDays: number
}

export type CartLine =
  | { type: 'course'; course: PricedCourse }
  | {
      type: 'bundle'
      bundle: { id: string; instructorId: string; priceKobo: bigint }
      courses: ReadonlyArray<PricedCourse>
    }

export interface CouponTerms {
  id: string
  code: string
  /** Null for platform coupons. */
  instructorId: string | null
  kind: 'percent' | 'fixed'
  percentOff: number | null
  amountOffKobo: bigint | null
  appliesTo: 'course' | 'bundle' | 'instructor_all' | 'all'
  targetId: string | null
}

export interface CommissionRule {
  id: string
  scope: 'default' | 'instructor' | 'promo'
  instructorId: string | null
  source: AttributionSource
  platformRateBps: number
  startsAt: Date
  endsAt: Date | null
}

export interface AttributionFacts {
  /** Instructors whose referral link this buyer followed within the window. */
  referralInstructorIds: ReadonlySet<string>
  /** The buyer landed from one of our paid campaigns within the window. */
  paidCampaign: boolean
}

export interface PricedLine {
  itemType: 'course' | 'bundle'
  itemId: string
  courseId: string
  bundleId: string | null
  instructorId: string
  title: string
  listPriceKobo: bigint
  discountKobo: bigint
  netPriceKobo: bigint
  attributionSource: AttributionSource
  commissionRuleId: string
  platformRateBps: number
  refundPolicyDays: number
}

export interface PricedOrder {
  lines: PricedLine[]
  subtotalKobo: bigint
  discountKobo: bigint
  totalKobo: bigint
  couponId: string | null
}

export type PricingProblem = 'CART_EMPTY' | 'COUPON_NOT_APPLICABLE' | 'COMMISSION_RULE_MISSING'

export class PricingError extends Error {
  constructor(readonly problem: PricingProblem) {
    super(problem)
  }
}

interface ExpandedLine {
  itemType: 'course' | 'bundle'
  itemId: string
  course: PricedCourse
  bundleId: string | null
  listPriceKobo: bigint
}

/** Bundles become one line per course, the bundle price allocated by course list price. */
export function expandLines(lines: ReadonlyArray<CartLine>): ExpandedLine[] {
  return lines.flatMap((line): ExpandedLine[] => {
    if (line.type === 'course') {
      return [
        {
          itemType: 'course',
          itemId: line.course.id,
          course: line.course,
          bundleId: null,
          listPriceKobo: line.course.priceKobo,
        },
      ]
    }
    const shares = allocate(
      line.bundle.priceKobo,
      line.courses.map((c) => c.priceKobo),
    )
    return line.courses.map((course, i) => ({
      itemType: 'bundle' as const,
      itemId: line.bundle.id,
      course,
      bundleId: line.bundle.id,
      listPriceKobo: shares[i] ?? 0n,
    }))
  })
}

/** Lines a coupon may discount. Instructor coupons only ever touch their own courses. */
export function couponAppliesTo(coupon: CouponTerms, line: ExpandedLine): boolean {
  if (coupon.instructorId && line.course.instructorId !== coupon.instructorId) return false
  switch (coupon.appliesTo) {
    case 'all':
      return coupon.instructorId === null
    case 'instructor_all':
      return coupon.instructorId !== null
    case 'course':
      return line.itemType === 'course' && line.course.id === coupon.targetId
    case 'bundle':
      return line.bundleId !== null && line.bundleId === coupon.targetId
  }
}

/** The discount a coupon gives on `eligible` kobo: percent rounds half-up, fixed is capped. */
export function couponDiscount(coupon: CouponTerms, eligible: bigint): bigint {
  if (coupon.kind === 'percent') {
    const pct = BigInt(coupon.percentOff ?? 0)
    return percentOf(ngn(eligible), pct * 100n).amount
  }
  const off = coupon.amountOffKobo ?? 0n
  return off < eligible ? off : eligible
}

const active = (r: CommissionRule, now: Date) =>
  r.startsAt <= now && (r.endsAt === null || r.endsAt > now)

/**
 * docs/08 §3 resolution: active promo for instructor + source, then the instructor override, then
 * the default for the source. Several active rules of one scope: the latest start wins.
 */
export function resolveCommission(
  rules: ReadonlyArray<CommissionRule>,
  instructorId: string,
  source: AttributionSource,
  now: Date,
): CommissionRule | null {
  const pick = (scope: CommissionRule['scope']) =>
    rules
      .filter(
        (r) =>
          r.scope === scope &&
          r.source === source &&
          (scope === 'default' || r.instructorId === instructorId) &&
          active(r, now),
      )
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0] ?? null
  return pick('promo') ?? pick('instructor') ?? pick('default')
}

/**
 * docs/08 §3 attribution, last touch with instructor priority: the instructor's own coupon, then
 * their referral link, then our paid campaigns, then organic. A referral only counts for the
 * instructor who owns it.
 */
export function attributeLine(
  instructorId: string,
  facts: AttributionFacts,
  coupon: CouponTerms | null,
): AttributionSource {
  if (coupon?.instructorId === instructorId) return 'instructor_coupon'
  if (facts.referralInstructorIds.has(instructorId)) return 'instructor_referral'
  if (facts.paidCampaign) return 'platform_paid'
  return 'platform_organic'
}

/** Prices a cart (docs/08 §2 steps 2–7). Throws PricingError for carts that can't be priced. */
export function priceOrder(input: {
  lines: ReadonlyArray<CartLine>
  coupon: CouponTerms | null
  rules: ReadonlyArray<CommissionRule>
  attribution: AttributionFacts
  now: Date
}): PricedOrder {
  const expanded = expandLines(input.lines)
  if (expanded.length === 0) throw new PricingError('CART_EMPTY')

  const discounts = expanded.map(() => 0n)
  const { coupon } = input
  if (coupon) {
    const eligible = expanded.flatMap((l, i) => (couponAppliesTo(coupon, l) ? [i] : []))
    const eligibleTotal = eligible.reduce((a, i) => a + (expanded[i]?.listPriceKobo ?? 0n), 0n)
    if (eligible.length === 0 || eligibleTotal === 0n) {
      throw new PricingError('COUPON_NOT_APPLICABLE')
    }
    const off = couponDiscount(coupon, eligibleTotal)
    const parts = allocate(
      off,
      eligible.map((i) => expanded[i]?.listPriceKobo ?? 0n),
    )
    eligible.forEach((lineIndex, k) => {
      discounts[lineIndex] = parts[k] ?? 0n
    })
  }

  const lines = expanded.map((l, i): PricedLine => {
    const source = attributeLine(l.course.instructorId, input.attribution, coupon)
    const rule = resolveCommission(input.rules, l.course.instructorId, source, input.now)
    if (!rule) throw new PricingError('COMMISSION_RULE_MISSING')
    const discount = discounts[i] ?? 0n
    return {
      itemType: l.itemType,
      itemId: l.itemId,
      courseId: l.course.id,
      bundleId: l.bundleId,
      instructorId: l.course.instructorId,
      title: l.course.title,
      listPriceKobo: l.listPriceKobo,
      discountKobo: discount,
      netPriceKobo: l.listPriceKobo - discount,
      attributionSource: source,
      commissionRuleId: rule.id,
      platformRateBps: rule.platformRateBps,
      refundPolicyDays: l.course.refundPolicyDays,
    }
  })

  const subtotal = lines.reduce((a, l) => a + l.listPriceKobo, 0n)
  const discount = lines.reduce((a, l) => a + l.discountKobo, 0n)
  return {
    lines,
    subtotalKobo: subtotal,
    discountKobo: discount,
    totalKobo: subtotal - discount,
    couponId: coupon?.id ?? null,
  }
}

export interface LineSplit {
  gatewayFeeShareKobo: bigint
  /** Owed to the instructor after their part of the fee. */
  instructorShareKobo: bigint
  /** Commission plus the fee recovered from the instructor (credited to platform revenue). */
  platformShareKobo: bigint
}

/**
 * docs/08 §4–§5: the Paystack fee is allocated to lines by net price; with the `proportional`
 * bearer each line's fee is then split by the commission rate. Per line,
 * net = instructor + platform, so the sale entry always balances.
 */
export function splitSale(
  lines: ReadonlyArray<{ netPriceKobo: bigint; platformRateBps: number }>,
  feeKobo: bigint,
  bearer: 'proportional' | 'platform',
): LineSplit[] {
  const fees = allocate(
    feeKobo,
    lines.map((l) => l.netPriceKobo),
  )
  return lines.map((l, i) => {
    const fee = fees[i] ?? 0n
    const rate = BigInt(l.platformRateBps)
    const [commission, instructorGross] = splitBps(l.netPriceKobo, rate)
    const instructorFee = bearer === 'proportional' ? splitBps(fee, rate)[1] : 0n
    // An instructor never ends a line below zero, even with a fee larger than their share.
    const fromInstructor = instructorFee < instructorGross ? instructorFee : instructorGross
    return {
      gatewayFeeShareKobo: fee,
      instructorShareKobo: instructorGross - fromInstructor,
      platformShareKobo: commission + fromInstructor,
    }
  })
}

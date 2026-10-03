import { z } from 'zod'
import { base } from './base'
import { Cursor, IsoDateTime, Page } from './shared'
import { Kobo } from './studio'

// Commerce, enrollments and money tools (docs/06 §5, docs/08, docs/20 Phase 4 rows). Money is
// kobo as a string; the client never sends a price, only the total it expects to pay.

const named = <S extends z.ZodType>(schema: S) =>
  schema as unknown as z.ZodType<z.output<S>, z.input<S>>

const get = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'GET', path, tags: [tag], summary, description })
const post = (path: `/${string}`, tag: string, summary: string, description: string) =>
  base.route({ method: 'POST', path, tags: [tag], summary, description })

const Reason = z.string().trim().min(3).max(500)
export const ItemType = z.enum(['course', 'bundle'])
export const ItemRefInput = z.strictObject({
  itemType: ItemType,
  itemId: z.uuid(),
  /** The start date picked for a cohort-based course (docs/10 §9). */
  cohortId: z.uuid().nullable().optional(),
})
export const AttributionSource = z.enum([
  'instructor_referral',
  'instructor_coupon',
  'platform_organic',
  'platform_paid',
])
const OrderStatus = z.enum([
  'pending',
  'paid',
  'failed',
  'abandoned',
  'refunded',
  'partially_refunded',
])
const RefundDays = z.number().int()

const CartItemShape = z.object({
  itemType: ItemType,
  itemId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  instructorName: z.string(),
  coverUrl: z.string().nullable(),
  priceKobo: Kobo,
  compareAtKobo: Kobo.nullable(),
  courseIds: z.array(z.uuid()),
  refundPolicyDays: RefundDays,
  /** Sold by start date; checkout needs `cohort`. */
  cohortBased: z.boolean(),
  cohort: z.object({ id: z.uuid(), name: z.string(), startsAt: IsoDateTime }).nullable(),
})
export type CartItemDto = z.infer<typeof CartItemShape>
export const CartItemDto = named(CartItemShape)

const CartShape = z.object({
  items: z.array(CartItemShape),
  removed: z.array(
    z.object({ title: z.string(), reason: z.enum(['owned', 'unavailable', 'own_course']) }),
  ),
  couponCode: z.string().nullable(),
  /** An error code from the catalog (COUPON_EXPIRED…), or null. */
  couponError: z.string().nullable(),
  subtotalKobo: Kobo,
  discountKobo: Kobo,
  totalKobo: Kobo,
})
export type CartDto = z.infer<typeof CartShape>
export const CartDto = named(CartShape)

const CouponCode = z.string().trim().min(3).max(30)

export const cartContract = {
  get: get(
    '/cart',
    'Cart',
    'My cart',
    'Items, prices and totals as checkout will charge them. Items I now own are removed and reported once.',
  ).output(CartDto),
  count: get('/cart/count', 'Cart', 'Cart size', 'Number of items, for the header badge.').output(
    z.object({ count: z.number().int() }),
  ),
  add: post(
    '/cart/items',
    'Cart',
    'Add to cart',
    'Adds a course or bundle. Own and already-owned courses are refused.',
  )
    .input(ItemRefInput)
    .output(CartDto),
  remove: post('/cart/items/remove', 'Cart', 'Remove from cart', 'Removes one item.')
    .input(ItemRefInput)
    .output(CartDto),
  merge: post(
    '/cart/merge',
    'Cart',
    'Merge a browser cart',
    'After sign-in: adds the items a visitor collected. Items that can’t be added are skipped.',
  )
    .input(z.strictObject({ items: z.array(ItemRefInput).max(20) }))
    .output(CartDto),
  setCoupon: post(
    '/cart/coupon',
    'Cart',
    'Apply or remove a coupon',
    'Checks the code against my cart and saves it. Null removes it.',
  )
    .input(z.strictObject({ code: CouponCode.nullable() }))
    .output(CartDto),
  moveToWishlist: post(
    '/cart/items/move-to-wishlist',
    'Cart',
    'Move to wishlist',
    'Takes a course out of the cart and saves it to the wishlist.',
  )
    .input(z.strictObject({ courseId: z.uuid() }))
    .output(CartDto),
  preview: post(
    '/cart/preview',
    'Cart',
    'Price a visitor cart',
    'Prices a list of items without saving anything. For visitors before sign-in.',
  )
    .input(
      z.strictObject({
        items: z.array(ItemRefInput).max(20),
        couponCode: CouponCode.nullable().optional(),
      }),
    )
    .output(CartDto),
}

export const wishlistContract = {
  list: get(
    '/wishlist',
    'Wishlist',
    'My wishlist',
    'Saved courses that are still on sale, newest first.',
  ).output(z.object({ items: z.array(CartItemShape) })),
  add: post('/wishlist', 'Wishlist', 'Save to wishlist', 'Saves a course.')
    .input(z.strictObject({ courseId: z.uuid() }))
    .output(z.object({ ok: z.literal(true) })),
  remove: post('/wishlist/remove', 'Wishlist', 'Remove from wishlist', 'Removes a saved course.')
    .input(z.strictObject({ courseId: z.uuid() }))
    .output(z.object({ ok: z.literal(true) })),
}

export const couponsContract = {
  validate: post(
    '/coupons/validate',
    'Cart',
    'Check a coupon',
    'What a code would take off my current cart, without saving it.',
  )
    .input(z.strictObject({ code: CouponCode }))
    .output(z.object({ code: z.string(), discountKobo: Kobo, totalKobo: Kobo })),
}

const CheckoutResultShape = z.object({
  orderId: z.uuid(),
  publicId: z.string(),
  status: z.enum(['pending', 'paid', 'failed']),
  totalKobo: Kobo,
  /** Open Paystack's popup with this. Null for free orders. */
  accessCode: z.string().nullable(),
  /** Paystack's hosted page, for clients that can't show the popup. */
  authorizationUrl: z.string().nullable(),
})
export type CheckoutResultDto = z.infer<typeof CheckoutResultShape>

const CompletedOrderShape = z.object({
  status: z.enum(['paid', 'pending', 'failed']),
  publicId: z.string(),
  courses: z.array(z.object({ id: z.uuid(), slug: z.string(), title: z.string() })),
})
export type CompletedOrderDto = z.infer<typeof CompletedOrderShape>

export const checkoutContract = {
  start: post(
    '/checkout',
    'Checkout',
    'Start checkout',
    'Prices my cart on the server and opens a Paystack payment. Send the total you were shown; a different price returns CART_CHANGED. Free totals are paid at once. Retries with the same idempotency key return the same order.',
  )
    .input(
      z.strictObject({
        expectedTotalKobo: Kobo,
        idempotencyKey: z.string().min(8).max(64),
        /** The browser's anonymous id (web), so referral visits before sign-in count. */
        anonymousId: z.string().max(64).nullable().optional(),
      }),
    )
    .output(named(CheckoutResultShape)),
  confirm: post(
    '/checkout/confirm',
    'Checkout',
    'Confirm a payment',
    'After Paystack says success: verifies with Paystack and enrolls me. Safe to call more than once.',
  )
    .input(z.strictObject({ reference: z.string().min(4).max(40) }))
    .output(named(CompletedOrderShape)),
}

const OrderSummaryShape = z.object({
  id: z.uuid(),
  publicId: z.string(),
  status: OrderStatus,
  totalKobo: Kobo,
  itemsCount: z.number().int(),
  firstTitle: z.string(),
  createdAt: IsoDateTime,
  paidAt: IsoDateTime.nullable(),
})
export type OrderSummaryDto = z.infer<typeof OrderSummaryShape>

const OrderItemShape = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  courseSlug: z.string(),
  title: z.string(),
  bundleId: z.uuid().nullable(),
  listPriceKobo: Kobo,
  discountKobo: Kobo,
  netPriceKobo: Kobo,
  refundPolicyDays: RefundDays,
  refundableUntil: IsoDateTime.nullable(),
  status: z.enum(['active', 'refunded', 'non_refundable', 'refund_pending']),
})

const OrderDetailShape = OrderSummaryShape.extend({
  subtotalKobo: Kobo,
  discountKobo: Kobo,
  paymentChannel: z.string().nullable(),
  items: z.array(OrderItemShape),
})
export type OrderDetailDto = z.infer<typeof OrderDetailShape>
export const OrderDetailDto = named(OrderDetailShape)

export const ordersContract = {
  list: get(
    '/orders',
    'Orders',
    'My orders',
    'Newest first. Abandoned payment attempts are left out.',
  )
    .input(z.object({ cursor: Cursor.optional() }))
    .output(named(Page(OrderSummaryShape))),
  get: get(
    '/orders/{publicId}',
    'Orders',
    'A receipt',
    'Items, prices, discount, payment method and the refund rules for each course.',
  )
    .input(z.object({ publicId: z.string().max(20) }))
    .output(OrderDetailDto),
}

const MyCourseShape = z.object({
  enrollmentId: z.uuid(),
  courseId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  instructorName: z.string(),
  coverUrl: z.string().nullable(),
  status: z.enum(['active', 'completed']),
  progressPct: z.number().int(),
  lessonCount: z.number().int(),
  lastAccessedAt: IsoDateTime.nullable(),
  enrolledAt: IsoDateTime,
})
export type MyCourseDto = z.infer<typeof MyCourseShape>

export const enrollmentsContract = {
  enrollFree: post(
    '/enrollments/free',
    'Learning',
    'Enroll in a free course',
    'No payment. Needs a verified email. Cohort-based courses need `cohortId`.',
  )
    .input(z.strictObject({ courseId: z.uuid(), cohortId: z.uuid().nullable().optional() }))
    .output(z.object({ enrollmentId: z.uuid(), courseSlug: z.string(), created: z.boolean() })),
  listMine: get(
    '/enrollments',
    'Learning',
    'My learning',
    'My courses, the ones I opened last first.',
  )
    .input(z.object({ status: z.enum(['active', 'completed']).optional() }))
    .output(named(z.object({ items: z.array(MyCourseShape) }))),
  status: post(
    '/enrollments/status',
    'Learning',
    'Enrolled and saved',
    'Which of these courses I’m enrolled in and which I saved, for course pages and cards.',
  )
    .input(z.strictObject({ courseIds: z.array(z.uuid()).max(50) }))
    .output(
      z.object({
        enrolled: z.array(z.uuid()),
        wishlisted: z.array(z.uuid()),
        inCart: z.array(z.uuid()),
      }),
    ),
}

const BundleShape = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  instructorName: z.string(),
  priceKobo: Kobo,
  /** What the courses cost separately. */
  valueKobo: Kobo,
  refundPolicyDays: RefundDays,
  courses: z.array(
    z.object({
      id: z.uuid(),
      slug: z.string(),
      title: z.string(),
      priceKobo: Kobo,
      coverUrl: z.string().nullable(),
      refundPolicyDays: RefundDays,
    }),
  ),
})
export type PublicBundleDto = z.infer<typeof BundleShape>
export const PublicBundleDto = named(BundleShape)

export const bundlesContract = {
  getBySlug: get(
    '/bundles/{slug}',
    'Catalog',
    'A bundle',
    'A live bundle with its courses and what they cost separately.',
  )
    .input(z.object({ slug: z.string().max(120) }))
    .output(PublicBundleDto),
}

const ReferralLinkShape = z.object({
  id: z.uuid(),
  code: z.string(),
  url: z.string(),
  targetType: z.enum(['course', 'profile']),
  targetId: z.uuid().nullable(),
  targetTitle: z.string(),
  clicks: z.number().int(),
  sales: z.number().int(),
  earnedKobo: Kobo,
})
export type ReferralLinkDto = z.infer<typeof ReferralLinkShape>

export const referralsContract = {
  list: get(
    '/referrals',
    'Studio',
    'My referral links',
    'One link for my profile and one per live course, with clicks, sales and what I earned. Sales through them earn me 97%.',
  ).output(named(z.object({ items: z.array(ReferralLinkShape) }))),
}

const CouponScope = z.enum(['course', 'bundle', 'instructor_all', 'all'])
const CouponShape = z.object({
  id: z.uuid(),
  code: z.string(),
  instructorId: z.uuid().nullable(),
  kind: z.enum(['percent', 'fixed']),
  percentOff: z.number().int().nullable(),
  amountOffKobo: Kobo.nullable(),
  appliesTo: CouponScope,
  targetId: z.uuid().nullable(),
  targetTitle: z.string().nullable(),
  maxRedemptions: z.number().int().nullable(),
  perUserLimit: z.number().int(),
  redemptionCount: z.number().int(),
  discountGivenKobo: Kobo,
  startsAt: IsoDateTime.nullable(),
  endsAt: IsoDateTime.nullable(),
  active: z.boolean(),
  announcedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
})
export type CouponDto = z.infer<typeof CouponShape>
export const CouponDto = named(CouponShape)

export const CouponCreateInput = z.strictObject({
  code: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[A-Za-z0-9-]+$/),
  kind: z.enum(['percent', 'fixed']),
  percentOff: z.number().int().min(1).max(100).nullable().optional(),
  amountOffKobo: Kobo.nullable().optional(),
  appliesTo: CouponScope,
  targetId: z.uuid().nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(100).optional(),
  startsAt: IsoDateTime.nullable().optional(),
  endsAt: IsoDateTime.nullable().optional(),
})

export const studioCouponsContract = {
  list: get(
    '/studio/coupons',
    'Studio',
    'My coupons',
    'Coupons for my courses with how often they were used.',
  ).output(named(z.object({ items: z.array(CouponShape) }))),
  create: post(
    '/studio/coupons',
    'Studio',
    'Create a coupon',
    'For one of my courses, one of my bundles or all my courses. Sales with it earn me 97%.',
  )
    .input(CouponCreateInput)
    .output(CouponDto),
  setActive: post(
    '/studio/coupons/{couponId}/active',
    'Studio',
    'Switch a coupon on or off',
    'Off stops new uses at once.',
  )
    .input(z.strictObject({ couponId: z.uuid(), active: z.boolean() }))
    .output(z.object({ ok: z.literal(true) })),
  announce: post(
    '/studio/coupons/{couponId}/announce',
    'Studio',
    'Tell people who saved the course',
    'Once per live coupon for one course or all your courses: people with it on their wishlist get a notice (and an email if they opted in). COUPON_NOT_ANNOUNCEABLE, COUPON_ALREADY_ANNOUNCED.',
  )
    .input(z.strictObject({ couponId: z.uuid() }))
    .output(z.object({ announcedAt: IsoDateTime })),
}

const CommissionRuleShape = z.object({
  id: z.uuid(),
  scope: z.enum(['default', 'instructor', 'promo']),
  instructorId: z.uuid().nullable(),
  instructorName: z.string().nullable(),
  source: AttributionSource,
  platformRateBps: z.number().int(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime.nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
})
export type CommissionRuleDto = z.infer<typeof CommissionRuleShape>

const Bps = z.number().int().min(0).max(10_000)

export const adminCommissionContract = {
  list: get(
    '/admin/commission',
    'Admin',
    'Commission rules',
    'Defaults, instructor overrides and promos, with history. Super admins only.',
  ).output(named(z.object({ items: z.array(CommissionRuleShape) }))),
  setDefault: post(
    '/admin/commission/defaults',
    'Admin',
    'Change a default rate',
    'From now on; orders already placed keep their rate. Audited.',
  )
    .input(z.strictObject({ source: AttributionSource, platformRateBps: Bps, note: Reason }))
    .output(z.object({ ok: z.literal(true) })),
  addRule: post(
    '/admin/commission/rules',
    'Admin',
    'Add an override or promo',
    'For one instructor and source. A promo needs an end date. Audited.',
  )
    .input(
      z.strictObject({
        scope: z.enum(['instructor', 'promo']),
        instructorId: z.uuid(),
        source: AttributionSource,
        platformRateBps: Bps,
        startsAt: IsoDateTime.nullable().optional(),
        endsAt: IsoDateTime.nullable().optional(),
        note: Reason,
      }),
    )
    .output(z.object({ ok: z.literal(true) })),
  endRule: post(
    '/admin/commission/rules/{ruleId}/end',
    'Admin',
    'End an override or promo',
    'Stops it now. Defaults can only be replaced. Audited.',
  )
    .input(z.strictObject({ ruleId: z.uuid(), note: Reason }))
    .output(z.object({ ok: z.literal(true) })),
}

const JournalEntryShape = z.object({
  id: z.uuid(),
  publicId: z.string(),
  kind: z.string(),
  refType: z.string(),
  refId: z.uuid(),
  description: z.string().nullable(),
  postedAt: IsoDateTime,
  lines: z.array(
    z.object({ account: z.string(), direction: z.enum(['debit', 'credit']), amountKobo: Kobo }),
  ),
})
export type JournalEntryDto = z.infer<typeof JournalEntryShape>

const AdminOrderRowShape = OrderSummaryShape.extend({
  buyerEmail: z.string(),
  buyerName: z.string(),
})
export type AdminOrderRowDto = z.infer<typeof AdminOrderRowShape>

const AdminOrderShape = OrderDetailShape.extend({
  buyer: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  provider: z.string(),
  providerReference: z.string().nullable(),
  failureReason: z.string().nullable(),
  gatewayFeeKobo: Kobo.nullable(),
  items: z.array(
    OrderItemShape.extend({
      instructorId: z.uuid(),
      attributionSource: z.string(),
      platformRateBps: z.number().int(),
      instructorShareKobo: Kobo.nullable(),
      platformShareKobo: Kobo.nullable(),
      gatewayFeeShareKobo: Kobo.nullable(),
      earningStatus: z.string(),
    }),
  ),
  ledger: z.array(JournalEntryShape),
  webhooks: z.array(
    z.object({
      type: z.string(),
      receivedAt: IsoDateTime,
      processedAt: IsoDateTime.nullable(),
      error: z.string().nullable(),
    }),
  ),
})
export type AdminOrderDto = z.infer<typeof AdminOrderShape>

export const adminOrdersContract = {
  search: get(
    '/admin/orders',
    'Admin',
    'Find orders',
    'By order id (TL-…), Paystack reference or buyer email. Finance, support and admins.',
  )
    .input(z.object({ q: z.string().max(200).optional(), cursor: Cursor.optional() }))
    .output(named(Page(AdminOrderRowShape))),
  get: get(
    '/admin/orders/{orderId}',
    'Admin',
    'An order',
    'Items with commission snapshots, ledger entries and Paystack webhooks.',
  )
    .input(z.object({ orderId: z.uuid() }))
    .output(named(AdminOrderShape)),
  reverify: post(
    '/admin/orders/{orderId}/reverify',
    'Admin',
    'Check with Paystack again',
    'Completes the order if Paystack now says it was paid. Safe to repeat.',
  )
    .input(z.strictObject({ orderId: z.uuid() }))
    .output(named(CompletedOrderShape)),
}

export const adminCouponsContract = {
  list: get('/admin/coupons', 'Admin', 'Coupons', 'Platform coupons, or every coupon. Admins only.')
    .input(z.object({ scope: z.enum(['platform', 'all']).default('platform') }))
    .output(named(z.object({ items: z.array(CouponShape) }))),
  create: post(
    '/admin/coupons',
    'Admin',
    'Create a platform coupon',
    'The discount comes out of the platform’s share. Audited.',
  )
    .input(CouponCreateInput)
    .output(CouponDto),
  setActive: post(
    '/admin/coupons/{couponId}/active',
    'Admin',
    'Switch a coupon on or off',
    'Any coupon, instructor ones included. Audited.',
  )
    .input(z.strictObject({ couponId: z.uuid(), active: z.boolean() }))
    .output(z.object({ ok: z.literal(true) })),
}

export const adminLedgerContract = {
  list: get(
    '/admin/ledger',
    'Admin',
    'Ledger entries',
    'Newest first, read-only. Finance and admins.',
  )
    .input(z.object({ kind: z.string().max(30).optional(), cursor: Cursor.optional() }))
    .output(named(Page(JournalEntryShape))),
  integrity: get(
    '/admin/ledger/integrity',
    'Admin',
    'Ledger check',
    'Unbalanced entries, cached balances that differ from their lines, and paid orders without a sale entry or enrollment.',
  ).output(
    z.object({
      ok: z.boolean(),
      unbalancedEntries: z.array(z.string()),
      balanceMismatches: z.array(
        z.object({ account: z.string(), cached: z.string(), fromLines: z.string() }),
      ),
      ordersWithoutSaleEntry: z.array(z.string()),
      ordersWithoutEnrollment: z.array(z.string()),
    }),
  ),
}

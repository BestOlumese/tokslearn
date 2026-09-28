import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, currency, kobo, tstz } from '../columns'
import { bundles, courses } from './courses'
import { user } from './identity'

// Commerce (docs/05 commerce, docs/08). Everything financial is append-only: orders and order
// items change status, never amounts. Money is integer kobo; rates are basis points.

export const cartItemTypeEnum = pgEnum('cart_item_type', ['course', 'bundle'])

/** One active cart per signed-in user. Anonymous carts live in the browser until sign-in. */
export const carts = pgTable('carts', {
  ...baseColumns(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'restrict' }),
  /** Code the learner typed; validated again at checkout. */
  couponCode: text(),
})

export const cartItems = pgTable(
  'cart_items',
  {
    ...baseColumns(),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    itemType: cartItemTypeEnum().notNull(),
    itemId: uuid().notNull(),
  },
  (t) => [uniqueIndex().on(t.cartId, t.itemType, t.itemId)],
)

export const wishlistItems = pgTable(
  'wishlist_items',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
  },
  (t) => [uniqueIndex().on(t.userId, t.courseId), index().on(t.courseId)],
)

export const couponKindEnum = pgEnum('coupon_kind', ['percent', 'fixed'])
/** `all` is for platform coupons only (instructor_id null). */
export const couponAppliesToEnum = pgEnum('coupon_applies_to', [
  'course',
  'bundle',
  'instructor_all',
  'all',
])

/**
 * Instructor coupons (instructor_id set) apply only to that instructor's lines; platform coupons
 * (null) are created by admins. `code` is stored upper-case and unique.
 */
export const coupons = pgTable(
  'coupons',
  {
    ...baseColumns(),
    instructorId: uuid().references(() => user.id, { onDelete: 'restrict' }),
    code: text().notNull().unique(),
    kind: couponKindEnum().notNull(),
    /** 1–100 when kind = percent. */
    percentOff: smallint(),
    /** Kobo off when kind = fixed. */
    amountOffKobo: kobo(),
    appliesTo: couponAppliesToEnum().notNull(),
    /** Course or bundle id when applies_to is course/bundle. */
    targetId: uuid(),
    maxRedemptions: integer(),
    perUserLimit: integer().notNull().default(1),
    /** Paid orders that used it; incremented under a row lock in completeOrder. */
    redemptionCount: integer().notNull().default(0),
    startsAt: tstz(),
    endsAt: tstz(),
    active: boolean().notNull().default(true),
    createdBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index().on(t.instructorId, t.createdAt),
    check(
      'coupons_value_matches_kind',
      sql`(${t.kind} = 'percent' and ${t.percentOff} between 1 and 100 and ${t.amountOffKobo} is null)
        or (${t.kind} = 'fixed' and ${t.amountOffKobo} > 0 and ${t.percentOff} is null)`,
    ),
    check('coupons_code_upper', sql`${t.code} = upper(${t.code})`),
    check(
      'coupons_target',
      sql`(${t.appliesTo} in ('course', 'bundle')) = (${t.targetId} is not null)`,
    ),
    check('coupons_all_is_platform', sql`${t.appliesTo} <> 'all' or ${t.instructorId} is null`),
    check('coupons_limits', sql`${t.perUserLimit} >= 1 and coalesce(${t.maxRedemptions}, 1) >= 1`),
  ],
)

export const referralTargetEnum = pgEnum('referral_target', ['course', 'profile'])

/** Instructor referral links, `/r/{code}`. Clicks are counted in Redis and flushed here. */
export const referralLinks = pgTable(
  'referral_links',
  {
    ...baseColumns(),
    instructorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    code: text().notNull().unique(),
    targetType: referralTargetEnum().notNull(),
    /** Course id for course links; null for the instructor profile. */
    targetId: uuid(),
    clicks: bigint({ mode: 'number' }).notNull().default(0),
    active: boolean().notNull().default(true),
  },
  (t) => [
    index().on(t.instructorId),
    unique('referral_links_one_per_target')
      .on(t.instructorId, t.targetType, t.targetId)
      .nullsNotDistinct(),
  ],
)

export const attributionSourceEnum = pgEnum('attribution_source', [
  'instructor_referral',
  'instructor_coupon',
  'platform_organic',
  'platform_paid',
])

/**
 * A touch that may earn attribution at checkout (docs/08 §3): referral link visits and paid-ad
 * landings, for 30 days. Anonymous touches carry the `tl_aid` browser id and gain `user_id` at
 * sign-in or checkout.
 */
export const attributions = pgTable(
  'attributions',
  {
    ...baseColumns(),
    userId: uuid().references(() => user.id, { onDelete: 'restrict' }),
    anonymousId: text(),
    source: attributionSourceEnum().notNull(),
    referralLinkId: uuid().references(() => referralLinks.id, { onDelete: 'restrict' }),
    /** Owner of the referral link; lines only count for this instructor. */
    instructorId: uuid().references(() => user.id, { onDelete: 'restrict' }),
    utm: jsonb().$type<Record<string, string>>(),
    expiresAt: tstz().notNull(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index().on(t.anonymousId, t.createdAt),
    index().on(t.referralLinkId),
    index().on(t.instructorId),
  ],
)

export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'failed',
  'abandoned',
  'refunded',
  'partially_refunded',
])

export const orders = pgTable(
  'orders',
  {
    ...baseColumns(),
    /** On receipts and as the Paystack reference, e.g. TL-7K3M9Q2A. */
    publicId: text().notNull().unique(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    status: orderStatusEnum().notNull().default('pending'),
    subtotalKobo: kobo().notNull(),
    discountKobo: kobo().notNull().default(sql`0`),
    totalKobo: kobo().notNull(),
    currency: currency(),
    /** 'paystack', or 'none' for free orders. */
    provider: text().notNull(),
    providerReference: text().unique(),
    couponId: uuid().references(() => coupons.id, { onDelete: 'restrict' }),
    /** From Paystack verify: card, bank, ussd, bank_transfer… */
    paymentChannel: text(),
    /** Paystack's fee for the whole order, from verify (docs/08 §4). */
    gatewayFeeKobo: kobo(),
    /** When the Paystack transaction was initialized; the reconciliation cron needs it. */
    initializedAt: tstz(),
    /**
     * Paystack's one-time access code and hosted page for this order, kept so a retried checkout
     * (double click, reload) reopens the same payment instead of starting another.
     */
    providerAccessCode: text(),
    authorizationUrl: text(),
    paidAt: tstz(),
    failureReason: text(),
    idempotencyKey: text().unique(),
  },
  (t) => [
    index().on(t.userId, t.createdAt.desc()),
    index().on(t.status, t.createdAt),
    index().on(t.couponId),
    check(
      'orders_amounts',
      sql`${t.subtotalKobo} >= 0 and ${t.discountKobo} >= 0 and ${t.totalKobo} = ${t.subtotalKobo} - ${t.discountKobo}`,
    ),
    check('orders_fee_non_negative', sql`coalesce(${t.gatewayFeeKobo}, 0) >= 0`),
  ],
)

export const orderItemStatusEnum = pgEnum('order_item_status', [
  'active',
  'refunded',
  'non_refundable',
])
export const earningStatusEnum = pgEnum('earning_status', [
  'pending',
  'available',
  'paid',
  'reversed',
])

/**
 * One row per course bought (a bundle becomes one row per course with its allocated price).
 * Prices, commission rate and refund policy are snapshots taken at checkout.
 */
export const orderItems = pgTable(
  'order_items',
  {
    ...baseColumns(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    itemType: cartItemTypeEnum().notNull(),
    /** The course or bundle that was in the cart. */
    itemId: uuid().notNull(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    bundleId: uuid().references(() => bundles.id, { onDelete: 'restrict' }),
    instructorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    courseTitleSnapshot: text().notNull(),
    listPriceKobo: kobo().notNull(),
    discountKobo: kobo().notNull().default(sql`0`),
    netPriceKobo: kobo().notNull(),
    attributionSource: attributionSourceEnum().notNull(),
    /** The referral link that earned `instructor_referral`, for per-link sales in the studio. */
    referralLinkId: uuid().references(() => referralLinks.id, { onDelete: 'restrict' }),
    commissionRuleId: uuid(),
    platformRateBps: integer().notNull(),
    /** Set when the order is paid (the fee is only known then). */
    instructorShareKobo: kobo(),
    platformShareKobo: kobo(),
    gatewayFeeShareKobo: kobo(),
    refundPolicyDaysSnapshot: smallint().notNull(),
    refundableUntil: tstz(),
    status: orderItemStatusEnum().notNull().default('active'),
    earningStatus: earningStatusEnum().notNull().default('pending'),
  },
  (t) => [
    index().on(t.orderId),
    index().on(t.courseId),
    index().on(t.bundleId),
    index().on(t.referralLinkId),
    index().on(t.instructorId, t.earningStatus),
    index('order_items_release_due')
      .on(t.refundableUntil)
      .where(sql`${t.earningStatus} = 'pending'`),
    check(
      'order_items_amounts',
      sql`${t.listPriceKobo} >= 0 and ${t.discountKobo} >= 0 and ${t.netPriceKobo} = ${t.listPriceKobo} - ${t.discountKobo}`,
    ),
    check('order_items_rate', sql`${t.platformRateBps} between 0 and 10000`),
    check(
      'order_items_shares',
      sql`${t.instructorShareKobo} is null or (${t.instructorShareKobo} >= 0 and ${t.platformShareKobo} >= 0 and ${t.gatewayFeeShareKobo} >= 0)`,
    ),
  ],
)

export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    ...baseColumns(),
    couponId: uuid()
      .notNull()
      .references(() => coupons.id, { onDelete: 'restrict' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex().on(t.couponId, t.orderId),
    index().on(t.couponId, t.userId),
    index().on(t.orderId),
    index().on(t.userId),
  ],
)

/** Paystack webhooks, recorded once per event for idempotency (ADR-030). */
export const paymentEvents = pgTable(
  'payment_events',
  {
    ...baseColumns(),
    provider: text().notNull(),
    eventId: text().notNull(),
    type: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    processedAt: tstz(),
    error: text(),
  },
  (t) => [uniqueIndex().on(t.provider, t.eventId), index().on(t.processedAt)],
)

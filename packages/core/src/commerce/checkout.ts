import { publicId, schema } from '@tokslearn/db'
import { ProviderError } from '@tokslearn/integrations/paystack'
import { and, desc, eq, gt, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import { getSetting } from '../admin'
import { track } from '../analytics'
import { grantEnrollment } from '../enrollments'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import {
  ConflictError,
  DomainError,
  ExternalServiceError,
  NotFoundError,
  RuleViolationError,
} from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { log } from '../kernel/logger'
import { ngn, percentOf, splitBps } from '../kernel/money'
import { instructorAccount, type LedgerLine, platformAccounts as P, post } from '../ledger'
import { sendEmail } from '../notifications'
import { attributionFacts } from './attribution'
import { clearPurchased, getCart } from './cart'
import { loadActiveRules } from './commission'
import { findUsableCoupon } from './coupons'
import { PricingError, priceOrder, splitSale } from './pricing'

// Checkout (docs/08 §2, §6). `startCheckout` prices the cart on the server and opens a Paystack
// transaction; `completeOrder` is the single, idempotent path from "Paystack says paid" to
// enrollments and ledger entries, used by the confirm call, the webhook, the reconciliation cron
// and the admin re-check.
// Foreign reads (docs/03 §3): user, coupons, course slugs for the success page.

const { orders, orderItems, coupons, couponRedemptions, user, courses } = schema

export interface CheckoutResult {
  orderId: string
  publicId: string
  status: 'pending' | 'paid' | 'failed'
  totalKobo: bigint
  /** For the Paystack popup. Null for free orders and finished ones. */
  accessCode: string | null
  authorizationUrl: string | null
}

const pricingCode = (e: PricingError) => {
  if (e.problem === 'CART_EMPTY') return new RuleViolationError('CART_EMPTY')
  if (e.problem === 'COUPON_NOT_APPLICABLE') return new RuleViolationError('COUPON_NOT_APPLICABLE')
  // A source without a default rule is a configuration bug, not something the buyer can fix.
  log('error', 'commission rule missing at checkout', {})
  return new DomainError('INTERNAL')
}

const resultOf = (o: typeof orders.$inferSelect): CheckoutResult => ({
  orderId: o.id,
  publicId: o.publicId,
  status: o.status === 'paid' ? 'paid' : o.status === 'failed' ? 'failed' : 'pending',
  totalKobo: o.totalKobo,
  accessCode: o.status === 'pending' ? o.providerAccessCode : null,
  authorizationUrl: o.status === 'pending' ? o.authorizationUrl : null,
})

/**
 * docs/08 §2 + §6 step 1. The client sends only what it expects to pay; any difference from the
 * server's price (a price change, an item gone, a coupon expiring) is CART_CHANGED and the buyer
 * reviews the cart again. The same idempotency key returns the same order.
 */
export async function startCheckout(
  ctx: Ctx,
  input: { expectedTotalKobo: bigint; idempotencyKey: string; anonymousId: string | null },
): Promise<CheckoutResult> {
  const actor = requireUser(ctx.actor)
  if (!actor.emailVerified) throw new RuleViolationError('EMAIL_NOT_VERIFIED')
  const key = `${actor.userId}:${input.idempotencyKey}`

  const [existing] = await ctx.db.select().from(orders).where(eq(orders.idempotencyKey, key))
  if (existing) return resultOf(existing)

  const cart = await getCart(ctx, { anonymousId: input.anonymousId })
  if (cart.removed.length > 0) throw new ConflictError('CART_CHANGED')
  if (cart.items.length === 0) throw new RuleViolationError('CART_EMPTY')
  const coupon = cart.couponCode ? await findUsableCoupon(ctx, cart.couponCode, actor.userId) : null
  const facts = await attributionFacts(ctx, { anonymousId: input.anonymousId })
  let priced: ReturnType<typeof priceOrder>
  try {
    priced = priceOrder({
      lines: cart.items.map((i) => i.line),
      coupon,
      rules: await loadActiveRules(ctx),
      attribution: facts,
      now: ctx.now,
    })
  } catch (e) {
    throw e instanceof PricingError ? pricingCode(e) : e
  }
  if (priced.totalKobo !== input.expectedTotalKobo) throw new ConflictError('CART_CHANGED')

  const paid = priced.totalKobo > 0n
  const orderPublicId = publicId('TL')
  const order = await inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(orders)
      .values({
        publicId: orderPublicId,
        userId: actor.userId,
        status: 'pending',
        subtotalKobo: priced.subtotalKobo,
        discountKobo: priced.discountKobo,
        totalKobo: priced.totalKobo,
        provider: paid ? 'paystack' : 'none',
        providerReference: paid ? orderPublicId : null,
        couponId: priced.couponId,
        idempotencyKey: key,
      })
      .onConflictDoNothing({ target: orders.idempotencyKey })
      .returning()
    if (!row) return null
    await tx.db.insert(orderItems).values(
      priced.lines.map((l) => ({
        orderId: row.id,
        itemType: l.itemType,
        itemId: l.itemId,
        courseId: l.courseId,
        bundleId: l.bundleId,
        instructorId: l.instructorId,
        courseTitleSnapshot: l.title,
        listPriceKobo: l.listPriceKobo,
        discountKobo: l.discountKobo,
        netPriceKobo: l.netPriceKobo,
        attributionSource: l.attributionSource,
        referralLinkId:
          l.attributionSource === 'instructor_referral'
            ? (facts.referralLinks.get(l.instructorId) ?? null)
            : null,
        commissionRuleId: l.commissionRuleId,
        platformRateBps: l.platformRateBps,
        refundPolicyDaysSnapshot: l.refundPolicyDays,
      })),
    )
    return row
  })
  if (!order) {
    // A concurrent request with the same key won the insert.
    const [winner] = await ctx.db.select().from(orders).where(eq(orders.idempotencyKey, key))
    if (!winner) throw new Error('order missing after idempotent insert')
    return resultOf(winner)
  }
  void track(ctx, 'checkout_started', {
    order_id: order.id,
    items_count: priced.lines.length,
    total_kobo: Number(priced.totalKobo),
  })

  if (!paid) {
    await finalizePaid(ctx, order.id, { feeKobo: 0n, channel: null, paidAt: ctx.now })
    return { ...resultOf(order), status: 'paid' }
  }

  const [me] = await ctx.db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, actor.userId))
  const app = provider(ctx, 'urls').app
  try {
    const init = await provider(ctx, 'payments').initializeTransaction({
      reference: order.publicId,
      email: me?.email ?? '',
      amountKobo: order.totalKobo,
      currency: 'NGN',
      callbackUrl: `${app}/checkout/success?ref=${order.publicId}`,
      metadata: { orderId: order.id, userId: actor.userId },
    })
    const [updated] = await ctx.db
      .update(orders)
      .set({
        initializedAt: ctx.now,
        providerAccessCode: init.accessCode,
        authorizationUrl: init.authorizationUrl,
      })
      .where(eq(orders.id, order.id))
      .returning()
    return resultOf(updated ?? order)
  } catch (e) {
    if (e instanceof ProviderError) {
      await ctx.db
        .update(orders)
        .set({ status: 'failed', failureReason: 'provider_unavailable' })
        .where(eq(orders.id, order.id))
      throw new ExternalServiceError('PAYMENT_PROVIDER_UNAVAILABLE', {}, { cause: e })
    }
    throw e
  }
}

export interface CompletedOrder {
  status: 'paid' | 'pending' | 'failed'
  publicId: string
  /** Courses the buyer can open now (paid orders only). */
  courses: Array<{ id: string; slug: string; title: string }>
}

async function paidCourses(ctx: Ctx, orderId: string) {
  return ctx.db
    .select({ id: courses.id, slug: courses.slug, title: orderItems.courseTitleSnapshot })
    .from(orderItems)
    .innerJoin(courses, eq(courses.id, orderItems.courseId))
    .where(eq(orderItems.orderId, orderId))
}

/**
 * docs/08 §6 `completeOrder`. Idempotent: any number of calls, from any path, at any time, give
 * one sale entry and one set of enrollments. `via` is only for logs.
 */
export async function completeOrder(
  ctx: Ctx,
  input: { reference: string; via: 'confirm' | 'webhook' | 'reconcile' | 'admin'; userId?: string },
): Promise<CompletedOrder> {
  const [order] = await ctx.db
    .select()
    .from(orders)
    .where(or(eq(orders.providerReference, input.reference), eq(orders.publicId, input.reference)))
  if (!order || (input.userId && order.userId !== input.userId)) {
    throw new NotFoundError('ORDER_NOT_FOUND')
  }
  if (order.status === 'paid') {
    return { status: 'paid', publicId: order.publicId, courses: await paidCourses(ctx, order.id) }
  }
  if (order.provider === 'none') {
    await finalizePaid(ctx, order.id, { feeKobo: 0n, channel: null, paidAt: ctx.now })
    return { status: 'paid', publicId: order.publicId, courses: await paidCourses(ctx, order.id) }
  }

  // Step 1: ask Paystack, outside any transaction (docs/05 §3.6).
  let verified: Awaited<ReturnType<ReturnType<typeof provider<'payments'>>['verifyTransaction']>>
  try {
    verified = await provider(ctx, 'payments').verifyTransaction(order.providerReference ?? '')
  } catch (e) {
    if (e instanceof ProviderError) {
      throw new ExternalServiceError('PAYMENT_PROVIDER_UNAVAILABLE', {}, { cause: e })
    }
    throw e
  }

  if (verified.status !== 'success') {
    if (verified.status === 'failed' && order.status === 'pending') {
      await ctx.db
        .update(orders)
        .set({ status: 'failed', failureReason: verified.gatewayResponse ?? 'failed' })
        .where(and(eq(orders.id, order.id), eq(orders.status, 'pending')))
      await ctx.events.emit('order.failed', { orderId: order.id, reason: 'payment_failed' })
      void track(ctx, 'order_failed', { order_id: order.id, reason: 'payment_failed' })
    }
    return {
      status: verified.status === 'failed' ? 'failed' : 'pending',
      publicId: order.publicId,
      courses: [],
    }
  }

  if (
    verified.reference !== order.providerReference ||
    verified.amountKobo !== order.totalKobo ||
    verified.currency !== order.currency
  ) {
    // Never enroll on a mismatch. The order stays as it is and a person looks at it.
    log('error', 'payment amount mismatch', {
      requestId: ctx.requestId,
      order: order.publicId,
      via: input.via,
      expected: order.totalKobo.toString(),
      got: verified.amountKobo.toString(),
      currency: verified.currency,
    })
    throw new RuleViolationError('PAYMENT_AMOUNT_MISMATCH', { ref: order.publicId })
  }

  const fee = verified.feesKobo ?? 0n
  await finalizePaid(ctx, order.id, {
    feeKobo: fee > order.totalKobo ? order.totalKobo : fee,
    channel: verified.channel,
    paidAt: verified.paidAt ?? ctx.now,
  })
  return { status: 'paid', publicId: order.publicId, courses: await paidCourses(ctx, order.id) }
}

interface TaxRules {
  vatOnCommission: boolean
  vatRateBps: number
}
const parseTax = (v: unknown): TaxRules => {
  const o = (v ?? {}) as Partial<TaxRules>
  return {
    vatOnCommission: o.vatOnCommission === true,
    vatRateBps: typeof o.vatRateBps === 'number' ? o.vatRateBps : 750,
  }
}

const refundLine = (days: number, until: Date) =>
  days === 0
    ? 'No refunds for this course'
    : `Refunds until ${new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric' }).format(until)}, if you have watched less than 30%`

/** docs/08 §6 step 2 + 3: one transaction, then after-commit effects. */
async function finalizePaid(
  ctx: Ctx,
  orderId: string,
  payment: { feeKobo: bigint; channel: string | null; paidAt: Date },
): Promise<void> {
  const bearer =
    (await getSetting(ctx, 'gateway_fee_bearer', (v) =>
      v === 'platform' ? 'platform' : 'proportional',
    )) ?? 'proportional'
  const tax = (await getSetting(ctx, 'tax_rules', parseTax)) ?? parseTax(null)

  const done = await inTransaction(ctx, async (tx) => {
    const [order] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for('update')
    if (!order) throw new NotFoundError('ORDER_NOT_FOUND')
    if (order.status === 'paid') return null

    const items = await tx.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.createdAt, orderItems.id)
    const splits = splitSale(items, payment.feeKobo, bearer)
    const byInstructor = new Map<string, { pending: bigint; release: bigint }>()
    let platformShare = 0n
    let commission = 0n

    for (const [i, item] of items.entries()) {
      const split = splits[i]
      if (!split) throw new Error('split missing for item')
      const noRefunds = item.refundPolicyDaysSnapshot === 0
      const refundableUntil = new Date(
        payment.paidAt.getTime() + item.refundPolicyDaysSnapshot * 86_400_000,
      )
      await tx.db
        .update(orderItems)
        .set({
          instructorShareKobo: split.instructorShareKobo,
          platformShareKobo: split.platformShareKobo,
          gatewayFeeShareKobo: split.gatewayFeeShareKobo,
          refundableUntil,
          status: noRefunds ? 'non_refundable' : 'active',
          // No refund window: the earning is releasable at once (docs/08 §6 step 2).
          earningStatus: noRefunds ? 'available' : 'pending',
        })
        .where(eq(orderItems.id, item.id))
      const bucket = byInstructor.get(item.instructorId) ?? { pending: 0n, release: 0n }
      bucket.pending += split.instructorShareKobo
      if (noRefunds) bucket.release += split.instructorShareKobo
      byInstructor.set(item.instructorId, bucket)
      platformShare += split.platformShareKobo
      commission += splitBps(item.netPriceKobo, BigInt(item.platformRateBps))[0]
    }

    await tx.db
      .update(orders)
      .set({
        status: 'paid',
        paidAt: payment.paidAt,
        paymentChannel: payment.channel,
        gatewayFeeKobo: payment.feeKobo,
        failureReason: null,
      })
      .where(eq(orders.id, order.id))

    if (order.totalKobo > 0n) {
      // VAT on commission stays off until the accountant confirms (ADR Q6, docs/08 §10).
      const vatRaw = tax.vatOnCommission
        ? percentOf(ngn(commission), BigInt(tax.vatRateBps)).amount
        : 0n
      const vat = vatRaw > platformShare ? platformShare : vatRaw
      const lines: LedgerLine[] = [
        { account: P.cashPaystack, debit: order.totalKobo - payment.feeKobo },
        { account: P.gatewayFees, debit: payment.feeKobo },
        ...[...byInstructor].map(
          ([id, b]): LedgerLine => ({
            account: instructorAccount(id, 'pending'),
            credit: b.pending,
          }),
        ),
        { account: P.revenue, credit: platformShare - vat },
        { account: P.vatPayable, credit: vat },
      ].filter((l) => (l.debit ?? l.credit ?? 0n) > 0n)
      await post(tx, {
        kind: 'sale',
        ref: { type: 'order', id: order.id },
        idempotencyKey: `sale:${order.id}`,
        description: `Order ${order.publicId}`,
        lines,
      })
      const releases = [...byInstructor].filter(([, b]) => b.release > 0n)
      if (releases.length > 0) {
        await post(tx, {
          kind: 'release',
          ref: { type: 'order', id: order.id },
          idempotencyKey: `release:${order.id}:no-refund-window`,
          description: `Order ${order.publicId}: courses without a refund window`,
          lines: releases.flatMap(([id, b]): LedgerLine[] => [
            { account: instructorAccount(id, 'pending'), debit: b.release },
            { account: instructorAccount(id, 'available'), credit: b.release },
          ]),
        })
      }
    }

    const fromCoupon100 = order.totalKobo === 0n && order.couponId !== null
    for (const item of items) {
      await grantEnrollment(tx, {
        userId: order.userId,
        courseId: item.courseId,
        source: fromCoupon100 ? 'coupon_100' : item.bundleId ? 'bundle' : 'purchase',
        orderItemId: item.id,
      })
    }

    if (order.couponId) {
      // Honour the discount the buyer already paid with, even if the limit was reached meanwhile.
      await tx.db
        .select({ id: coupons.id })
        .from(coupons)
        .where(eq(coupons.id, order.couponId))
        .for('update')
      const [redeemed] = await tx.db
        .insert(couponRedemptions)
        .values({ couponId: order.couponId, orderId: order.id, userId: order.userId })
        .onConflictDoNothing()
        .returning({ id: couponRedemptions.id })
      if (redeemed) {
        await tx.db
          .update(coupons)
          .set({ redemptionCount: sql`${coupons.redemptionCount} + 1` })
          .where(eq(coupons.id, order.couponId))
      }
    }

    const refs = new Map<string, { itemType: 'course' | 'bundle'; itemId: string }>()
    for (const item of items) refs.set(`${item.itemType}:${item.itemId}`, item)
    await clearPurchased(tx, order.userId, [...refs.values()])

    await tx.events.emit('order.paid', {
      orderId: order.id,
      userId: order.userId,
      totalKobo: order.totalKobo.toString(),
      itemsCount: items.length,
    })
    const [buyer] = await tx.db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, order.userId))
    if (buyer) {
      const app = provider(tx, 'urls').app
      await sendEmail(tx, {
        id: 'order-receipt',
        to: buyer.email,
        businessKey: order.id,
        data: {
          name: buyer.name.split(/\s+/)[0] ?? buyer.name,
          publicId: order.publicId,
          paidAt: payment.paidAt.toISOString(),
          items: items.map((item) => ({
            title: item.courseTitleSnapshot,
            netKobo: item.netPriceKobo.toString(),
            refundLine: refundLine(
              item.refundPolicyDaysSnapshot,
              new Date(payment.paidAt.getTime() + item.refundPolicyDaysSnapshot * 86_400_000),
            ),
          })),
          subtotalKobo: order.subtotalKobo.toString(),
          discountKobo: order.discountKobo.toString(),
          totalKobo: order.totalKobo.toString(),
          paymentMethod: channelLabel(payment.channel),
          learnUrl: `${app}/account`,
          receiptUrl: `${app}/account/orders/${order.publicId}`,
        },
      })
    }
    return { order, items }
  })

  if (!done) return
  await ctx.cache.invalidate([cacheTags.userEnrollments(done.order.userId)])
  void track(
    ctx,
    'order_paid',
    {
      order_id: done.order.id,
      total_kobo: Number(done.order.totalKobo),
      items_count: done.items.length,
      sources: [...new Set(done.items.map((i) => i.attributionSource))].join(','),
      payment_channel: payment.channel,
    },
    { distinctId: done.order.userId },
  )
  for (const item of done.items) {
    void track(
      ctx,
      'enrolled',
      { course_id: item.courseId, source: item.bundleId ? 'bundle' : 'purchase' },
      { distinctId: done.order.userId },
    )
  }
}

const channelLabel = (channel: string | null): string | null => {
  if (!channel) return null
  const labels: Record<string, string> = {
    card: 'card',
    bank: 'bank',
    bank_transfer: 'bank transfer',
    ussd: 'USSD',
    mobile_money: 'mobile money',
    qr: 'QR code',
  }
  return labels[channel] ?? channel
}

/**
 * Hourly (docs/08 §6): verify pending orders from the last 24 hours that opened a Paystack
 * payment at least 5 minutes ago, in case the confirm call and the webhook were both missed.
 */
export async function reconcilePendingOrders(ctx: Ctx): Promise<{ checked: number; paid: number }> {
  const since = new Date(ctx.now.getTime() - 24 * 3_600_000)
  const settled = new Date(ctx.now.getTime() - 5 * 60_000)
  const pending = await ctx.db
    .select({ reference: orders.providerReference })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'pending'),
        eq(orders.provider, 'paystack'),
        isNotNull(orders.initializedAt),
        gt(orders.createdAt, since),
        lt(orders.initializedAt, settled),
      ),
    )
    .limit(500)
  let paid = 0
  for (const { reference } of pending) {
    if (!reference) continue
    try {
      const r = await completeOrder(ctx, { reference, via: 'reconcile' })
      if (r.status === 'paid') paid++
    } catch (error) {
      log('warn', 'reconcile: order not completed', {
        requestId: ctx.requestId,
        reference,
        error: String(error),
      })
    }
  }
  return { checked: pending.length, paid }
}

/** Daily-ish (docs/08 §6): pending orders older than 24 h get a last check, then `abandoned`. */
export async function abandonStaleOrders(ctx: Ctx): Promise<{ abandoned: number; paid: number }> {
  const cutoff = new Date(ctx.now.getTime() - 24 * 3_600_000)
  const stale = await ctx.db
    .select({
      id: orders.id,
      reference: orders.providerReference,
      initializedAt: orders.initializedAt,
    })
    .from(orders)
    .where(and(eq(orders.status, 'pending'), lt(orders.createdAt, cutoff)))
    .limit(1000)
  let abandoned = 0
  let paid = 0
  for (const o of stale) {
    if (o.reference && o.initializedAt) {
      try {
        const r = await completeOrder(ctx, { reference: o.reference, via: 'reconcile' })
        if (r.status === 'paid') {
          paid++
          continue
        }
      } catch (error) {
        log('warn', 'abandon: final verify failed', {
          requestId: ctx.requestId,
          error: String(error),
        })
        continue
      }
    }
    const updated = await ctx.db
      .update(orders)
      .set({ status: 'abandoned' })
      .where(and(eq(orders.id, o.id), eq(orders.status, 'pending')))
      .returning({ id: orders.id })
    abandoned += updated.length
  }
  return { abandoned, paid }
}

/**
 * docs/05 §5 order checks: every paid order with money has a sale entry, and every item of a
 * paid order has an enrollment.
 */
export async function checkOrderIntegrity(ctx: Ctx) {
  const missingSale = await ctx.db.execute(sql`
    select o.public_id as id from ${orders} o
    where o.status = 'paid' and o.total_kobo > 0 and not exists (
      select 1 from journal_entries e where e.idempotency_key = 'sale:' || o.id)
    limit 100`)
  const missingEnrollment = await ctx.db.execute(sql`
    select o.public_id as id from ${orders} o
    join ${orderItems} i on i.order_id = o.id
    where o.status = 'paid' and i.status <> 'refunded' and not exists (
      select 1 from enrollments e where e.user_id = o.user_id and e.course_id = i.course_id)
    limit 100`)
  const ids = (r: unknown) => (r as { rows: Array<{ id: string }> }).rows.map((x) => x.id)
  const sale = ids(missingSale)
  const enrollment = ids(missingEnrollment)
  return {
    ok: sale.length === 0 && enrollment.length === 0,
    ordersWithoutSaleEntry: sale,
    ordersWithoutEnrollment: [...new Set(enrollment)],
  }
}

/**
 * docs/08 §7: the first consumption that crosses a refund rule (an important download, 30% of
 * the course watched) makes the purchase non-refundable and releases the instructor's earning at
 * once. Idempotent; courses the user didn't buy (free, gifted) have nothing to release.
 */
const consumedWhy = {
  important_download: 'important file downloaded',
  content_consumed: 'course watched past the refund limit',
  exam_started: 'certification exam started',
  certificate_issued: 'certificate issued',
} as const

export async function markPurchaseConsumed(
  ctx: Ctx,
  input: {
    userId: string
    courseId: string
    reason: 'important_download' | 'content_consumed' | 'exam_started' | 'certificate_issued'
  },
): Promise<{ released: boolean }> {
  return inTransaction(ctx, async (tx) => {
    const [item] = await tx.db
      .select({ item: orderItems, orderStatus: orders.status, publicId: orders.publicId })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.userId, input.userId),
          eq(orderItems.courseId, input.courseId),
          eq(orders.status, 'paid'),
          eq(orderItems.status, 'active'),
        ),
      )
      .orderBy(orderItems.createdAt)
      .limit(1)
      .for('update', { of: orderItems })
    if (!item) return { released: false }
    const share = item.item.instructorShareKobo ?? 0n
    const pending = item.item.earningStatus === 'pending'
    await tx.db
      .update(orderItems)
      .set({
        status: 'non_refundable',
        ...(pending ? { earningStatus: 'available' as const } : {}),
      })
      .where(eq(orderItems.id, item.item.id))
    if (pending && share > 0n) {
      await post(tx, {
        kind: 'release',
        ref: { type: 'order', id: item.item.orderId },
        idempotencyKey: `release:item:${item.item.id}`,
        description: `Order ${item.publicId}: ${consumedWhy[input.reason]}`,
        lines: [
          { account: instructorAccount(item.item.instructorId, 'pending'), debit: share },
          { account: instructorAccount(item.item.instructorId, 'available'), credit: share },
        ],
      })
    }
    return { released: pending && share > 0n }
  })
}

/**
 * Where the user's refund right for a course stands, for the player's files list: `open` until a
 * date, `ended` (window passed, content consumed, or a no-refund course), or null when there was
 * no paid purchase (free course, bundle gift, staff).
 */
export async function purchaseRefundState(
  ctx: Ctx,
  input: { userId: string; courseId: string },
): Promise<{ state: 'open'; until: Date } | { state: 'ended' } | null> {
  const [row] = await ctx.db
    .select({ status: orderItems.status, refundableUntil: orderItems.refundableUntil })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, input.userId),
        eq(orderItems.courseId, input.courseId),
        eq(orders.status, 'paid'),
        inArray(orderItems.status, ['active', 'non_refundable']),
        gt(orderItems.netPriceKobo, 0n),
      ),
    )
    .orderBy(desc(orders.paidAt))
    .limit(1)
  if (!row) return null
  if (row.status === 'active' && row.refundableUntil && row.refundableUntil > ctx.now) {
    return { state: 'open', until: row.refundableUntil }
  }
  return { state: 'ended' }
}

/**
 * The user's paid purchase of a course that can still be refunded (status active, window open),
 * or null. The player uses it to warn before an important download (docs/08 §7).
 */
export async function refundablePurchase(
  ctx: Ctx,
  input: { userId: string; courseId: string },
): Promise<{ orderItemId: string; refundableUntil: Date | null } | null> {
  const [row] = await ctx.db
    .select({ id: orderItems.id, refundableUntil: orderItems.refundableUntil })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orders.userId, input.userId),
        eq(orderItems.courseId, input.courseId),
        eq(orders.status, 'paid'),
        eq(orderItems.status, 'active'),
        gt(orderItems.refundableUntil, ctx.now),
      ),
    )
    .limit(1)
  return row ? { orderItemId: row.id, refundableUntil: row.refundableUntil } : null
}

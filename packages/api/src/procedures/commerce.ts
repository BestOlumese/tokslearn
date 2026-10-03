import type {
  AdminOrderDto,
  CartDto,
  CartItemDto,
  CommissionRuleDto,
  CouponDto,
  JournalEntryDto,
  MyCourseDto,
  OrderDetailDto,
  OrderSummaryDto,
} from '@tokslearn/contract'
import * as commerce from '@tokslearn/core/commerce'
import * as enrollments from '@tokslearn/core/enrollments'
import { NotFoundError } from '@tokslearn/core/kernel'
import type * as ledger from '@tokslearn/core/ledger'
import { authed, pub, staff } from '../base'

// Commerce procedures (docs/06 §5): thin, auth → validate → core → DTO. Money leaves as strings.

const k = (v: bigint) => v.toString()
const kn = (v: bigint | null) => (v === null ? null : v.toString())
const iso = (d: Date) => d.toISOString()
const isoN = (d: Date | null) => (d ? d.toISOString() : null)
const ok = { ok: true as const }

const toItem = (i: commerce.ItemView): CartItemDto => ({
  itemType: i.itemType,
  itemId: i.itemId,
  slug: i.slug,
  title: i.title,
  instructorName: i.instructorName,
  coverUrl: i.coverUrl,
  priceKobo: k(i.priceKobo),
  compareAtKobo: kn(i.compareAtKobo),
  courseIds: i.courseIds,
  refundPolicyDays: i.refundPolicyDays,
  cohortBased: i.cohortBased,
  cohort: i.cohort ? { ...i.cohort, startsAt: iso(i.cohort.startsAt) } : null,
})

const toCart = (c: commerce.CartView): CartDto => ({
  items: c.items.map(toItem),
  removed: c.removed,
  couponCode: c.couponCode,
  couponError: c.couponError,
  subtotalKobo: k(c.subtotalKobo),
  discountKobo: k(c.discountKobo),
  totalKobo: k(c.totalKobo),
})

const toSummary = (o: commerce.OrderSummary): OrderSummaryDto => ({
  ...o,
  totalKobo: k(o.totalKobo),
  createdAt: iso(o.createdAt),
  paidAt: isoN(o.paidAt),
})

const toDetail = (o: commerce.OrderDetail): OrderDetailDto => ({
  ...toSummary(o),
  subtotalKobo: k(o.subtotalKobo),
  discountKobo: k(o.discountKobo),
  paymentChannel: o.paymentChannel,
  items: o.items.map((i) => ({
    ...i,
    listPriceKobo: k(i.listPriceKobo),
    discountKobo: k(i.discountKobo),
    netPriceKobo: k(i.netPriceKobo),
    refundableUntil: isoN(i.refundableUntil),
  })),
})

const toCoupon = (c: commerce.CouponView): CouponDto => ({
  ...c,
  amountOffKobo: kn(c.amountOffKobo),
  discountGivenKobo: k(c.discountGivenKobo),
  startsAt: isoN(c.startsAt),
  endsAt: isoN(c.endsAt),
  announcedAt: isoN(c.announcedAt),
  createdAt: iso(c.createdAt),
})

const toEntry = (e: ledger.JournalEntryView): JournalEntryDto => ({
  ...e,
  postedAt: iso(e.postedAt),
  lines: e.lines.map(({ id: _id, ...l }) => ({ ...l, amountKobo: k(l.amountKobo) })),
})

const couponInput = (i: {
  code: string
  kind: 'percent' | 'fixed'
  percentOff?: number | null | undefined
  amountOffKobo?: string | null | undefined
  appliesTo: 'course' | 'bundle' | 'instructor_all' | 'all'
  targetId?: string | null | undefined
  maxRedemptions?: number | null | undefined
  perUserLimit?: number | undefined
  startsAt?: string | null | undefined
  endsAt?: string | null | undefined
}): commerce.CouponInput => ({
  ...i,
  amountOffKobo: i.amountOffKobo ? BigInt(i.amountOffKobo) : null,
  startsAt: i.startsAt ? new Date(i.startsAt) : null,
  endsAt: i.endsAt ? new Date(i.endsAt) : null,
})

export const cartRouter = {
  get: authed.cart.get.handler(async ({ context }) => toCart(await commerce.getCart(context.ctx))),
  count: pub.cart.count.handler(async ({ context }) => ({
    count: await commerce.cartCount(context.ctx),
  })),
  add: authed.cart.add.handler(async ({ context, input }) =>
    toCart(await commerce.addToCart(context.ctx, input)),
  ),
  remove: authed.cart.remove.handler(async ({ context, input }) =>
    toCart(await commerce.removeFromCart(context.ctx, input)),
  ),
  merge: authed.cart.merge.handler(async ({ context, input }) =>
    toCart(await commerce.mergeCart(context.ctx, input.items)),
  ),
  setCoupon: authed.cart.setCoupon.handler(async ({ context, input }) =>
    toCart(await commerce.setCartCoupon(context.ctx, input.code)),
  ),
  moveToWishlist: authed.cart.moveToWishlist.handler(async ({ context, input }) =>
    toCart(await commerce.moveToWishlist(context.ctx, input.courseId)),
  ),
  preview: pub.cart.preview.handler(async ({ context, input }) =>
    toCart(
      await commerce.previewCart(context.ctx, {
        items: input.items,
        couponCode: input.couponCode ?? null,
      }),
    ),
  ),
}

export const wishlistRouter = {
  list: authed.wishlist.list.handler(async ({ context }) => ({
    items: (await commerce.listWishlist(context.ctx)).map(toItem),
  })),
  add: authed.wishlist.add.handler(async ({ context, input }) => {
    await commerce.addToWishlist(context.ctx, input.courseId)
    return ok
  }),
  remove: authed.wishlist.remove.handler(async ({ context, input }) => {
    await commerce.removeFromWishlist(context.ctx, input.courseId)
    return ok
  }),
}

export const couponsRouter = {
  validate: authed.coupons.validate.handler(async ({ context, input }) => {
    const r = await commerce.validateCoupon(context.ctx, input.code)
    return { code: r.code, discountKobo: k(r.discountKobo), totalKobo: k(r.totalKobo) }
  }),
}

export const checkoutRouter = {
  start: authed.checkout.start.handler(async ({ context, input }) => {
    const r = await commerce.startCheckout(context.ctx, {
      expectedTotalKobo: BigInt(input.expectedTotalKobo),
      idempotencyKey: input.idempotencyKey,
      anonymousId: input.anonymousId ?? null,
    })
    return { ...r, totalKobo: k(r.totalKobo) }
  }),
  confirm: authed.checkout.confirm.handler(async ({ context, input }) =>
    commerce.completeOrder(context.ctx, {
      reference: input.reference,
      via: 'confirm',
      userId: context.user.userId,
    }),
  ),
}

export const ordersRouter = {
  list: authed.orders.list.handler(async ({ context, input }) => {
    const page = await commerce.listMyOrders(context.ctx, input)
    return { items: page.items.map(toSummary), nextCursor: page.nextCursor }
  }),
  get: authed.orders.get.handler(async ({ context, input }) =>
    toDetail(await commerce.getMyOrder(context.ctx, input.publicId)),
  ),
}

export const enrollmentsRouter = {
  enrollFree: authed.enrollments.enrollFree.handler(async ({ context, input }) =>
    enrollments.enrollFree(context.ctx, input.courseId, input.cohortId ?? null),
  ),
  listMine: authed.enrollments.listMine.handler(async ({ context, input }) => ({
    items: (await enrollments.listMyCourses(context.ctx, input)).map(
      (c): MyCourseDto => ({
        ...c,
        lastAccessedAt: isoN(c.lastAccessedAt),
        enrolledAt: iso(c.enrolledAt),
      }),
    ),
  })),
  status: authed.enrollments.status.handler(async ({ context, input }) => {
    const [enrolled, wishlisted, inCart] = await Promise.all([
      enrollments.enrolledCourseIds(context.ctx, context.user.userId, input.courseIds),
      commerce.wishlistHas(context.ctx, input.courseIds),
      commerce.cartCourseIds(context.ctx, input.courseIds),
    ])
    return { enrolled: [...enrolled], wishlisted: [...wishlisted], inCart: [...inCart] }
  }),
}

export const bundlesRouter = {
  getBySlug: pub.bundles.getBySlug.handler(async ({ context, input }) => {
    const b = await commerce.getPublicBundle(context.ctx, input.slug)
    if (!b) throw new NotFoundError('BUNDLE_NOT_FOUND')
    return {
      id: b.itemId,
      slug: b.slug,
      title: b.title,
      description: b.description,
      instructorName: b.instructorName,
      priceKobo: k(b.priceKobo),
      valueKobo: k(b.compareAtKobo ?? b.priceKobo),
      refundPolicyDays: b.refundPolicyDays,
      courses: b.courses.map((c) => ({ ...c, priceKobo: k(c.priceKobo) })),
    }
  }),
}

export const referralsRouter = {
  list: authed.referrals.list.handler(async ({ context }) => ({
    items: (await commerce.listMyReferralLinks(context.ctx)).map((l) => ({
      ...l,
      earnedKobo: k(l.earnedKobo),
    })),
  })),
}

export const studioCouponsRouter = {
  list: authed.studio.coupons.list.handler(async ({ context }) => ({
    items: (await commerce.listMyCoupons(context.ctx)).map(toCoupon),
  })),
  create: authed.studio.coupons.create.handler(async ({ context, input }) => {
    const row = await commerce.createInstructorCoupon(context.ctx, couponInput(input))
    const [view] = (await commerce.listMyCoupons(context.ctx)).filter((c) => c.id === row.id)
    if (!view) throw new NotFoundError('COUPON_NOT_FOUND')
    return toCoupon(view)
  }),
  setActive: authed.studio.coupons.setActive.handler(async ({ context, input }) => {
    await commerce.setCouponActive(context.ctx, input)
    return ok
  }),
  announce: authed.studio.coupons.announce.handler(async ({ context, input }) => {
    const r = await commerce.announceCoupon(context.ctx, input.couponId)
    return { announcedAt: iso(r.announcedAt) }
  }),
}

const superAdmins = staff('super_admin')
const admins = staff('admin', 'super_admin')
const moneyStaff = staff('finance', 'support', 'admin', 'super_admin')
const financeStaff = staff('finance', 'admin', 'super_admin')

export const adminCommissionRouter = {
  list: superAdmins.admin.commission.list.handler(async ({ context }) => ({
    items: (await commerce.listCommissionRules(context.ctx)).map(
      (r): CommissionRuleDto => ({
        id: r.id,
        scope: r.scope,
        instructorId: r.instructorId,
        instructorName: r.instructorName,
        source: r.source,
        platformRateBps: r.platformRateBps,
        startsAt: iso(r.startsAt),
        endsAt: isoN(r.endsAt),
        note: r.note,
        active: r.active,
      }),
    ),
  })),
  setDefault: superAdmins.admin.commission.setDefault.handler(async ({ context, input }) => {
    await commerce.setDefaultRate(context.ctx, input)
    return ok
  }),
  addRule: superAdmins.admin.commission.addRule.handler(async ({ context, input }) => {
    await commerce.addInstructorRule(context.ctx, {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
    })
    return ok
  }),
  endRule: superAdmins.admin.commission.endRule.handler(async ({ context, input }) => {
    await commerce.endRule(context.ctx, input)
    return ok
  }),
}

export const adminOrdersRouter = {
  search: moneyStaff.admin.orders.search.handler(async ({ context, input }) => {
    const page = await commerce.searchOrders(context.ctx, input)
    return {
      items: page.items.map((o) => ({
        ...toSummary(o),
        buyerEmail: o.buyerEmail,
        buyerName: o.buyerName,
      })),
      nextCursor: page.nextCursor,
    }
  }),
  get: moneyStaff.admin.orders.get.handler(async ({ context, input }): Promise<AdminOrderDto> => {
    const o = await commerce.getOrderForStaff(context.ctx, input.orderId)
    const d = toDetail(o)
    return {
      ...d,
      buyer: o.buyer,
      provider: o.provider,
      providerReference: o.providerReference,
      failureReason: o.failureReason,
      gatewayFeeKobo: kn(o.gatewayFeeKobo),
      items: o.items.map((i) => ({
        id: i.id,
        courseId: i.courseId,
        courseSlug: i.courseSlug,
        title: i.title,
        bundleId: i.bundleId,
        listPriceKobo: k(i.listPriceKobo),
        discountKobo: k(i.discountKobo),
        netPriceKobo: k(i.netPriceKobo),
        refundPolicyDays: i.refundPolicyDays,
        refundableUntil: isoN(i.refundableUntil),
        status: i.status,
        instructorId: i.instructorId,
        attributionSource: i.attributionSource,
        platformRateBps: i.platformRateBps,
        instructorShareKobo: kn(i.instructorShareKobo),
        platformShareKobo: kn(i.platformShareKobo),
        gatewayFeeShareKobo: kn(i.gatewayFeeShareKobo),
        earningStatus: i.earningStatus,
      })),
      ledger: o.ledger.map(toEntry),
      webhooks: o.webhooks.map((w) => ({
        ...w,
        receivedAt: iso(w.receivedAt),
        processedAt: isoN(w.processedAt),
      })),
    }
  }),
  reverify: moneyStaff.admin.orders.reverify.handler(async ({ context, input }) =>
    commerce.reverifyOrder(context.ctx, input.orderId),
  ),
}

export const adminCouponsRouter = {
  list: admins.admin.coupons.list.handler(async ({ context, input }) => ({
    items: (await commerce.listAllCoupons(context.ctx, input)).map(toCoupon),
  })),
  create: admins.admin.coupons.create.handler(async ({ context, input }) => {
    const row = await commerce.createPlatformCoupon(context.ctx, couponInput(input))
    const [view] = (await commerce.listAllCoupons(context.ctx, { scope: 'platform' })).filter(
      (c) => c.id === row.id,
    )
    if (!view) throw new NotFoundError('COUPON_NOT_FOUND')
    return toCoupon(view)
  }),
  setActive: admins.admin.coupons.setActive.handler(async ({ context, input }) => {
    await commerce.setCouponActive(context.ctx, input)
    return ok
  }),
}

export const adminLedgerRouter = {
  list: financeStaff.admin.ledger.list.handler(async ({ context, input }) => {
    const { page } = await commerce.ledgerOverview(context.ctx, {
      kind: input.kind as ledger.JournalKind | undefined,
      cursor: input.cursor,
      limit: 25,
    })
    return { items: page.items.map(toEntry), nextCursor: page.nextCursor }
  }),
  integrity: financeStaff.admin.ledger.integrity.handler(
    async ({ context }) => (await commerce.ledgerOverview(context.ctx, { limit: 1 })).integrity,
  ),
}

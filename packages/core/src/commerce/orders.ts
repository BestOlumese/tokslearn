import { schema } from '@tokslearn/db'
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm'
import { hasRole, type UserActor } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { NotFoundError } from '../kernel/errors'
import { requireStaff, requireUser } from '../kernel/guards'
import {
  checkLedgerIntegrity,
  entriesFor,
  type JournalEntryView,
  type JournalKind,
  listEntries,
} from '../ledger'
import { checkOrderIntegrity, completeOrder } from './checkout'

// Orders for learners (docs/20 `/account/orders`) and staff (`/admin/orders`). Receipts show the
// snapshots taken at checkout, never live prices.
// Foreign reads (docs/03 §3): user, courses, payment_events.

const { orders, orderItems, user, courses, paymentEvents } = schema

export const canViewOrders = (actor: UserActor): boolean =>
  hasRole(actor, 'finance', 'support', 'admin', 'super_admin')

export interface OrderSummary {
  id: string
  publicId: string
  status: 'pending' | 'paid' | 'failed' | 'abandoned' | 'refunded' | 'partially_refunded'
  totalKobo: bigint
  itemsCount: number
  firstTitle: string
  createdAt: Date
  paidAt: Date | null
}

export interface OrderDetail extends OrderSummary {
  subtotalKobo: bigint
  discountKobo: bigint
  paymentChannel: string | null
  gatewayFeeKobo: bigint | null
  couponId: string | null
  items: Array<{
    id: string
    courseId: string
    courseSlug: string
    title: string
    bundleId: string | null
    listPriceKobo: bigint
    discountKobo: bigint
    netPriceKobo: bigint
    refundPolicyDays: number
    refundableUntil: Date | null
    status: 'active' | 'refunded' | 'non_refundable' | 'refund_pending'
  }>
}

const encode = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
function decode(cursor: string | undefined) {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const at = new Date(iso ?? '')
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null
}

async function summaries(ctx: Ctx, where: ReturnType<typeof and>, limit: number) {
  const rows = await ctx.db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const items = page.length
    ? await ctx.db
        .select({ orderId: orderItems.orderId, title: orderItems.courseTitleSnapshot })
        .from(orderItems)
        .where(or(...page.map((o) => eq(orderItems.orderId, o.id))))
        .orderBy(orderItems.createdAt)
    : []
  const last = page.at(-1)
  return {
    items: page.map(
      (o): OrderSummary => ({
        id: o.id,
        publicId: o.publicId,
        status: o.status,
        totalKobo: o.totalKobo,
        itemsCount: items.filter((i) => i.orderId === o.id).length,
        firstTitle: items.find((i) => i.orderId === o.id)?.title ?? '',
        createdAt: o.createdAt,
        paidAt: o.paidAt,
      }),
    ),
    nextCursor: rows.length > limit && last ? encode(last.createdAt, last.id) : null,
  }
}

const after = (cursor: string | undefined) => {
  const c = decode(cursor)
  return c
    ? or(lt(orders.createdAt, c.at), and(eq(orders.createdAt, c.at), lt(orders.id, c.id)))
    : undefined
}

/** The learner's orders, newest first. Abandoned attempts are hidden; failed ones stay. */
export async function listMyOrders(
  ctx: Ctx,
  input: { cursor?: string | undefined; limit?: number } = {},
) {
  const actor = requireUser(ctx.actor)
  return summaries(
    ctx,
    and(
      eq(orders.userId, actor.userId),
      or(
        eq(orders.status, 'paid'),
        eq(orders.status, 'pending'),
        eq(orders.status, 'failed'),
        eq(orders.status, 'refunded'),
        eq(orders.status, 'partially_refunded'),
      ),
      after(input.cursor),
    ),
    Math.min(input.limit ?? 20, 50),
  )
}

async function detail(ctx: Ctx, order: typeof orders.$inferSelect): Promise<OrderDetail> {
  const items = await ctx.db
    .select({ item: orderItems, slug: courses.slug })
    .from(orderItems)
    .innerJoin(courses, eq(courses.id, orderItems.courseId))
    .where(eq(orderItems.orderId, order.id))
    .orderBy(orderItems.createdAt, orderItems.id)
  return {
    id: order.id,
    publicId: order.publicId,
    status: order.status,
    totalKobo: order.totalKobo,
    itemsCount: items.length,
    firstTitle: items[0]?.item.courseTitleSnapshot ?? '',
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    subtotalKobo: order.subtotalKobo,
    discountKobo: order.discountKobo,
    paymentChannel: order.paymentChannel,
    gatewayFeeKobo: order.gatewayFeeKobo,
    couponId: order.couponId,
    items: items.map(({ item, slug }) => ({
      id: item.id,
      courseId: item.courseId,
      courseSlug: slug,
      title: item.courseTitleSnapshot,
      bundleId: item.bundleId,
      listPriceKobo: item.listPriceKobo,
      discountKobo: item.discountKobo,
      netPriceKobo: item.netPriceKobo,
      refundPolicyDays: item.refundPolicyDaysSnapshot,
      refundableUntil: item.refundableUntil,
      status: item.status,
    })),
  }
}

/** A receipt (docs/20 `/account/orders/[publicId]`). Other people's orders don't exist. */
export async function getMyOrder(ctx: Ctx, publicId: string): Promise<OrderDetail> {
  const actor = requireUser(ctx.actor)
  const [order] = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.publicId, publicId), eq(orders.userId, actor.userId)))
  if (!order) throw new NotFoundError('ORDER_NOT_FOUND')
  return detail(ctx, order)
}

// ── Staff (docs/20 `/admin/orders`) ───────────────────────────────────────────────

/** Search by order id (TL-…), Paystack reference or buyer email. */
export async function searchOrders(
  ctx: Ctx,
  input: { q?: string | undefined; cursor?: string | undefined; limit?: number },
) {
  requireStaff(ctx.actor, canViewOrders)
  const q = input.q?.trim()
  let where = after(input.cursor)
  if (q) {
    const byEmail = q.includes('@')
      ? await ctx.db
          .select({ id: user.id })
          .from(user)
          .where(ilike(user.email, q.replace(/[%_]/g, '')))
      : []
    where = and(
      where,
      or(
        eq(orders.publicId, q.toUpperCase()),
        eq(orders.providerReference, q),
        ...byEmail.map((u) => eq(orders.userId, u.id)),
      ),
    )
  }
  const page = await summaries(ctx, where, Math.min(input.limit ?? 25, 50))
  const buyers = page.items.length
    ? await ctx.db
        .select({ orderId: orders.id, email: user.email, name: user.name })
        .from(orders)
        .innerJoin(user, eq(user.id, orders.userId))
        .where(or(...page.items.map((o) => eq(orders.id, o.id))))
    : []
  return {
    items: page.items.map((o) => ({
      ...o,
      buyerEmail: buyers.find((b) => b.orderId === o.id)?.email ?? '',
      buyerName: buyers.find((b) => b.orderId === o.id)?.name ?? '',
    })),
    nextCursor: page.nextCursor,
  }
}

export interface AdminOrderDetail extends OrderDetail {
  buyer: { id: string; name: string; email: string }
  provider: string
  providerReference: string | null
  failureReason: string | null
  items: Array<
    OrderDetail['items'][number] & {
      instructorId: string
      attributionSource: string
      platformRateBps: number
      instructorShareKobo: bigint | null
      platformShareKobo: bigint | null
      gatewayFeeShareKobo: bigint | null
      earningStatus: string
    }
  >
  ledger: JournalEntryView[]
  webhooks: Array<{
    type: string
    receivedAt: Date
    processedAt: Date | null
    error: string | null
  }>
}

export async function getOrderForStaff(ctx: Ctx, orderId: string): Promise<AdminOrderDetail> {
  requireStaff(ctx.actor, canViewOrders)
  const [row] = await ctx.db
    .select({ order: orders, name: user.name, email: user.email })
    .from(orders)
    .innerJoin(user, eq(user.id, orders.userId))
    .where(eq(orders.id, orderId))
  if (!row) throw new NotFoundError('ORDER_NOT_FOUND')
  const base = await detail(ctx, row.order)
  const raw = await ctx.db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, row.order.id))
    .orderBy(orderItems.createdAt, orderItems.id)
  const events = row.order.providerReference
    ? await ctx.db
        .select()
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.provider, 'paystack'),
            ilike(paymentEvents.eventId, `%:${row.order.providerReference}`),
          ),
        )
        .orderBy(paymentEvents.createdAt)
    : []
  return {
    ...base,
    buyer: { id: row.order.userId, name: row.name, email: row.email },
    provider: row.order.provider,
    providerReference: row.order.providerReference,
    failureReason: row.order.failureReason,
    items: base.items.map((item) => {
      const r = raw.find((x) => x.id === item.id)
      return {
        ...item,
        instructorId: r?.instructorId ?? '',
        attributionSource: r?.attributionSource ?? '',
        platformRateBps: r?.platformRateBps ?? 0,
        instructorShareKobo: r?.instructorShareKobo ?? null,
        platformShareKobo: r?.platformShareKobo ?? null,
        gatewayFeeShareKobo: r?.gatewayFeeShareKobo ?? null,
        earningStatus: r?.earningStatus ?? 'pending',
      }
    }),
    ledger: await entriesFor(ctx, { type: 'order', id: row.order.id }),
    webhooks: events.map((e) => ({
      type: e.type,
      receivedAt: e.createdAt,
      processedAt: e.processedAt,
      error: e.error,
    })),
  }
}

/** "Check with Paystack again" on an order that looks stuck. Safe to press twice. */
export async function reverifyOrder(ctx: Ctx, orderId: string) {
  requireStaff(ctx.actor, canViewOrders)
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, orderId))
  if (!order) throw new NotFoundError('ORDER_NOT_FOUND')
  return completeOrder(ctx, { reference: order.providerReference ?? order.publicId, via: 'admin' })
}

export const canViewLedger = (actor: UserActor): boolean =>
  hasRole(actor, 'finance', 'admin', 'super_admin')

/**
 * The ledger explorer (`/admin/ledger`, finance and admins): a page of entries plus the
 * integrity check the nightly job runs.
 */
export async function ledgerOverview(
  ctx: Ctx,
  input: { kind?: JournalKind | undefined; cursor?: string | undefined; limit?: number },
) {
  requireStaff(ctx.actor, canViewLedger)
  const [page, books, orderChecks] = await Promise.all([
    listEntries(ctx, {
      kind: input.kind,
      cursor: input.cursor,
      limit: Math.min(input.limit ?? 20, 50),
    }),
    checkLedgerIntegrity(ctx),
    checkOrderIntegrity(ctx),
  ])
  return {
    page,
    integrity: {
      ok: books.ok && orderChecks.ok,
      unbalancedEntries: books.unbalancedEntries,
      balanceMismatches: books.balanceMismatches,
      ordersWithoutSaleEntry: orderChecks.ordersWithoutSaleEntry,
      ordersWithoutEnrollment: orderChecks.ordersWithoutEnrollment,
    },
  }
}

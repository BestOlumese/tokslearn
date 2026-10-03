import { publicId, schema } from '@tokslearn/db'
import { ProviderError } from '@tokslearn/integrations/paystack'
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { getSetting, writeAudit } from '../admin'
import { track } from '../analytics'
import { revokeEnrollment } from '../enrollments'
import { hasRole, type UserActor } from '../kernel/actor'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import {
  ConflictError,
  ExternalServiceError,
  NotFoundError,
  RuleViolationError,
} from '../kernel/errors'
import { requireStaff, requireUser } from '../kernel/guards'
import { log } from '../kernel/logger'
import { instructorAccount, type LedgerLine, platformAccounts as P, post } from '../ledger'
import { notify } from '../notifications'
import {
  ABUSE_WINDOW_DAYS,
  DEFAULT_ABUSE_LIMIT,
  DEFAULT_CONSUMPTION_THRESHOLD_PCT,
  type Eligibility,
  refundEligibility,
} from './refund-rules'

// Refunds (docs/08 §7, docs/20 Phase 10 rows, ADR-043): the learner asks from their order; the
// rules approve, decline or send it to finance; a decline can be appealed once. An approved
// refund ends access at once and goes to Paystack; the refund.processed webhook (or the hourly
// check) finishes it with a ledger entry that reverses the sale for that item.
// Foreign reads (docs/03 §3): courses, course_revisions, lessons, lesson_progress,
// lesson_resources, consumption_events, user.

const {
  refundRequests,
  orders,
  orderItems,
  courses,
  courseRevisions,
  lessons,
  lessonProgress,
  lessonResources,
  consumptionEvents,
  user,
} = schema

type RefundRow = typeof refundRequests.$inferSelect
export type RefundReason =
  | 'not_as_described'
  | 'quality'
  | 'technical'
  | 'duplicate'
  | 'changed_mind'
  | 'other'

const canDecideRefunds = (a: UserActor) => hasRole(a, 'finance', 'admin', 'super_admin')
const naira = (kobo: bigint) =>
  `₦${(Number(kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`

// ─── Facts and eligibility ───────────────────────────────────────────────────────────────────

async function itemFor(ctx: Ctx, orderItemId: string) {
  const [row] = await ctx.db
    .select({
      item: orderItems,
      userId: orders.userId,
      orderStatus: orders.status,
      orderPublicId: orders.publicId,
      reference: orders.providerReference,
      title: courseRevisions.title,
      slug: courses.slug,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(courses, eq(courses.id, orderItems.courseId))
    .innerJoin(
      courseRevisions,
      eq(courseRevisions.id, sql`coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`),
    )
    .where(eq(orderItems.id, orderItemId))
  return row ?? null
}

async function watchedPct(ctx: Ctx, userId: string, courseId: string): Promise<number> {
  const [row] = await ctx.db
    .select({
      total: sql<number>`coalesce(sum(${lessons.durationSec}), 0)::int`,
      watched: sql<number>`coalesce(sum(least(coalesce(${lessonProgress.watchedSec}, 0), ${lessons.durationSec})), 0)::int`,
    })
    .from(lessons)
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lessons.id), eq(lessonProgress.userId, userId)),
    )
    .where(
      and(
        eq(lessons.courseId, courseId),
        eq(lessons.type, 'video'),
        isNotNull(lessons.liveSince),
        isNull(lessons.deletedAt),
      ),
    )
  const total = row?.total ?? 0
  return total > 0 ? ((row?.watched ?? 0) * 100) / total : 0
}

async function importantDownload(ctx: Ctx, userId: string, courseId: string) {
  const [row] = await ctx.db
    .select({ title: lessonResources.title })
    .from(consumptionEvents)
    .innerJoin(lessonResources, eq(lessonResources.id, consumptionEvents.refId))
    .where(
      and(
        eq(consumptionEvents.userId, userId),
        eq(consumptionEvents.courseId, courseId),
        eq(consumptionEvents.kind, 'resource_download'),
        eq(lessonResources.isImportant, true),
      ),
    )
    .orderBy(asc(consumptionEvents.occurredAt))
    .limit(1)
  return row?.title ?? null
}

async function evaluate(
  ctx: Ctx,
  row: NonNullable<Awaited<ReturnType<typeof itemFor>>>,
): Promise<Eligibility> {
  const num = (v: unknown) => Number(v)
  const [threshold, limit, pct, resource, [recent]] = await Promise.all([
    getSetting(ctx, 'refund_consumption_threshold_pct', num),
    getSetting(ctx, 'refund_abuse_limit', num),
    watchedPct(ctx, row.userId, row.item.courseId),
    row.item.nonRefundableReason === 'important_download'
      ? importantDownload(ctx, row.userId, row.item.courseId)
      : Promise.resolve(null),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.userId, row.userId),
          inArray(refundRequests.status, ['approved', 'processing', 'processed']),
          gt(
            refundRequests.createdAt,
            new Date(ctx.now.getTime() - ABUSE_WINDOW_DAYS * 86_400_000),
          ),
        ),
      ),
  ])
  return refundEligibility({
    netPriceKobo: row.item.netPriceKobo,
    policyDays: row.item.refundPolicyDaysSnapshot,
    refundableUntil: row.item.refundableUntil,
    itemStatus: row.item.status,
    nonRefundableReason: row.item.nonRefundableReason,
    watchedPct: pct,
    thresholdPct: threshold ?? DEFAULT_CONSUMPTION_THRESHOLD_PCT,
    importantResource: resource,
    recentRefunds: recent?.n ?? 0,
    abuseLimit: limit ?? DEFAULT_ABUSE_LIMIT,
    now: ctx.now,
  })
}

/** The learner's own paid item, or ORDER_NOT_FOUND (nothing leaks). */
async function ownItem(ctx: Ctx, orderItemId: string) {
  const me = requireUser(ctx.actor)
  const row = await itemFor(ctx, orderItemId)
  if (!row || row.userId !== me.userId || row.orderStatus === 'pending') {
    throw new NotFoundError('ORDER_NOT_FOUND')
  }
  return { me, row }
}

export interface RefundCheck {
  orderItemId: string
  eligible: boolean
  /** approve: refunded straight away; review: finance decides; deny: the code says why. */
  decision: Eligibility['decision']
  code: string | null
  details: Record<string, string>
  existing: { publicId: string; status: RefundRow['status'] } | null
}

/** `refunds.checkEligibility`: what would happen if the learner asked now (order page). */
export async function checkRefundEligibility(ctx: Ctx, orderItemId: string): Promise<RefundCheck> {
  const { row } = await ownItem(ctx, orderItemId)
  const [existing] = await ctx.db
    .select({ publicId: refundRequests.publicId, status: refundRequests.status })
    .from(refundRequests)
    .where(eq(refundRequests.orderItemId, orderItemId))
  const e = await evaluate(ctx, row)
  return {
    orderItemId,
    eligible: e.decision !== 'deny' && !existing,
    decision: e.decision,
    code: existing ? 'REFUND_ALREADY_REQUESTED' : e.code,
    details: e.details,
    existing: existing ?? null,
  }
}

// ─── Learner actions ─────────────────────────────────────────────────────────────────────────

export interface RefundView {
  id: string
  publicId: string
  orderPublicId: string
  courseTitle: string
  courseSlug: string
  amountKobo: bigint
  reasonCode: RefundReason
  status: RefundRow['status']
  decisionReason: string | null
  canAppeal: boolean
  appealedAt: Date | null
  createdAt: Date
  processedAt: Date | null
}

const appUrl = (ctx: Ctx, path: string) => `${provider(ctx, 'urls').app.replace(/\/$/, '')}${path}`

async function tellLearner(
  ctx: Ctx,
  r: RefundRow,
  title: string,
  outcome: 'approved' | 'denied' | 'under_review' | 'processed',
  reason: string | null,
) {
  const [person] = await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, r.userId))
  const [course] = await ctx.db
    .select({ title: courseRevisions.title })
    .from(courses)
    .innerJoin(
      courseRevisions,
      eq(courseRevisions.id, sql`coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`),
    )
    .where(eq(courses.id, r.courseId))
  const courseTitle = course?.title ?? 'your course'
  await notify(ctx, {
    userId: r.userId,
    type: 'refund.updated',
    title: title.replace('{course}', courseTitle),
    body: reason,
    link: '/account/refunds',
    dedupeKey: `refund:${r.id}:${outcome}:${r.appealedAt ? 'appeal' : 'first'}`,
    email: {
      id: 'refund-update',
      businessKey: `${r.id}:${outcome}:${r.appealedAt ? 'appeal' : 'first'}`,
      data: {
        name: person?.name.split(/\s+/)[0] ?? 'there',
        courseTitle,
        outcome,
        amountKobo: r.amountKobo.toString(),
        reason,
        url: appUrl(ctx, '/account/refunds'),
        canAppeal: outcome === 'denied' && r.appealedAt === null,
      },
    },
  })
}

/** Ends access and hands the refund to the send job. Inside the caller's transaction. */
async function approveInTx(tx: Ctx, r: RefundRow, by: string | null, reason: string | null) {
  const [item] = await tx.db
    .select()
    .from(orderItems)
    .where(eq(orderItems.id, r.orderItemId))
    .for('update')
  if (!item || item.status === 'refunded' || item.status === 'refund_pending') {
    throw new ConflictError('REFUND_NOT_PENDING')
  }
  await tx.db.update(orderItems).set({ status: 'refund_pending' }).where(eq(orderItems.id, item.id))
  const [updated] = await tx.db
    .update(refundRequests)
    .set({ status: 'approved', decidedBy: by, decidedAt: tx.now, decisionReason: reason })
    .where(eq(refundRequests.id, r.id))
    .returning()
  // Access ends now: the money is coming back (ADR-043).
  await revokeEnrollment(tx, { userId: r.userId, courseId: r.courseId })
  tx.afterCommit(() => tx.cache.invalidate([cacheTags.userEnrollments(r.userId)]))
  await tx.events.emit('refund.approved', { refundId: r.id })
  if (updated)
    await tellLearner(tx, updated, 'Your refund for {course} is approved', 'approved', reason)
}

/** `refunds.request`: the rules decide at once; a decline can be appealed once. */
export async function requestRefund(
  ctx: Ctx,
  input: { orderItemId: string; reasonCode: RefundReason; reasonText?: string | null | undefined },
): Promise<RefundView> {
  const { me, row } = await ownItem(ctx, input.orderItemId)
  const e = await evaluate(ctx, row)
  if (e.code === 'REFUND_ALREADY_REQUESTED' || e.code === 'NOTHING_TO_REFUND') {
    throw new RuleViolationError(e.code)
  }
  const id = await inTransaction(ctx, async (tx) => {
    const status =
      e.decision === 'approve'
        ? 'under_review'
        : e.decision === 'review'
          ? 'under_review'
          : 'denied'
    const [r] = await tx.db
      .insert(refundRequests)
      .values({
        publicId: publicId('RF'),
        orderItemId: row.item.id,
        orderId: row.item.orderId,
        userId: me.userId,
        courseId: row.item.courseId,
        instructorId: row.item.instructorId,
        amountKobo: row.item.netPriceKobo,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText?.trim().slice(0, 1000) || null,
        status,
        decidedAt: e.decision === 'review' ? null : tx.now,
        decisionReason: e.decision === 'deny' ? e.code : null,
        eligibilitySnapshot: { decision: e.decision, code: e.code, details: e.details },
      })
      .onConflictDoNothing({ target: refundRequests.orderItemId })
      .returning()
    if (!r) throw new ConflictError('REFUND_ALREADY_REQUESTED')
    if (e.decision === 'approve') await approveInTx(tx, r, null, null)
    else if (e.decision === 'review') {
      await tellLearner(
        tx,
        r,
        'Your refund request for {course} is with our team',
        'under_review',
        null,
      )
    } else {
      await tellLearner(
        tx,
        r,
        'Your refund request for {course} was declined',
        'denied',
        denialText(e),
      )
    }
    return r.id
  })
  await track(ctx, 'refund_requested', {
    reason_code: input.reasonCode,
    eligible: e.decision !== 'deny',
    decision: e.decision,
  })
  return getRefundView(ctx, id)
}

/** The rule's message in words, for the email and the refunds page. */
function denialText(e: Eligibility): string {
  const d = e.details
  switch (e.code) {
    case 'NO_REFUND_POLICY':
      return 'This course doesn’t offer refunds.'
    case 'REFUND_WINDOW_CLOSED':
      return `The ${d.n}-day refund window ended on ${d.date}.`
    case 'CONTENT_CONSUMED':
      return `Refunds aren’t available after watching 30% of a course. You’ve watched ${d.pct}%.`
    case 'IMPORTANT_RESOURCE_DOWNLOADED':
      return `Refunds aren’t available after downloading ${d.resource}.`
    case 'CERTIFICATE_ISSUED':
      return 'Refunds aren’t available after a certificate is issued.'
    case 'EXAM_STARTED':
      return 'Refunds aren’t available after starting the certification exam.'
    default:
      return 'This purchase can’t be refunded.'
  }
}

/** `refunds.appeal`: once, after a decline. Goes to finance. */
export async function appealRefund(
  ctx: Ctx,
  input: { refundId: string; text: string },
): Promise<RefundView> {
  const me = requireUser(ctx.actor)
  const text = input.text.trim()
  if (text.length < 10 || text.length > 2000) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'text', message: 'Between 10 and 2,000 characters.' }],
    })
  }
  await inTransaction(ctx, async (tx) => {
    const [r] = await tx.db
      .select()
      .from(refundRequests)
      .where(and(eq(refundRequests.publicId, input.refundId), eq(refundRequests.userId, me.userId)))
      .for('update')
    if (!r) throw new NotFoundError('REFUND_NOT_FOUND')
    if (r.appealedAt) throw new RuleViolationError('APPEAL_USED')
    if (r.status !== 'denied') throw new RuleViolationError('APPEAL_NOT_ALLOWED')
    const [updated] = await tx.db
      .update(refundRequests)
      .set({ status: 'under_review', appealText: text, appealedAt: tx.now })
      .where(eq(refundRequests.id, r.id))
      .returning()
    if (updated) {
      await tellLearner(
        tx,
        updated,
        'Your appeal for {course} is with our team',
        'under_review',
        null,
      )
    }
  })
  const [r] = await ctx.db
    .select({ id: refundRequests.id })
    .from(refundRequests)
    .where(eq(refundRequests.publicId, input.refundId))
  return getRefundView(ctx, r?.id ?? '')
}

async function viewsOf(ctx: Ctx, rows: RefundRow[]): Promise<RefundView[]> {
  if (rows.length === 0) return []
  const extra = await ctx.db
    .select({
      id: refundRequests.id,
      orderPublicId: orders.publicId,
      title: courseRevisions.title,
      slug: courses.slug,
    })
    .from(refundRequests)
    .innerJoin(orders, eq(orders.id, refundRequests.orderId))
    .innerJoin(courses, eq(courses.id, refundRequests.courseId))
    .innerJoin(
      courseRevisions,
      eq(courseRevisions.id, sql`coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`),
    )
    .where(
      inArray(
        refundRequests.id,
        rows.map((r) => r.id),
      ),
    )
  const by = new Map(extra.map((x) => [x.id, x]))
  return rows.map((r) => ({
    id: r.id,
    publicId: r.publicId,
    orderPublicId: by.get(r.id)?.orderPublicId ?? '',
    courseTitle: by.get(r.id)?.title ?? '',
    courseSlug: by.get(r.id)?.slug ?? '',
    amountKobo: r.amountKobo,
    reasonCode: r.reasonCode,
    status: r.status,
    decisionReason: r.decisionReason ? readable(r) : null,
    canAppeal: r.status === 'denied' && r.appealedAt === null,
    appealedAt: r.appealedAt,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
  }))
}

/** Rule denials are stored as codes; finance writes words. */
function readable(r: RefundRow): string | null {
  const snap = r.eligibilitySnapshot as { code?: string; details?: Record<string, string> }
  if (r.decisionReason && r.decisionReason === snap.code) {
    return denialText({
      decision: 'deny',
      code: snap.code as never,
      details: snap.details ?? {},
    })
  }
  return r.decisionReason
}

async function getRefundView(ctx: Ctx, id: string): Promise<RefundView> {
  const rows = await ctx.db.select().from(refundRequests).where(eq(refundRequests.id, id))
  const [v] = await viewsOf(ctx, rows)
  if (!v) throw new NotFoundError('REFUND_NOT_FOUND')
  return v
}

/** `refunds.listMine`. */
export async function listMyRefunds(ctx: Ctx): Promise<RefundView[]> {
  const me = requireUser(ctx.actor)
  const rows = await ctx.db
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.userId, me.userId))
    .orderBy(desc(refundRequests.createdAt))
    .limit(100)
  return viewsOf(ctx, rows)
}

// ─── Finance ─────────────────────────────────────────────────────────────────────────────────

export interface RefundReview extends RefundView {
  buyerName: string
  buyerEmail: string
  reasonText: string | null
  appealText: string | null
  eligibility: Record<string, unknown>
  paidAt: Date | null
  refundableUntil: Date | null
  watchedPct: number
  /** Downloads, exam starts and certificates, oldest first. */
  timeline: Array<{ kind: string; label: string | null; at: Date }>
}

/** `/admin/refunds`: under review (new and appeals) by default, oldest first. */
export async function listRefundQueue(
  ctx: Ctx,
  input: { status?: RefundRow['status'] | undefined },
): Promise<RefundView[]> {
  requireStaff(ctx.actor, canDecideRefunds)
  const rows = await ctx.db
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.status, input.status ?? 'under_review'))
    .orderBy(input.status ? desc(refundRequests.createdAt) : asc(refundRequests.createdAt))
    .limit(200)
  return viewsOf(ctx, rows)
}

export async function getRefundForReview(ctx: Ctx, refundId: string): Promise<RefundReview> {
  requireStaff(ctx.actor, canDecideRefunds)
  const [r] = await ctx.db
    .select({ r: refundRequests, name: user.name, email: user.email, paidAt: orders.paidAt })
    .from(refundRequests)
    .innerJoin(user, eq(user.id, refundRequests.userId))
    .innerJoin(orders, eq(orders.id, refundRequests.orderId))
    .where(eq(refundRequests.publicId, refundId))
  if (!r) throw new NotFoundError('REFUND_NOT_FOUND')
  const [[item], events, pct, [view]] = await Promise.all([
    ctx.db.select().from(orderItems).where(eq(orderItems.id, r.r.orderItemId)),
    ctx.db
      .select({
        kind: consumptionEvents.kind,
        at: consumptionEvents.occurredAt,
        label: lessonResources.title,
      })
      .from(consumptionEvents)
      .leftJoin(lessonResources, eq(lessonResources.id, consumptionEvents.refId))
      .where(
        and(
          eq(consumptionEvents.userId, r.r.userId),
          eq(consumptionEvents.courseId, r.r.courseId),
          inArray(consumptionEvents.kind, [
            'resource_download',
            'exam_started',
            'certificate_issued',
          ]),
        ),
      )
      .orderBy(asc(consumptionEvents.occurredAt))
      .limit(100),
    watchedPct(ctx, r.r.userId, r.r.courseId),
    viewsOf(ctx, [r.r]),
  ])
  if (!view) throw new NotFoundError('REFUND_NOT_FOUND')
  return {
    ...view,
    buyerName: r.name,
    buyerEmail: r.email,
    reasonText: r.r.reasonText,
    appealText: r.r.appealText,
    eligibility: r.r.eligibilitySnapshot,
    paidAt: r.paidAt,
    refundableUntil: item?.refundableUntil ?? null,
    watchedPct: Math.round(pct),
    timeline: events.map((e) => ({ kind: e.kind, label: e.label, at: e.at })),
  }
}

/** Finance approves (even against the rules) or declines, with a reason. Audit-logged. */
export async function decideRefund(
  ctx: Ctx,
  input: { refundId: string; approve: boolean; reason: string },
): Promise<RefundView> {
  const staff = requireStaff(ctx.actor, canDecideRefunds)
  const reason = input.reason.trim()
  if (reason.length < 3) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'reason', message: 'Say why, in a sentence the learner will read.' }],
    })
  }
  const id = await inTransaction(ctx, async (tx) => {
    const [r] = await tx.db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.publicId, input.refundId))
      .for('update')
    if (!r) throw new NotFoundError('REFUND_NOT_FOUND')
    if (r.status !== 'under_review') throw new ConflictError('REFUND_NOT_PENDING')
    if (input.approve) {
      await approveInTx(tx, r, staff.userId, reason)
    } else {
      const [updated] = await tx.db
        .update(refundRequests)
        .set({
          status: 'denied',
          decidedBy: staff.userId,
          decidedAt: tx.now,
          decisionReason: reason,
        })
        .where(eq(refundRequests.id, r.id))
        .returning()
      if (updated) {
        await tellLearner(
          tx,
          updated,
          'Your refund request for {course} was declined',
          'denied',
          reason,
        )
      }
    }
    await writeAudit(tx, {
      action: input.approve ? 'refund.approved' : 'refund.denied',
      targetType: 'refund_request',
      targetId: r.id,
      before: { status: r.status },
      after: { reason },
    })
    return r.id
  })
  return getRefundView(ctx, id)
}

// ─── Paystack (jobs) ─────────────────────────────────────────────────────────────────────────

/**
 * `refund-send`: asks Paystack to refund the item. A ₦0 item (should not happen: the rules refuse
 * it) finishes at once. Safe to retry: a request already sent is left alone.
 */
export async function sendRefund(ctx: Ctx, refundId: string): Promise<'sent' | 'skipped'> {
  const [r] = await ctx.db.select().from(refundRequests).where(eq(refundRequests.id, refundId))
  if (!r || r.status !== 'approved') return 'skipped'
  const [order] = await ctx.db
    .select({ reference: orders.providerReference, publicId: orders.publicId })
    .from(orders)
    .where(eq(orders.id, r.orderId))
  if (!order?.reference || r.amountKobo <= 0n) {
    await finishRefund(ctx, r.id)
    return 'sent'
  }
  let sent: { refundId: string }
  try {
    sent = await provider(ctx, 'payments').createRefund({
      reference: order.reference,
      amountKobo: r.amountKobo,
      merchantNote: `Tokslearn refund ${r.publicId} for order ${order.publicId}`,
    })
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new ExternalServiceError('PAYMENT_PROVIDER_UNAVAILABLE', {}, { cause: error })
    }
    throw error
  }
  await ctx.db
    .update(refundRequests)
    .set({ status: 'processing', providerRefundId: sent.refundId, sentAt: ctx.now })
    .where(and(eq(refundRequests.id, r.id), eq(refundRequests.status, 'approved')))
  return 'sent'
}

/**
 * `refund-settle` (webhook) and the hourly check: asks Paystack about each refund still with it
 * for this order (or all of them), never trusting the webhook body. Processed → finished;
 * failed → marked for finance.
 */
export async function settleRefunds(
  ctx: Ctx,
  input: { reference?: string | undefined; olderThanMs?: number | undefined },
): Promise<{ processed: number; failed: number }> {
  const rows = await ctx.db
    .select({ r: refundRequests })
    .from(refundRequests)
    .innerJoin(orders, eq(orders.id, refundRequests.orderId))
    .where(
      and(
        eq(refundRequests.status, 'processing'),
        input.reference ? eq(orders.providerReference, input.reference) : undefined,
        input.olderThanMs
          ? lt(refundRequests.sentAt, new Date(ctx.now.getTime() - input.olderThanMs))
          : undefined,
      ),
    )
    .limit(200)
  let processed = 0
  let failed = 0
  for (const { r } of rows) {
    if (!r.providerRefundId) continue
    const now = await provider(ctx, 'payments').fetchRefund(r.providerRefundId)
    if (now?.status === 'processed') {
      await finishRefund(ctx, r.id)
      processed++
    } else if (now?.status === 'failed') {
      await ctx.db
        .update(refundRequests)
        .set({ status: 'failed', failureReason: 'Paystack could not refund this payment.' })
        .where(and(eq(refundRequests.id, r.id), eq(refundRequests.status, 'processing')))
      log('error', 'refund failed at Paystack', { requestId: ctx.requestId, refund: r.publicId })
      failed++
    }
  }
  return { processed, failed }
}

/** Finance: send a failed refund again. */
export async function retryRefund(ctx: Ctx, refundId: string): Promise<RefundView> {
  requireStaff(ctx.actor, canDecideRefunds)
  const id = await inTransaction(ctx, async (tx) => {
    const [r] = await tx.db
      .update(refundRequests)
      .set({ status: 'approved', providerRefundId: null, failureReason: null })
      .where(and(eq(refundRequests.publicId, refundId), eq(refundRequests.status, 'failed')))
      .returning()
    if (!r) throw new ConflictError('REFUND_NOT_PENDING')
    await tx.events.emit('refund.approved', { refundId: r.id })
    await writeAudit(tx, { action: 'refund.retried', targetType: 'refund_request', targetId: r.id })
    return r.id
  })
  return getRefundView(ctx, id)
}

/**
 * The money is back with the learner: reverse the item's part of the sale (docs/08 §5 "Refund
 * before release"; from `available` or as a receivable if it was already released or paid out),
 * mark the item and order, and tell both sides. Idempotent (the ledger key and the status check).
 */
async function finishRefund(ctx: Ctx, refundId: string): Promise<void> {
  const done = await inTransaction(ctx, async (tx) => {
    const [r] = await tx.db
      .select()
      .from(refundRequests)
      .where(eq(refundRequests.id, refundId))
      .for('update')
    if (!r || r.status === 'processed') return null
    const [item] = await tx.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, r.orderItemId))
      .for('update')
    if (!item) throw new Error('refund without its order item')
    const share = item.instructorShareKobo ?? 0n
    const platform = item.platformShareKobo ?? 0n
    const vat = item.vatKobo ?? 0n
    if (share + platform !== item.netPriceKobo) {
      throw new Error(`refund ${r.publicId}: shares don't add up to the price`)
    }
    if (item.netPriceKobo > 0n) {
      const bucket =
        item.earningStatus === 'pending'
          ? 'pending'
          : item.earningStatus === 'available'
            ? 'available'
            : 'receivable'
      const lines: LedgerLine[] = [
        { account: instructorAccount(item.instructorId, bucket), debit: share },
        { account: P.revenue, debit: platform - vat },
        { account: P.vatPayable, debit: vat },
        { account: P.cashPaystack, credit: item.netPriceKobo },
      ].filter((l) => (l.debit ?? l.credit ?? 0n) > 0n)
      await post(tx, {
        kind: 'refund',
        ref: { type: 'order', id: item.orderId },
        idempotencyKey: `refund:${r.id}`,
        description: `Refund ${r.publicId}`,
        lines,
      })
    }
    await tx.db
      .update(orderItems)
      .set({ status: 'refunded', earningStatus: 'reversed' })
      .where(eq(orderItems.id, item.id))
    const [left] = await tx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(and(eq(orderItems.orderId, item.orderId), sql`${orderItems.status} <> 'refunded'`))
    await tx.db
      .update(orders)
      .set({ status: (left?.n ?? 0) === 0 ? 'refunded' : 'partially_refunded' })
      .where(eq(orders.id, item.orderId))
    const [updated] = await tx.db
      .update(refundRequests)
      .set({ status: 'processed', processedAt: tx.now })
      .where(eq(refundRequests.id, r.id))
      .returning()
    if (updated) {
      await tellLearner(tx, updated, '{course}: your refund is on its way', 'processed', null)
      await notify(tx, {
        userId: r.instructorId,
        type: 'sale.refunded',
        title: `A learner got a ${naira(r.amountKobo)} refund`,
        body: 'Your share of that sale has been taken back.',
        link: '/teach/earnings',
        dedupeKey: `sale.refunded:${r.id}`,
      })
    }
    return r
  })
  if (done) log('info', 'refund processed', { requestId: ctx.requestId, refund: done.publicId })
}

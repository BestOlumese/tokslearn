import { schema } from '@tokslearn/db'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { lastCheckResult, readStatus } from '../admin'
import { isStaff } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { ForbiddenError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { movements, platformAccounts } from '../ledger'

// Platform dashboard for `/admin` (docs/20 §6, ADR-047): money and activity for today, 7 or 30
// days (Lagos), and what needs someone's attention. Business numbers come from our database, not
// PostHog (docs/24).
//
// Foreign reads (docs/03 §3): orders, order_items, refund_requests (commerce), instructor_profiles
// (instructors), lesson_progress (progress), video_assets (media), payout_runs (commerce).

const {
  orders,
  orderItems,
  refundRequests,
  instructorProfiles,
  lessonProgress,
  videoAssets,
  payoutRuns,
} = schema

export type DashboardPeriod = 'today' | '7d' | '30d'
const LAGOS_OFFSET_MS = 60 * 60 * 1000
const DAY = 86_400_000

/** `[from, to)`: today from Lagos midnight, or the last 7/30 days ending now. */
export function periodRange(now: Date, period: DashboardPeriod): { from: Date; to: Date } {
  if (period === 'today') {
    const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS)
    const midnight = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate())
    return { from: new Date(midnight - LAGOS_OFFSET_MS), to: new Date(now.getTime() + 1) }
  }
  const days = period === '7d' ? 7 : 30
  return { from: new Date(now.getTime() - days * DAY), to: new Date(now.getTime() + 1) }
}

export type DashboardAlert =
  | { kind: 'ledger_integrity'; ok: false; at: string; problems: Record<string, number> }
  | { kind: 'ledger_never_checked' }
  | { kind: 'outbox_stuck'; stale: number; failed: number }
  | { kind: 'webhooks_failing'; failed: number; stale: number }
  | { kind: 'video_failures'; count: number }
  | { kind: 'refunds_waiting'; count: number }
  | { kind: 'payout_run_waiting'; runId: string; label: string }
  | { kind: 'payout_run_failed'; runId: string; label: string }

export interface PlatformDashboard {
  period: DashboardPeriod
  from: Date
  orders: number
  gmvKobo: bigint
  /** Commission and fee recoveries less what refunds took back. */
  revenueKobo: bigint
  refunds: number
  refundedKobo: bigint
  /** Refunded items per 100 items sold in the period. */
  refundRatePct: number
  failedPayments: number
  newInstructors: number
  activeLearners: number
  alerts: DashboardAlert[]
}

/** `admin.dashboard`: any staff member; alerts are what needs someone's attention now. */
export async function platformDashboard(
  ctx: Ctx,
  input: { period: DashboardPeriod },
): Promise<PlatformDashboard> {
  const me = requireUser(ctx.actor)
  if (!isStaff(me)) throw new ForbiddenError('STAFF_ONLY')
  const { from, to } = periodRange(ctx.now, input.period)
  const paidStatuses = ['paid', 'partially_refunded', 'refunded'] as const
  const inPeriod = (col: PgColumn) => and(gte(col, from), lt(col, to))

  const [
    [sales],
    [items],
    [refunds],
    [failed],
    [instructors],
    [learners],
    revenueMoves,
    [videos],
    [waiting],
    runs,
    status,
    integrity,
  ] = await Promise.all([
    ctx.db
      .select({
        n: sql<number>`count(*)::int`,
        gmv: sql<string>`coalesce(sum(${orders.totalKobo}), 0)::text`,
      })
      .from(orders)
      .where(and(inArray(orders.status, [...paidStatuses]), inPeriod(orders.paidAt))),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(inArray(orders.status, [...paidStatuses]), inPeriod(orders.paidAt))),
    ctx.db
      .select({
        n: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${refundRequests.amountKobo}), 0)::text`,
      })
      .from(refundRequests)
      .where(and(eq(refundRequests.status, 'processed'), inPeriod(refundRequests.processedAt))),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(eq(orders.status, 'failed'), gte(orders.createdAt, from), lt(orders.createdAt, to)),
      ),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(instructorProfiles)
      .where(and(gte(instructorProfiles.approvedAt, from), lt(instructorProfiles.approvedAt, to))),
    ctx.db
      .select({ n: sql<number>`count(distinct ${lessonProgress.userId})::int` })
      .from(lessonProgress)
      .where(and(gte(lessonProgress.updatedAt, from), lt(lessonProgress.updatedAt, to))),
    movements(ctx, { codes: [platformAccounts.revenue], from, to }),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(videoAssets)
      .where(
        and(
          eq(videoAssets.status, 'failed'),
          gte(videoAssets.updatedAt, new Date(ctx.now.getTime() - 7 * DAY)),
        ),
      ),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(refundRequests)
      .where(eq(refundRequests.status, 'under_review')),
    ctx.db
      .select({
        publicId: payoutRuns.publicId,
        month: payoutRuns.month,
        status: payoutRuns.status,
        approvedAt: payoutRuns.approvedAt,
      })
      .from(payoutRuns)
      .where(inArray(payoutRuns.status, ['draft', 'partially_failed'])),
    readStatus(ctx),
    lastCheckResult(ctx, 'ledger_integrity'),
  ])

  const revenue = revenueMoves.reduce((t, m) => t + m.credit - m.debit, 0n)
  const label = (month: string) =>
    new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${month}-01T00:00:00Z`),
    )
  const alerts: DashboardAlert[] = []
  if (!integrity) alerts.push({ kind: 'ledger_never_checked' })
  else if (!integrity.ok) {
    alerts.push({
      kind: 'ledger_integrity',
      ok: false,
      at: integrity.at,
      problems: integrity.problems,
    })
  }
  if (status.outbox.stale + status.outbox.failed > 0) {
    alerts.push({ kind: 'outbox_stuck', stale: status.outbox.stale, failed: status.outbox.failed })
  }
  if (status.webhooks.failed + status.webhooks.stale > 0) {
    alerts.push({ kind: 'webhooks_failing', ...status.webhooks })
  }
  if ((videos?.n ?? 0) > 0) alerts.push({ kind: 'video_failures', count: videos?.n ?? 0 })
  if ((waiting?.n ?? 0) > 0) alerts.push({ kind: 'refunds_waiting', count: waiting?.n ?? 0 })
  for (const r of runs) {
    if (r.status === 'partially_failed') {
      alerts.push({ kind: 'payout_run_failed', runId: r.publicId, label: label(r.month) })
    } else if (r.status === 'draft') {
      alerts.push({ kind: 'payout_run_waiting', runId: r.publicId, label: label(r.month) })
    }
  }
  const sold = items?.n ?? 0
  return {
    period: input.period,
    from,
    orders: sales?.n ?? 0,
    gmvKobo: BigInt(sales?.gmv ?? '0'),
    revenueKobo: revenue,
    refunds: refunds?.n ?? 0,
    refundedKobo: BigInt(refunds?.amount ?? '0'),
    refundRatePct: sold === 0 ? 0 : Math.round(((refunds?.n ?? 0) / sold) * 1000) / 10,
    failedPayments: failed?.n ?? 0,
    newInstructors: instructors?.n ?? 0,
    activeLearners: learners?.n ?? 0,
    alerts,
  }
}

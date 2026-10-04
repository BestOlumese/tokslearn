import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, gt, inArray, isNotNull, lt, lte, or, sql } from 'drizzle-orm'
import { getSetting } from '../admin'
import { hasRole, type UserActor } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { splitBps } from '../kernel/money'
import { balances, instructorAccount, movements, post } from '../ledger'
import { getFiles, privateFileUrl, storeGeneratedFile } from '../media'
import { notify } from '../notifications'

// Instructor earnings (docs/08 §8–9, docs/20 `/teach/earnings`, ADR-044): the daily release of
// pending earnings, the balances page, per-sale lines and CSV, and monthly statements.
// Foreign reads (docs/03 §3): courses, course_revisions, payout_accounts, kyc_checks, user.

const {
  orders,
  orderItems,
  courses,
  courseRevisions,
  payoutAccounts,
  kycChecks,
  user,
  earningStatements,
} = schema

const RELEASE_BATCH = 500
const LAGOS_OFFSET_MS = 60 * 60 * 1000

const titleJoin = eq(
  courseRevisions.id,
  sql`coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`,
)

/** Kobo → "₦15,000" or "−₦1,234.50", in integers only. */
export const naira = (kobo: bigint) => {
  const abs = kobo < 0n ? -kobo : kobo
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const k = abs % 100n
  return `${kobo < 0n ? '−' : ''}₦${whole}${k === 0n ? '' : `.${k.toString().padStart(2, '0')}`}`
}

// ─── Daily release (docs/08 §8) ──────────────────────────────────────────────────────────────

/**
 * `earnings-release`: one batch of purchases whose refund window has closed, oldest first. Each
 * moves the instructor's share from pending to available (the same ledger key as an early
 * release, so nothing moves twice). Items with a refund in flight are `refund_pending` and stay.
 */
export async function releaseEarnings(ctx: Ctx): Promise<{ released: number; done: boolean }> {
  const due = await ctx.db
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.earningStatus, 'pending'),
        eq(orderItems.status, 'active'),
        lte(orderItems.refundableUntil, ctx.now),
        inArray(orders.status, ['paid', 'partially_refunded']),
      ),
    )
    .orderBy(asc(orderItems.refundableUntil))
    .limit(RELEASE_BATCH)
  let released = 0
  for (const { id } of due) {
    const moved = await inTransaction(ctx, async (tx) => {
      const [item] = await tx.db
        .select({ item: orderItems, publicId: orders.publicId })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(eq(orderItems.id, id))
        .for('update', { of: orderItems })
      if (item?.item.earningStatus !== 'pending' || item.item.status !== 'active') {
        return false
      }
      const share = item.item.instructorShareKobo ?? 0n
      if (share > 0n) {
        await post(tx, {
          kind: 'release',
          ref: { type: 'order', id: item.item.orderId },
          idempotencyKey: `release:item:${item.item.id}`,
          description: `Order ${item.publicId}: refund window closed`,
          lines: [
            { account: instructorAccount(item.item.instructorId, 'pending'), debit: share },
            { account: instructorAccount(item.item.instructorId, 'available'), credit: share },
          ],
        })
      }
      await tx.db
        .update(orderItems)
        .set({ earningStatus: 'available' })
        .where(eq(orderItems.id, item.item.id))
      return true
    })
    if (moved) released++
  }
  return { released, done: due.length < RELEASE_BATCH }
}

// ─── The earnings page ───────────────────────────────────────────────────────────────────────

const lagosDay = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10)

/**
 * The next payout day (ADR-019): the `payout_day` of this month if it hasn't passed, else next
 * month's; moved to the next working day past weekends and the `public_holidays` setting.
 */
export function nextPayoutDate(now: Date, payoutDay: number, holidays: ReadonlySet<string>): Date {
  const lagosNow = new Date(now.getTime() + LAGOS_OFFSET_MS)
  let y = lagosNow.getUTCFullYear()
  let m = lagosNow.getUTCMonth()
  const working = (d: Date) => {
    const day = d.getUTCDay()
    return day !== 0 && day !== 6 && !holidays.has(d.toISOString().slice(0, 10))
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const d = new Date(Date.UTC(y, m, payoutDay))
    while (!working(d)) d.setUTCDate(d.getUTCDate() + 1)
    if (d.toISOString().slice(0, 10) >= lagosDay(now)) {
      // 09:00 Lagos on that day.
      return new Date(d.getTime() + 8 * 60 * 60 * 1000)
    }
    m++
    if (m > 11) {
      m = 0
      y++
    }
  }
  throw new Error('no payout date found')
}

export type PayoutProblem =
  | 'no_payout_account'
  | 'payout_account_in_review'
  | 'payout_account_on_hold'
  | 'kyc_not_verified'
  | 'two_factor_off'

export interface EarningsSummary {
  pendingKobo: bigint
  availableKobo: bigint
  inTransitKobo: bigint
  /** Owed back from refunds after a payout; netted against the next payout. */
  receivableKobo: bigint
  paidThisYearKobo: bigint
  /** The next releases: day and amount, soonest first (up to 5). */
  upcomingReleases: Array<{ on: Date; amountKobo: bigint }>
  nextPayoutOn: Date
  minPayoutKobo: bigint
  payoutAccount: { bankName: string; last4: string; allowedFrom: Date } | null
  /** What stops a payout today, in order of what to fix first. */
  problems: PayoutProblem[]
}

const canSeeEarnings = (a: UserActor) => hasRole(a, 'instructor', 'finance', 'admin', 'super_admin')

/** `earnings.summary`: the instructor's balances and what's next. */
export async function earningsSummary(ctx: Ctx): Promise<EarningsSummary> {
  const me = requireUser(ctx.actor)
  if (!canSeeEarnings(me)) throw new ForbiddenError('INSTRUCTOR_REQUIRED')
  const codes = (['pending', 'available', 'in_transit', 'receivable'] as const).map((b) =>
    instructorAccount(me.userId, b),
  )
  const yearStart = new Date(
    Date.UTC(new Date(ctx.now.getTime() + LAGOS_OFFSET_MS).getUTCFullYear(), 0, 1) -
      LAGOS_OFFSET_MS,
  )
  const num = (v: unknown) => Number(v)
  const [bal, moves, upcoming, accounts, [kyc], [person], day, min, holidays] = await Promise.all([
    balances(ctx, codes),
    movements(ctx, {
      codes: [instructorAccount(me.userId, 'in_transit')],
      from: yearStart,
      // Inclusive of this moment: a payout settled just now counts.
      to: new Date(ctx.now.getTime() + 1),
    }),
    ctx.db
      .select({
        on: sql<string>`date(${orderItems.refundableUntil} at time zone 'Africa/Lagos')::text`,
        amount: sql<string>`sum(${orderItems.instructorShareKobo})::text`,
      })
      .from(orderItems)
      .where(
        and(
          eq(orderItems.instructorId, me.userId),
          eq(orderItems.earningStatus, 'pending'),
          eq(orderItems.status, 'active'),
          gt(orderItems.refundableUntil, ctx.now),
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`1`)
      .limit(5),
    ctx.db
      .select()
      .from(payoutAccounts)
      .where(
        and(
          eq(payoutAccounts.userId, me.userId),
          inArray(payoutAccounts.status, ['active', 'pending_review']),
        ),
      ),
    ctx.db
      .select({ status: kycChecks.status })
      .from(kycChecks)
      .where(eq(kycChecks.userId, me.userId))
      .orderBy(desc(kycChecks.createdAt))
      .limit(1),
    ctx.db.select({ twoFactor: user.twoFactorEnabled }).from(user).where(eq(user.id, me.userId)),
    getSetting(ctx, 'payout_day', num),
    getSetting(ctx, 'min_payout_kobo', (v) => BigInt(String(v))),
    getSetting(ctx, 'public_holidays', (v) => (Array.isArray(v) ? v.map(String) : [])),
  ])
  const account = accounts.find((a) => a.status === 'active')
  const problems: PayoutProblem[] = []
  if (!account) {
    problems.push(accounts.length > 0 ? 'payout_account_in_review' : 'no_payout_account')
  } else if (account.payoutsAllowedFrom > ctx.now) problems.push('payout_account_on_hold')
  if (kyc?.status !== 'verified') problems.push('kyc_not_verified')
  if (!person?.twoFactor) problems.push('two_factor_off')
  const get = (b: string) => bal.get(instructorAccount(me.userId, b as never)) ?? 0n
  return {
    pendingKobo: get('pending'),
    availableKobo: get('available'),
    inTransitKobo: get('in_transit'),
    receivableKobo: get('receivable'),
    // Money leaves in_transit for the bank with a `payout` entry; failures are `payout_reversal`.
    paidThisYearKobo: moves
      .filter((m) => m.kind === 'payout')
      .reduce((sum, m) => sum + m.debit, 0n),
    upcomingReleases: upcoming.map((u) => ({
      on: new Date(`${u.on}T00:00:00+01:00`),
      amountKobo: BigInt(u.amount),
    })),
    nextPayoutOn: nextPayoutDate(ctx.now, day ?? 5, new Set(holidays ?? [])),
    minPayoutKobo: min ?? 500_000n,
    payoutAccount: account
      ? {
          bankName: account.bankName,
          last4: account.accountNumberLast4,
          allowedFrom: account.payoutsAllowedFrom,
        }
      : null,
    problems,
  }
}

export type EarningLineStatus = 'pending' | 'available' | 'paid' | 'refunded' | 'refund_pending'

export interface EarningLine {
  orderItemId: string
  orderPublicId: string
  paidAt: Date
  courseTitle: string
  /** What the learner paid for this course. */
  pricePaidKobo: bigint
  /** Tokslearn's commission and the payment fee, together. */
  deductionsKobo: bigint
  /** The instructor's part of the payment fee (the rest is the platform's). */
  paymentFeeKobo: bigint
  shareKobo: bigint
  source: string
  status: EarningLineStatus
  /** When a pending share is released (refund window end). */
  releasesOn: Date | null
}

const lineStatus = (i: typeof orderItems.$inferSelect): EarningLineStatus =>
  i.status === 'refunded'
    ? 'refunded'
    : i.status === 'refund_pending'
      ? 'refund_pending'
      : i.earningStatus === 'paid'
        ? 'paid'
        : i.earningStatus === 'available'
          ? 'available'
          : 'pending'

/** `earnings.lines`: one line per course sold, newest first; `before` pages by order item id. */
export async function earningLines(
  ctx: Ctx,
  input: {
    status?: EarningLineStatus | undefined
    from?: Date | undefined
    to?: Date | undefined
    before?: string | undefined
    limit?: number | undefined
  },
): Promise<{ items: EarningLine[]; hasMore: boolean }> {
  const me = requireUser(ctx.actor)
  if (!canSeeEarnings(me)) throw new ForbiddenError('INSTRUCTOR_REQUIRED')
  const limit = Math.min(input.limit ?? 50, 5000)
  let cursor: { paidAt: Date; id: string } | null = null
  if (input.before) {
    const [c] = await ctx.db
      .select({ paidAt: orders.paidAt, id: orderItems.id })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.id, input.before), eq(orderItems.instructorId, me.userId)))
    if (!c?.paidAt) throw new NotFoundError('ORDER_NOT_FOUND')
    cursor = { paidAt: c.paidAt, id: c.id }
  }
  const statusFilter =
    input.status === 'refunded'
      ? eq(orderItems.status, 'refunded')
      : input.status === 'refund_pending'
        ? eq(orderItems.status, 'refund_pending')
        : input.status
          ? and(
              inArray(orderItems.status, ['active', 'non_refundable']),
              eq(orderItems.earningStatus, input.status),
            )
          : undefined
  const rows = await ctx.db
    .select({
      item: orderItems,
      publicId: orders.publicId,
      paidAt: orders.paidAt,
      title: courseRevisions.title,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(courses, eq(courses.id, orderItems.courseId))
    .innerJoin(courseRevisions, titleJoin)
    .where(
      and(
        eq(orderItems.instructorId, me.userId),
        isNotNull(orders.paidAt),
        gt(orderItems.netPriceKobo, 0n),
        statusFilter,
        input.from ? sql`${orders.paidAt} >= ${input.from}` : undefined,
        input.to ? lt(orders.paidAt, input.to) : undefined,
        cursor
          ? or(
              lt(orders.paidAt, cursor.paidAt),
              and(eq(orders.paidAt, cursor.paidAt), lt(orderItems.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(orders.paidAt), desc(orderItems.id))
    .limit(limit + 1)
  return {
    hasMore: rows.length > limit,
    items: rows.slice(0, limit).map((r) => {
      const share = r.item.instructorShareKobo ?? 0n
      const status = lineStatus(r.item)
      return {
        orderItemId: r.item.id,
        orderPublicId: r.publicId,
        paidAt: r.paidAt ?? r.item.createdAt,
        courseTitle: r.title,
        pricePaidKobo: r.item.netPriceKobo,
        deductionsKobo: r.item.netPriceKobo - share,
        paymentFeeKobo:
          r.item.netPriceKobo -
          splitBps(r.item.netPriceKobo, BigInt(r.item.platformRateBps))[0] -
          share,
        shareKobo: share,
        source: r.item.attributionSource,
        status,
        releasesOn: status === 'pending' ? r.item.refundableUntil : null,
      }
    }),
  }
}

const csvSource: Record<string, string> = {
  instructor_referral: 'Your referral link',
  instructor_coupon: 'Your coupon',
  platform_organic: 'Found on Tokslearn',
  platform_paid: 'Tokslearn ads',
}
const csvStatus: Record<EarningLineStatus, string> = {
  pending: 'Pending',
  available: 'Available',
  paid: 'Paid out',
  refunded: 'Refunded',
  refund_pending: 'Refund requested',
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
const csvKobo = (k: bigint) => {
  const abs = k < 0n ? -k : k
  return `${k < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`
}

/** `earnings.exportCsv`: every line in a period (default: this year), for a spreadsheet. */
export async function earningsCsv(
  ctx: Ctx,
  input: { from?: Date | undefined; to?: Date | undefined },
): Promise<{ filename: string; csv: string }> {
  const { items } = await earningLines(ctx, { from: input.from, to: input.to, limit: 5000 })
  const head = [
    'Date (Lagos)',
    'Order',
    'Course',
    'Paid by learner (NGN)',
    'Commission and fees (NGN)',
    'Of which your part of the payment fee (NGN)',
    'Your share (NGN)',
    'Source',
    'Status',
  ]
  const rows = items.map((i) =>
    [
      lagosDay(i.paidAt),
      i.orderPublicId,
      i.courseTitle,
      csvKobo(i.pricePaidKobo),
      csvKobo(i.deductionsKobo),
      csvKobo(i.paymentFeeKobo),
      csvKobo(i.shareKobo),
      csvSource[i.source] ?? i.source,
      csvStatus[i.status],
    ]
      .map(csvCell)
      .join(','),
  )
  return {
    filename: `tokslearn-earnings-${lagosDay(ctx.now)}.csv`,
    csv: [head.join(','), ...rows].join('\n'),
  }
}

// ─── Monthly statements ──────────────────────────────────────────────────────────────────────

export interface StatementTotals {
  sales: number
  refunds: number
  grossKobo: string
  shareEarnedKobo: string
  refundedShareKobo: string
  releasedKobo: string
  paidOutKobo: string
  closingPendingKobo: string
  closingAvailableKobo: string
}

/** `[start, end)` of a Lagos calendar month, `YYYY-MM`. */
export function monthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) throw new Error(`bad month ${month}`)
  return {
    from: new Date(Date.UTC(y, m - 1, 1) - LAGOS_OFFSET_MS),
    to: new Date(Date.UTC(y, m, 1) - LAGOS_OFFSET_MS),
  }
}

/** The Lagos month before `now`, `YYYY-MM`. */
export function previousMonth(now: Date): string {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS)
  const d = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth() - 1, 1))
  return d.toISOString().slice(0, 7)
}

export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  )

/** Instructors with ledger or sales activity in the month (the statements job's list). */
export async function instructorsWithActivity(ctx: Ctx, month: string): Promise<string[]> {
  const { from, to } = monthRange(month)
  const rows = await ctx.db
    .selectDistinct({ id: orderItems.instructorId })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        isNotNull(orders.paidAt),
        gt(orderItems.netPriceKobo, 0n),
        or(
          and(sql`${orders.paidAt} >= ${from}`, lt(orders.paidAt, to)),
          and(sql`${orderItems.updatedAt} >= ${from}`, lt(orderItems.updatedAt, to)),
        ),
      ),
    )
  return rows.map((r) => r.id)
}

/**
 * The statements job: one instructor's month. Sales and refunds come from order items, releases
 * and payouts from the ledger. Writes the PDF once (a re-run returns the existing row).
 */
export async function generateStatement(
  ctx: Ctx,
  input: { instructorId: string; month: string },
): Promise<{ created: boolean }> {
  const [existing] = await ctx.db
    .select({ id: earningStatements.id })
    .from(earningStatements)
    .where(
      and(
        eq(earningStatements.instructorId, input.instructorId),
        eq(earningStatements.month, input.month),
      ),
    )
  if (existing) return { created: false }
  const { from, to } = monthRange(input.month)
  const id = input.instructorId
  const [sold, refunded, moves, bal, [person]] = await Promise.all([
    ctx.db
      .select({
        title: courseRevisions.title,
        n: sql<number>`count(*)::int`,
        gross: sql<string>`sum(${orderItems.netPriceKobo})::text`,
        share: sql<string>`sum(${orderItems.instructorShareKobo})::text`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(courses, eq(courses.id, orderItems.courseId))
      .innerJoin(courseRevisions, titleJoin)
      .where(
        and(
          eq(orderItems.instructorId, id),
          gt(orderItems.netPriceKobo, 0n),
          sql`${orders.paidAt} >= ${from}`,
          lt(orders.paidAt, to),
        ),
      )
      .groupBy(courseRevisions.title),
    ctx.db
      .select({
        title: courseRevisions.title,
        n: sql<number>`count(*)::int`,
        share: sql<string>`sum(${orderItems.instructorShareKobo})::text`,
      })
      .from(schema.refundRequests)
      .innerJoin(orderItems, eq(orderItems.id, schema.refundRequests.orderItemId))
      .innerJoin(courses, eq(courses.id, orderItems.courseId))
      .innerJoin(courseRevisions, titleJoin)
      .where(
        and(
          eq(orderItems.instructorId, id),
          eq(schema.refundRequests.status, 'processed'),
          sql`${schema.refundRequests.processedAt} >= ${from}`,
          lt(schema.refundRequests.processedAt, to),
        ),
      )
      .groupBy(courseRevisions.title),
    movements(ctx, {
      codes: [
        instructorAccount(id, 'pending'),
        instructorAccount(id, 'available'),
        instructorAccount(id, 'in_transit'),
      ],
      from,
      to,
    }),
    balances(ctx, [instructorAccount(id, 'pending'), instructorAccount(id, 'available')]),
    ctx.db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, id)),
  ])
  const sum = (xs: Array<{ share?: string; gross?: string }>, k: 'share' | 'gross') =>
    xs.reduce((s, x) => s + BigInt(x[k] ?? '0'), 0n)
  const released = moves
    .filter((m) => m.code === instructorAccount(id, 'available') && m.kind === 'release')
    .reduce((s, m) => s + m.credit, 0n)
  const paidOut = moves
    .filter((m) => m.code === instructorAccount(id, 'in_transit') && m.kind === 'payout')
    .reduce((s, m) => s + m.debit, 0n)
  const totals: StatementTotals = {
    sales: sold.reduce((s, x) => s + x.n, 0),
    refunds: refunded.reduce((s, x) => s + x.n, 0),
    grossKobo: sum(sold, 'gross').toString(),
    shareEarnedKobo: sum(sold, 'share').toString(),
    refundedShareKobo: sum(refunded, 'share').toString(),
    releasedKobo: released.toString(),
    paidOutKobo: paidOut.toString(),
    closingPendingKobo: (bal.get(instructorAccount(id, 'pending')) ?? 0n).toString(),
    closingAvailableKobo: (bal.get(instructorAccount(id, 'available')) ?? 0n).toString(),
  }
  const titles = new Set([...sold.map((s) => s.title), ...refunded.map((r) => r.title)])
  const label = monthLabel(input.month)
  const k = (v: string) => naira(BigInt(v))
  const bytes = await provider(ctx, 'statementPdf').render({
    instructorName: person?.name ?? 'Instructor',
    monthLabel: label,
    period: `${label}, Lagos time`,
    summary: [
      { label: 'Courses sold', value: String(totals.sales) },
      { label: 'Paid by learners', value: k(totals.grossKobo) },
      { label: 'Your share of those sales', value: k(totals.shareEarnedKobo), strong: true },
      { label: `Refunds (${totals.refunds})`, value: `−${k(totals.refundedShareKobo)}` },
      { label: 'Released to your available balance', value: k(totals.releasedKobo) },
      { label: 'Paid out to your bank', value: k(totals.paidOutKobo) },
      { label: 'Still pending at month end', value: k(totals.closingPendingKobo) },
      { label: 'Available at month end', value: k(totals.closingAvailableKobo), strong: true },
    ],
    courses: [...titles].sort().map((title) => {
      const s = sold.find((x) => x.title === title)
      const r = refunded.find((x) => x.title === title)
      return {
        title,
        sales: s?.n ?? 0,
        refunds: r?.n ?? 0,
        gross: naira(BigInt(s?.gross ?? '0')),
        share: naira(BigInt(s?.share ?? '0') - BigInt(r?.share ?? '0')),
      }
    }),
    generatedAt: ctx.now,
  })
  const file = await storeGeneratedFile(ctx, {
    ownerId: id,
    purpose: 'statement',
    bytes,
    mime: 'application/pdf',
    originalName: `Tokslearn statement ${input.month}.pdf`,
  })
  const created = await inTransaction(ctx, async (tx) => {
    const [row] = await tx.db
      .insert(earningStatements)
      .values({
        instructorId: id,
        month: input.month,
        fileId: file.id,
        totals: totals as unknown as Record<string, string | number>,
        emailedAt: tx.now,
      })
      .onConflictDoNothing()
      .returning({ id: earningStatements.id })
    if (!row) return false
    await notify(tx, {
      userId: id,
      type: 'earnings.statement',
      title: `Your ${label} statement is ready`,
      body: `Your share: ${k(totals.shareEarnedKobo)}. Available at month end: ${k(totals.closingAvailableKobo)}.`,
      link: '/teach/earnings',
      dedupeKey: `statement:${input.month}`,
      email: {
        id: 'monthly-statement',
        businessKey: `${id}:${input.month}`,
        data: {
          name: (person?.name ?? '').split(/\s+/)[0] || 'there',
          monthLabel: label,
          sales: totals.sales,
          shareKobo: totals.shareEarnedKobo,
          refundedKobo: totals.refundedShareKobo,
          paidOutKobo: totals.paidOutKobo,
          availableKobo: totals.closingAvailableKobo,
          url: `${provider(tx, 'urls').app.replace(/\/$/, '')}/teach/earnings`,
        },
      },
    })
    return true
  })
  return { created }
}

export interface StatementView {
  month: string
  label: string
  totals: StatementTotals
  createdAt: Date
}

/** `earnings.statements`: the instructor's monthly statements, newest first. */
export async function listStatements(ctx: Ctx): Promise<StatementView[]> {
  const me = requireUser(ctx.actor)
  const rows = await ctx.db
    .select()
    .from(earningStatements)
    .where(eq(earningStatements.instructorId, me.userId))
    .orderBy(desc(earningStatements.month))
    .limit(60)
  return rows.map((r) => ({
    month: r.month,
    label: monthLabel(r.month),
    totals: r.totals as unknown as StatementTotals,
    createdAt: r.createdAt,
  }))
}

/** A short-lived link to one statement PDF (the owner only). */
export async function statementDownloadUrl(ctx: Ctx, month: string): Promise<string> {
  const me = requireUser(ctx.actor)
  const [row] = await ctx.db
    .select({ fileId: earningStatements.fileId })
    .from(earningStatements)
    .where(and(eq(earningStatements.instructorId, me.userId), eq(earningStatements.month, month)))
  const file = row?.fileId ? (await getFiles(ctx, [row.fileId])).get(row.fileId) : undefined
  if (!file) throw new NotFoundError('FILE_NOT_FOUND')
  return privateFileUrl(ctx, file, `Tokslearn statement ${month}.pdf`)
}

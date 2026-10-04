import { schema } from '@tokslearn/db'
import { ProviderError, transferFeeKobo } from '@tokslearn/integrations/paystack'
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'
import { getSetting, writeAudit } from '../admin'
import { hasRecentStepUp, hasRole, type UserActor } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireStaff, requireUser } from '../kernel/guards'
import { log } from '../kernel/logger'
import {
  balances,
  instructorAccount,
  instructorBalancesAtLeast,
  platformAccounts as P,
  post,
} from '../ledger'
import { notify, sendEmail } from '../notifications'
import { monthLabel, naira, nextPayoutDate } from './earnings'

// Monthly payout runs (docs/08 §9, ADR-046). Draft on the 1st → finance approves (2FA; a super
// admin co-signs runs over the threshold) → from the pay day, each item moves available →
// in_transit and goes out as a Paystack bulk transfer → webhooks (and an hourly check) settle it.
// Ledger keys carry the item and attempt, so a retried job never posts twice.
//
// Foreign reads (docs/03 §3): payout_accounts, kyc_checks, user, user_roles.

const { payoutRuns, payoutItems, payoutAccounts, kycChecks, user, userRoles, orderItems, orders } =
  schema

type Run = typeof payoutRuns.$inferSelect
type Item = typeof payoutItems.$inferSelect
export type PayoutHoldReason = NonNullable<Item['holdReason']>
export type PayoutItemStatus = Item['status']
export type PayoutRunStatus = Run['status']

const LAGOS_OFFSET_MS = 60 * 60 * 1000
const BATCH = 100
const DEFAULT_COSIGN_KOBO = 500_000_000n

const canRunPayouts = (a: UserActor) => hasRole(a, 'finance', 'admin', 'super_admin')
const lagosMonth = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 7)
/** Our transfer reference: the item id without dashes plus the attempt (Paystack wants ≥ 16). */
const referenceFor = (itemId: string, attempt: number) =>
  `tlpo${itemId.replaceAll('-', '')}${attempt}`

/** Staff guard for payout actions that move money: role, 2FA on and used in the last 12 h. */
function requirePayoutSigner(ctx: Ctx): UserActor {
  const staff = requireStaff(ctx.actor, canRunPayouts)
  if (!hasRecentStepUp(staff, ctx.now)) throw new ForbiddenError('STEP_UP_REQUIRED')
  return staff
}

async function settings(ctx: Ctx) {
  const [day, min, holidays, cosign] = await Promise.all([
    getSetting(ctx, 'payout_day', Number),
    getSetting(ctx, 'min_payout_kobo', (v) => BigInt(String(v))),
    getSetting(ctx, 'public_holidays', (v) => (Array.isArray(v) ? v.map(String) : [])),
    getSetting(ctx, 'payout_cosign_threshold_kobo', (v) => BigInt(String(v))),
  ])
  return {
    payoutDay: day ?? 5,
    minKobo: min ?? 500_000n,
    holidays: new Set(holidays ?? []),
    cosignKobo: cosign ?? DEFAULT_COSIGN_KOBO,
  }
}

// ─── Eligibility ─────────────────────────────────────────────────────────────────────────────

interface Payee {
  instructorId: string
  availableKobo: bigint
  receivableKobo: bigint
  account: typeof payoutAccounts.$inferSelect | null
  holdReason: PayoutHoldReason | null
}

/**
 * Who can be paid, and why not. `at` is when the money would leave: a 72-hour hold that ends
 * before the pay day doesn't block the draft.
 */
async function payees(
  ctx: Ctx,
  instructorIds: ReadonlyArray<string>,
  at: Date,
  minKobo: bigint,
): Promise<Map<string, Payee>> {
  const out = new Map<string, Payee>()
  if (instructorIds.length === 0) return out
  const ids = [...instructorIds]
  const [bal, accounts, kyc, people] = await Promise.all([
    balances(ctx, [
      ...ids.map((id) => instructorAccount(id, 'available')),
      ...ids.map((id) => instructorAccount(id, 'receivable')),
    ]),
    ctx.db
      .select()
      .from(payoutAccounts)
      .where(
        and(
          inArray(payoutAccounts.userId, ids),
          inArray(payoutAccounts.status, ['active', 'pending_review']),
        ),
      ),
    ctx.db
      .selectDistinctOn([kycChecks.userId], { userId: kycChecks.userId, status: kycChecks.status })
      .from(kycChecks)
      .where(inArray(kycChecks.userId, ids))
      .orderBy(kycChecks.userId, desc(kycChecks.createdAt)),
    ctx.db
      .select({ id: user.id, twoFactor: user.twoFactorEnabled, banned: user.banned })
      .from(user)
      .where(inArray(user.id, ids)),
  ])
  for (const id of ids) {
    const available = bal.get(instructorAccount(id, 'available')) ?? 0n
    const receivable = bal.get(instructorAccount(id, 'receivable')) ?? 0n
    const mine = accounts.filter((a) => a.userId === id)
    const active = mine.find((a) => a.status === 'active') ?? null
    const person = people.find((p) => p.id === id)
    const kycStatus = kyc.find((k) => k.userId === id)?.status
    const holdReason: PayoutHoldReason | null = person?.banned
      ? 'suspended'
      : !active
        ? mine.length > 0
          ? 'payout_account_in_review'
          : 'no_payout_account'
        : active.payoutsAllowedFrom > at
          ? 'payout_account_on_hold'
          : kycStatus !== 'verified'
            ? 'kyc_not_verified'
            : !person?.twoFactor
              ? 'two_factor_off'
              : available - receivable < minKobo
                ? 'below_minimum'
                : null
    out.set(id, {
      instructorId: id,
      availableKobo: available,
      receivableKobo: receivable,
      account: active ?? mine[0] ?? null,
      holdReason,
    })
  }
  return out
}

// ─── Draft ───────────────────────────────────────────────────────────────────────────────────

export interface DraftResult {
  runId: string
  publicId: string
  created: boolean
}

/**
 * The draft for a month (default: this Lagos month). The 1st-of-month job calls it; finance can
 * call it to build this month's draft early or rebuild a draft nobody has approved yet (finance
 * holds carry over). A run that's approved can't be rebuilt.
 */
export async function draftPayoutRun(
  ctx: Ctx,
  input: { month?: string | undefined } = {},
): Promise<DraftResult> {
  const staff = ctx.actor.kind === 'user' ? requireStaff(ctx.actor, canRunPayouts) : null
  const month = input.month ?? lagosMonth(ctx.now)
  const s = await settings(ctx)
  const monthStart = new Date(Date.parse(`${month}-01T00:00:00Z`) - LAGOS_OFFSET_MS)
  const payOn = nextPayoutDate(monthStart, s.payoutDay, s.holidays)

  const [existing] = await ctx.db.select().from(payoutRuns).where(eq(payoutRuns.month, month))
  if (existing && (existing.status !== 'draft' || existing.approvedBy)) {
    if (staff) throw new ConflictError('PAYOUT_RUN_LOCKED')
    return { runId: existing.id, publicId: existing.publicId, created: false }
  }
  // The job never rebuilds: finance may already be looking at it.
  if (existing && !staff) return { runId: existing.id, publicId: existing.publicId, created: false }

  const candidates = await instructorBalancesAtLeast(ctx, 'available', s.minKobo)
  const people = await payees(
    ctx,
    candidates.map((c) => c.instructorId),
    payOn,
    s.minKobo,
  )
  const history = await lastPaid(
    ctx,
    candidates.map((c) => c.instructorId),
  )
  const financeHolds = existing
    ? new Set(
        (
          await ctx.db
            .select({ instructorId: payoutItems.instructorId })
            .from(payoutItems)
            .where(
              and(eq(payoutItems.runId, existing.id), eq(payoutItems.holdReason, 'finance_hold')),
            )
        ).map((r) => r.instructorId),
      )
    : new Set<string>()

  const items = [...people.values()].map((p) => {
    const amount =
      p.availableKobo - (p.receivableKobo > p.availableKobo ? p.availableKobo : p.receivableKobo)
    const last = history.get(p.instructorId)
    const anomalies: string[] = []
    if (!last) anomalies.push('first_payout')
    else {
      if (p.account && last.payoutAccountId !== p.account.id) anomalies.push('new_account')
      if (amount > last.amountKobo * 3n) anomalies.push('over_3x_last')
    }
    const holdReason = financeHolds.has(p.instructorId) ? 'finance_hold' : p.holdReason
    return {
      instructorId: p.instructorId,
      payoutAccountId: p.account?.id ?? null,
      amountKobo: amount,
      status: holdReason ? ('held' as const) : ('queued' as const),
      holdReason,
      anomalies,
    }
  })
  const total = items.filter((i) => i.status === 'queued').reduce((t, i) => t + i.amountKobo, 0n)

  const run = await inTransaction(ctx, async (tx) => {
    let row: Run | undefined
    if (existing) {
      await tx.db.delete(payoutItems).where(eq(payoutItems.runId, existing.id))
      ;[row] = await tx.db
        .update(payoutRuns)
        .set({ payOn, totalKobo: total, cosignRequired: total > s.cosignKobo, updatedAt: tx.now })
        .where(eq(payoutRuns.id, existing.id))
        .returning()
    } else {
      ;[row] = await tx.db
        .insert(payoutRuns)
        .values({
          publicId: `PR-${month}`,
          month,
          payOn,
          totalKobo: total,
          cosignRequired: total > s.cosignKobo,
          createdAt: tx.now,
        })
        .onConflictDoNothing()
        .returning()
    }
    if (!row) return null
    if (items.length > 0) {
      await tx.db
        .insert(payoutItems)
        .values(items.map((i) => ({ ...i, runId: row.id, createdAt: tx.now })))
    }
    if (staff) {
      await writeAudit(tx, {
        action: existing ? 'payout_run.redrafted' : 'payout_run.drafted',
        targetType: 'payout_run',
        targetId: row.id,
        after: { total: total.toString(), items: items.length },
      })
    }
    return row
  })
  if (!run) {
    // Another call created it first.
    const [again] = await ctx.db.select().from(payoutRuns).where(eq(payoutRuns.month, month))
    if (!again) throw new Error('payout run vanished')
    return { runId: again.id, publicId: again.publicId, created: false }
  }
  if (!existing) await tellFinance(ctx, run, items)
  return { runId: run.id, publicId: run.publicId, created: !existing }
}

/** Last successful payout per instructor: amount and the account it went to. */
async function lastPaid(ctx: Ctx, ids: ReadonlyArray<string>) {
  const out = new Map<string, { amountKobo: bigint; payoutAccountId: string | null }>()
  if (ids.length === 0) return out
  const rows = await ctx.db
    .selectDistinctOn([payoutItems.instructorId], {
      instructorId: payoutItems.instructorId,
      amountKobo: payoutItems.amountKobo,
      payoutAccountId: payoutItems.payoutAccountId,
    })
    .from(payoutItems)
    .where(and(inArray(payoutItems.instructorId, [...ids]), eq(payoutItems.status, 'success')))
    .orderBy(payoutItems.instructorId, desc(payoutItems.settledAt))
  for (const r of rows) out.set(r.instructorId, r)
  return out
}

/** `staff-payout-run-ready` to everyone with the finance role (super admins too when co-signing). */
async function tellFinance(
  ctx: Ctx,
  run: Run,
  items: ReadonlyArray<{ status: string; anomalies: string[] }>,
) {
  const roles: Array<'finance' | 'super_admin'> = run.cosignRequired
    ? ['finance', 'super_admin']
    : ['finance']
  const staff = await ctx.db
    .selectDistinct({ id: user.id, name: user.name, email: user.email })
    .from(userRoles)
    .innerJoin(user, eq(user.id, userRoles.userId))
    .where(inArray(userRoles.role, roles))
  const queued = items.filter((i) => i.status === 'queued')
  const app = provider(ctx, 'urls').app.replace(/\/$/, '')
  const payOnLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lagos',
  }).format(run.payOn)
  for (const person of staff) {
    await sendEmail(ctx, {
      id: 'staff-payout-run-ready',
      to: person.email,
      businessKey: `${run.id}:${person.id}`,
      data: {
        name: person.name.split(/\s+/)[0] || 'there',
        monthLabel: monthLabel(run.month),
        totalKobo: run.totalKobo.toString(),
        instructors: queued.length,
        held: items.length - queued.length,
        flagged: queued.filter((i) => i.anomalies.length > 0).length,
        payOnLabel,
        cosignRequired: run.cosignRequired,
        url: `${app}/admin/payouts/${run.publicId}`,
      },
    })
  }
}

// ─── Review (finance) ────────────────────────────────────────────────────────────────────────

export interface PayoutRunSummary {
  id: string
  publicId: string
  month: string
  label: string
  payOn: Date
  status: PayoutRunStatus
  totalKobo: bigint
  cosignRequired: boolean
  approvedAt: Date | null
  cosignedAt: Date | null
  counts: Record<PayoutItemStatus, number>
}

const emptyCounts = (): Record<PayoutItemStatus, number> => ({
  queued: 0,
  held: 0,
  sending: 0,
  sent: 0,
  success: 0,
  failed: 0,
  reversed: 0,
})

/** `admin.payouts.list`: runs newest first with item counts by status. */
export async function listPayoutRuns(ctx: Ctx): Promise<PayoutRunSummary[]> {
  requireStaff(ctx.actor, canRunPayouts)
  const runs = await ctx.db.select().from(payoutRuns).orderBy(desc(payoutRuns.month)).limit(36)
  if (runs.length === 0) return []
  const counts = await ctx.db
    .select({ runId: payoutItems.runId, status: payoutItems.status, n: sql<number>`count(*)::int` })
    .from(payoutItems)
    .where(
      inArray(
        payoutItems.runId,
        runs.map((r) => r.id),
      ),
    )
    .groupBy(payoutItems.runId, payoutItems.status)
  return runs.map((r) => {
    const c = emptyCounts()
    for (const row of counts) if (row.runId === r.id) c[row.status] = row.n
    return summarize(r, c)
  })
}

const summarize = (r: Run, counts: Record<PayoutItemStatus, number>): PayoutRunSummary => ({
  id: r.id,
  publicId: r.publicId,
  month: r.month,
  label: monthLabel(r.month),
  payOn: r.payOn,
  status: r.status,
  totalKobo: r.totalKobo,
  cosignRequired: r.cosignRequired,
  approvedAt: r.approvedAt,
  cosignedAt: r.cosignedAt,
  counts,
})

export interface PayoutItemView {
  id: string
  instructorId: string
  instructorName: string
  bankName: string | null
  last4: string | null
  amountKobo: bigint
  nettedKobo: bigint
  status: PayoutItemStatus
  holdReason: PayoutHoldReason | null
  anomalies: string[]
  attempt: number
  feeKobo: bigint | null
  failureReason: string | null
  sentAt: Date | null
  settledAt: Date | null
}

export interface PayoutRunDetail extends PayoutRunSummary {
  approvedByName: string | null
  cosignedByName: string | null
  lastError: string | null
  startedAt: Date | null
  finishedAt: Date | null
  items: PayoutItemView[]
}

async function runByPublicId(ctx: Ctx, publicId: string): Promise<Run> {
  const [run] = await ctx.db.select().from(payoutRuns).where(eq(payoutRuns.publicId, publicId))
  if (!run) throw new NotFoundError('PAYOUT_RUN_NOT_FOUND')
  return run
}

/** `admin.payouts.get`: the run with every item, flagged and held ones first. */
export async function getPayoutRun(ctx: Ctx, publicId: string): Promise<PayoutRunDetail> {
  requireStaff(ctx.actor, canRunPayouts)
  const run = await runByPublicId(ctx, publicId)
  const rows = await ctx.db
    .select({
      item: payoutItems,
      name: user.name,
      bankName: payoutAccounts.bankName,
      last4: payoutAccounts.accountNumberLast4,
    })
    .from(payoutItems)
    .innerJoin(user, eq(user.id, payoutItems.instructorId))
    .leftJoin(payoutAccounts, eq(payoutAccounts.id, payoutItems.payoutAccountId))
    .where(eq(payoutItems.runId, run.id))
    .orderBy(desc(payoutItems.amountKobo))
  const signerIds = [run.approvedBy, run.cosignedBy].filter((v): v is string => Boolean(v))
  const signers =
    signerIds.length > 0
      ? await ctx.db
          .select({ id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, signerIds))
      : []
  const counts = emptyCounts()
  for (const r of rows) counts[r.item.status]++
  const rank = (i: Item) =>
    i.status === 'failed' || i.status === 'reversed'
      ? 0
      : i.status === 'held'
        ? 2
        : i.anomalies.length > 0
          ? 1
          : 3
  const items = rows
    .map((r) => ({ ...r, rank: rank(r.item) }))
    .sort((a, b) => a.rank - b.rank)
    .map(
      (r): PayoutItemView => ({
        id: r.item.id,
        instructorId: r.item.instructorId,
        instructorName: r.name,
        bankName: r.bankName,
        last4: r.last4,
        amountKobo: r.item.amountKobo,
        nettedKobo: r.item.nettedKobo,
        status: r.item.status,
        holdReason: r.item.holdReason,
        anomalies: r.item.anomalies,
        attempt: r.item.attempt,
        feeKobo: r.item.feeKobo,
        failureReason: r.item.failureReason,
        sentAt: r.item.sentAt,
        settledAt: r.item.settledAt,
      }),
    )
  const nameOf = (id: string | null) => signers.find((s) => s.id === id)?.name ?? null
  return {
    ...summarize(run, counts),
    approvedByName: nameOf(run.approvedBy),
    cosignedByName: nameOf(run.cosignedBy),
    lastError: run.lastError,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    items,
  }
}

/** `admin.payouts.setHold`: finance holds someone back from a draft, or lets them through again. */
export async function setPayoutItemHold(
  ctx: Ctx,
  input: { runId: string; itemId: string; hold: boolean },
): Promise<PayoutRunDetail> {
  requireStaff(ctx.actor, canRunPayouts)
  const run = await runByPublicId(ctx, input.runId)
  if (run.status !== 'draft' || run.approvedBy) throw new ConflictError('PAYOUT_RUN_LOCKED')
  await inTransaction(ctx, async (tx) => {
    const [item] = await tx.db
      .select()
      .from(payoutItems)
      .where(and(eq(payoutItems.id, input.itemId), eq(payoutItems.runId, run.id)))
    if (!item) throw new NotFoundError('PAYOUT_RUN_NOT_FOUND')
    if (input.hold && item.status === 'queued') {
      await tx.db
        .update(payoutItems)
        .set({ status: 'held', holdReason: 'finance_hold', updatedAt: tx.now })
        .where(eq(payoutItems.id, item.id))
    } else if (!input.hold && item.holdReason === 'finance_hold') {
      await tx.db
        .update(payoutItems)
        .set({ status: 'queued', holdReason: null, updatedAt: tx.now })
        .where(eq(payoutItems.id, item.id))
    } else return
    await refreshTotal(tx, run.id)
    await writeAudit(tx, {
      action: input.hold ? 'payout_item.held' : 'payout_item.released',
      targetType: 'payout_item',
      targetId: item.id,
      before: { status: item.status },
    })
  })
  return getPayoutRun(ctx, input.runId)
}

async function refreshTotal(ctx: Ctx, runId: string) {
  const s = await settings(ctx)
  const [row] = await ctx.db
    .select({ total: sql<string>`coalesce(sum(${payoutItems.amountKobo}), 0)::text` })
    .from(payoutItems)
    .where(and(eq(payoutItems.runId, runId), eq(payoutItems.status, 'queued')))
  const total = BigInt(row?.total ?? '0')
  await ctx.db
    .update(payoutRuns)
    .set({ totalKobo: total, cosignRequired: total > s.cosignKobo, updatedAt: ctx.now })
    .where(eq(payoutRuns.id, runId))
}

/**
 * `admin.payouts.approve`: finance (2FA in the last 12 h) approves the draft. A run over the
 * co-sign threshold also needs `cosignPayoutRun` from a different super admin before it's sent.
 */
export async function approvePayoutRun(ctx: Ctx, publicId: string): Promise<PayoutRunDetail> {
  const staff = requirePayoutSigner(ctx)
  const run = await runByPublicId(ctx, publicId)
  if (run.status !== 'draft' || run.approvedBy) throw new ConflictError('PAYOUT_RUN_LOCKED')
  const [queued] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(payoutItems)
    .where(and(eq(payoutItems.runId, run.id), eq(payoutItems.status, 'queued')))
  if (!queued?.n) throw new RuleViolationError('PAYOUT_RUN_EMPTY')
  await inTransaction(ctx, async (tx) => {
    const done = !run.cosignRequired
    await tx.db
      .update(payoutRuns)
      .set({
        approvedBy: staff.userId,
        approvedAt: tx.now,
        ...(done ? { status: 'approved' as const } : {}),
        updatedAt: tx.now,
      })
      .where(and(eq(payoutRuns.id, run.id), isNull(payoutRuns.approvedBy)))
    await writeAudit(tx, {
      action: 'payout_run.approved',
      targetType: 'payout_run',
      targetId: run.id,
      after: { total: run.totalKobo.toString(), cosignRequired: run.cosignRequired },
    })
    if (done) await tx.events.emit('payout_run.approved', { runId: run.id })
  })
  return getPayoutRun(ctx, publicId)
}

/** `admin.payouts.cosign`: a super admin other than the approver signs a large run. */
export async function cosignPayoutRun(ctx: Ctx, publicId: string): Promise<PayoutRunDetail> {
  const staff = requirePayoutSigner(ctx)
  if (!hasRole(staff, 'super_admin')) throw new ForbiddenError('STAFF_ONLY')
  const run = await runByPublicId(ctx, publicId)
  if (run.status !== 'draft' || !run.approvedBy || !run.cosignRequired) {
    throw new ConflictError('PAYOUT_RUN_LOCKED')
  }
  if (run.approvedBy === staff.userId) throw new RuleViolationError('PAYOUT_COSIGN_SELF')
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(payoutRuns)
      .set({ cosignedBy: staff.userId, cosignedAt: tx.now, status: 'approved', updatedAt: tx.now })
      .where(and(eq(payoutRuns.id, run.id), eq(payoutRuns.status, 'draft')))
    await writeAudit(tx, {
      action: 'payout_run.cosigned',
      targetType: 'payout_run',
      targetId: run.id,
      after: { total: run.totalKobo.toString() },
    })
    await tx.events.emit('payout_run.approved', { runId: run.id })
  })
  return getPayoutRun(ctx, publicId)
}

/**
 * `admin.payouts.retry`: sends a failed or reversed transfer again with a new reference (after
 * the instructor fixed their bank, or after Tokslearn topped up its Paystack balance).
 */
export async function retryPayoutItem(
  ctx: Ctx,
  input: { runId: string; itemId: string },
): Promise<PayoutRunDetail> {
  requirePayoutSigner(ctx)
  const run = await runByPublicId(ctx, input.runId)
  await inTransaction(ctx, async (tx) => {
    const [item] = await tx.db
      .update(payoutItems)
      .set({ status: 'queued', failureReason: null, updatedAt: tx.now })
      .where(
        and(
          eq(payoutItems.id, input.itemId),
          eq(payoutItems.runId, run.id),
          inArray(payoutItems.status, ['failed', 'reversed']),
        ),
      )
      .returning()
    if (!item) throw new ConflictError('PAYOUT_NOT_RETRYABLE')
    await tx.db
      .update(payoutRuns)
      .set({ status: 'approved', finishedAt: null, lastError: null, updatedAt: tx.now })
      .where(eq(payoutRuns.id, run.id))
    await writeAudit(tx, {
      action: 'payout_item.retried',
      targetType: 'payout_item',
      targetId: item.id,
      after: { attempt: item.attempt + 1 },
    })
    await tx.events.emit('payout_run.approved', { runId: run.id })
  })
  return getPayoutRun(ctx, input.runId)
}

/** `admin.payouts.exportCsv`: the run's items for the bank reconciliation spreadsheet. */
export async function payoutRunCsv(
  ctx: Ctx,
  publicId: string,
): Promise<{ filename: string; csv: string }> {
  const run = await getPayoutRun(ctx, publicId)
  const kobo = (k: bigint | null) =>
    k === null ? '' : `${k / 100n}.${(k % 100n).toString().padStart(2, '0')}`
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
  const head = [
    'Instructor',
    'Bank',
    'Account (last 4)',
    'Amount (NGN)',
    'Netted from refunds (NGN)',
    'Status',
    'Held because',
    'Flags',
    'Transfer fee (NGN)',
    'Failure',
  ]
  const rows = run.items.map((i) =>
    [
      i.instructorName,
      i.bankName ?? '',
      i.last4 ?? '',
      kobo(i.amountKobo),
      kobo(i.nettedKobo),
      i.status,
      i.holdReason ?? '',
      i.anomalies.join(' '),
      kobo(i.feeKobo),
      i.failureReason ?? '',
    ]
      .map(cell)
      .join(','),
  )
  return {
    filename: `tokslearn-payouts-${run.month}.csv`,
    csv: [head.join(','), ...rows].join('\n'),
  }
}

// ─── Sending (jobs) ──────────────────────────────────────────────────────────────────────────

/** Approved runs whose pay day has come (the daily job and the approval event). */
export async function duePayoutRuns(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: payoutRuns.id })
    .from(payoutRuns)
    .where(
      and(
        inArray(payoutRuns.status, ['approved', 'processing']),
        sql`${payoutRuns.payOn} <= ${ctx.now}`,
      ),
    )
  return rows.map((r) => r.id)
}

/**
 * Moves each queued item's money to in_transit, checking the instructor once more (a bank change,
 * a lost 2FA, a refund since the draft). Never pays more than was approved. Returns the items to
 * send, in batches of 100. Safe to call again: items already moved are skipped.
 */
export async function preparePayoutRun(ctx: Ctx, runId: string): Promise<string[][]> {
  const [run] = await ctx.db.select().from(payoutRuns).where(eq(payoutRuns.id, runId))
  if (!run || (run.status !== 'approved' && run.status !== 'processing')) return []
  if (run.payOn > ctx.now) return []
  const s = await settings(ctx)
  const queued = await ctx.db
    .select()
    .from(payoutItems)
    .where(and(eq(payoutItems.runId, run.id), eq(payoutItems.status, 'queued')))
  const people = await payees(
    ctx,
    queued.map((i) => i.instructorId),
    ctx.now,
    s.minKobo,
  )
  for (const item of queued) {
    const p = people.get(item.instructorId)
    await inTransaction(ctx, async (tx) => {
      const [locked] = await tx.db
        .select()
        .from(payoutItems)
        .where(and(eq(payoutItems.id, item.id), eq(payoutItems.status, 'queued')))
        .for('update')
      if (!locked || !p) return
      // The netting below can already have happened on an earlier attempt; read fresh balances.
      const bal = await balances(tx, [
        instructorAccount(locked.instructorId, 'available'),
        instructorAccount(locked.instructorId, 'receivable'),
      ])
      const available = bal.get(instructorAccount(locked.instructorId, 'available')) ?? 0n
      const receivable = bal.get(instructorAccount(locked.instructorId, 'receivable')) ?? 0n
      const net = receivable > available ? available : receivable
      const payable = available - net < locked.amountKobo ? available - net : locked.amountKobo
      const reason =
        p.holdReason && p.holdReason !== 'below_minimum'
          ? p.holdReason
          : payable < s.minKobo
            ? 'below_minimum'
            : null
      if (reason || !p.account?.paystackRecipientCode) {
        await tx.db
          .update(payoutItems)
          .set({ status: 'held', holdReason: reason ?? 'no_payout_account', updatedAt: tx.now })
          .where(eq(payoutItems.id, locked.id))
        return
      }
      const attempt = locked.attempt + 1
      if (net > 0n) {
        // What the instructor owes back from refunds after an earlier payout comes off first.
        await post(tx, {
          kind: 'adjustment',
          ref: { type: 'payout_item', id: locked.id },
          idempotencyKey: `payout-net:${locked.id}:${attempt}`,
          lines: [
            { account: instructorAccount(locked.instructorId, 'available'), debit: net },
            { account: instructorAccount(locked.instructorId, 'receivable'), credit: net },
          ],
        })
      }
      await post(tx, {
        kind: 'payout',
        ref: { type: 'payout_item', id: locked.id },
        idempotencyKey: `payout:${locked.id}:${attempt}`,
        lines: [
          { account: instructorAccount(locked.instructorId, 'available'), debit: payable },
          { account: instructorAccount(locked.instructorId, 'in_transit'), credit: payable },
        ],
      })
      await tx.db
        .update(payoutItems)
        .set({
          status: 'sending',
          attempt,
          amountKobo: payable,
          nettedKobo: locked.nettedKobo + net,
          payoutAccountId: p.account.id,
          reference: referenceFor(locked.id, attempt),
          failureReason: null,
          updatedAt: tx.now,
        })
        .where(eq(payoutItems.id, locked.id))
    })
  }
  await ctx.db
    .update(payoutRuns)
    .set({ status: 'processing', startedAt: run.startedAt ?? ctx.now, updatedAt: ctx.now })
    .where(eq(payoutRuns.id, run.id))
  const sending = await ctx.db
    .select({ id: payoutItems.id })
    .from(payoutItems)
    .where(and(eq(payoutItems.runId, run.id), eq(payoutItems.status, 'sending')))
    .orderBy(asc(payoutItems.id))
  const batches: string[][] = []
  for (let i = 0; i < sending.length; i += BATCH) {
    batches.push(sending.slice(i, i + BATCH).map((r) => r.id))
  }
  if (batches.length === 0) await finishRunIfDone(ctx, run.id)
  return batches
}

const UNCONFIRMED = 'send_unconfirmed'

/**
 * Sends one batch as a Paystack bulk transfer. If Paystack refuses the batch (say, the balance is
 * too low), the money goes back to available and finance sees why; the instructor isn't told
 * their bank failed. If the call times out, nothing is assumed: the items wait, and the retry
 * first asks Paystack about each reference so nobody is paid twice.
 */
export async function sendPayoutBatch(
  ctx: Ctx,
  itemIds: ReadonlyArray<string>,
): Promise<{ sent: number; refused: number }> {
  if (itemIds.length === 0) return { sent: 0, refused: 0 }
  const rows = await ctx.db
    .select({ item: payoutItems, recipient: payoutAccounts.paystackRecipientCode })
    .from(payoutItems)
    .innerJoin(payoutAccounts, eq(payoutAccounts.id, payoutItems.payoutAccountId))
    .where(and(inArray(payoutItems.id, [...itemIds]), eq(payoutItems.status, 'sending')))
  const payouts = provider(ctx, 'payouts')
  // A previous try timed out: maybe Paystack has some of these already.
  const toSend: typeof rows = []
  let sent = 0
  for (const r of rows) {
    if (r.item.failureReason === UNCONFIRMED && r.item.reference) {
      const known = await payouts.fetchTransfer(r.item.reference)
      if (known) {
        await markSent(ctx, r.item.id, known.transferCode)
        sent++
        continue
      }
    }
    toSend.push(r)
  }
  if (toSend.length === 0) return { sent, refused: 0 }
  try {
    const queued = await payouts.bulkTransfer(
      toSend.map((r) => ({
        amountKobo: r.item.amountKobo,
        recipientCode: r.recipient ?? '',
        reference: r.item.reference ?? '',
        reason: 'Tokslearn payout',
      })),
    )
    for (const q of queued) {
      const r = toSend.find((x) => x.item.reference === q.reference)
      if (r) {
        await markSent(ctx, r.item.id, q.transferCode)
        sent++
      }
    }
    return { sent, refused: 0 }
  } catch (error) {
    if (!(error instanceof ProviderError)) throw error
    if (error.status === null) {
      // Timed out or unreachable: we don't know. Mark and let the job retry the step.
      await ctx.db
        .update(payoutItems)
        .set({ failureReason: UNCONFIRMED, updatedAt: ctx.now })
        .where(
          inArray(
            payoutItems.id,
            toSend.map((r) => r.item.id),
          ),
        )
      throw error
    }
    log('error', 'payout batch refused', { requestId: ctx.requestId, error: error.message })
    let refused = 0
    for (const r of toSend) {
      // A duplicate-reference refusal means some already exist at Paystack.
      const known = r.item.reference ? await payouts.fetchTransfer(r.item.reference) : null
      if (known) {
        await markSent(ctx, r.item.id, known.transferCode)
        sent++
      } else {
        await unwind(ctx, r.item, 'failed', `Not sent: ${error.message}`, { tellInstructor: false })
        refused++
      }
    }
    await ctx.db
      .update(payoutRuns)
      .set({ lastError: error.message.slice(0, 500), updatedAt: ctx.now })
      .where(eq(payoutRuns.id, rows[0]?.item.runId ?? ''))
    return { sent, refused }
  }
}

async function markSent(ctx: Ctx, itemId: string, transferCode: string | null) {
  await ctx.db
    .update(payoutItems)
    .set({ status: 'sent', transferCode, sentAt: ctx.now, failureReason: null, updatedAt: ctx.now })
    .where(and(eq(payoutItems.id, itemId), eq(payoutItems.status, 'sending')))
}

// ─── Settling (webhooks + hourly) ────────────────────────────────────────────────────────────

/**
 * `payout-settle`: asks Paystack about one transfer (by our reference; the webhook body is never
 * trusted) and applies what it says. Idempotent: a settled item is left alone.
 */
export async function settlePayoutTransfer(
  ctx: Ctx,
  reference: string,
): Promise<'success' | 'failed' | 'reversed' | 'pending' | 'unknown' | 'skipped'> {
  const [item] = await ctx.db.select().from(payoutItems).where(eq(payoutItems.reference, reference))
  if (!item) return 'unknown'
  const info = await provider(ctx, 'payouts').fetchTransfer(reference)
  if (!info) return 'unknown'
  if (info.status === 'pending') return 'pending'
  if (info.status === 'success') {
    if (item.status !== 'sent' && item.status !== 'sending') return 'skipped'
    await succeed(ctx, item, info.feeKobo ?? transferFeeKobo(item.amountKobo))
    return 'success'
  }
  // failed or reversed
  if (item.status === 'sent' || item.status === 'sending') {
    await unwind(ctx, item, info.status, info.failureReason, { tellInstructor: true })
    return info.status
  }
  if (item.status === 'success' && info.status === 'reversed') {
    await reverseAfterSuccess(ctx, item, info.failureReason)
    return 'reversed'
  }
  return 'skipped'
}

/** The hourly check: transfers sent over `olderThanMs` ago that no webhook has settled. */
export async function settleSentPayouts(
  ctx: Ctx,
  input: { olderThanMs: number },
): Promise<{ checked: number; settled: number }> {
  const cutoff = new Date(ctx.now.getTime() - input.olderThanMs)
  const rows = await ctx.db
    .select({ reference: payoutItems.reference })
    .from(payoutItems)
    .where(and(eq(payoutItems.status, 'sent'), lt(payoutItems.sentAt, cutoff)))
    .limit(500)
  let settled = 0
  for (const r of rows) {
    if (!r.reference) continue
    const out = await settlePayoutTransfer(ctx, r.reference)
    if (out === 'success' || out === 'failed' || out === 'reversed') settled++
  }
  return { checked: rows.length, settled }
}

async function succeed(ctx: Ctx, item: Item, feeKobo: bigint) {
  const done = await inTransaction(ctx, async (tx) => {
    const [locked] = await tx.db
      .select()
      .from(payoutItems)
      .where(and(eq(payoutItems.id, item.id), inArray(payoutItems.status, ['sent', 'sending'])))
      .for('update')
    if (!locked) return null
    await post(tx, {
      kind: 'payout',
      ref: { type: 'payout_item', id: locked.id },
      idempotencyKey: `payout-success:${locked.id}:${locked.attempt}`,
      lines: [
        { account: instructorAccount(locked.instructorId, 'in_transit'), debit: locked.amountKobo },
        { account: P.cashPaystack, credit: locked.amountKobo },
      ],
    })
    if (feeKobo > 0n) {
      await post(tx, {
        kind: 'fee',
        ref: { type: 'payout_item', id: locked.id },
        idempotencyKey: `transfer-fee:${locked.id}:${locked.attempt}`,
        lines: [
          { account: P.gatewayFees, debit: feeKobo },
          { account: P.cashPaystack, credit: feeKobo },
        ],
      })
    }
    await tx.db
      .update(payoutItems)
      .set({ status: 'success', feeKobo, settledAt: tx.now, updatedAt: tx.now })
      .where(eq(payoutItems.id, locked.id))
    await markSalesPaid(tx, locked)
    await tellInstructor(tx, locked, 'sent', null)
    return locked
  })
  if (done) await finishRunIfDone(ctx, done.runId)
}

/**
 * The instructor's oldest available sales become `paid`, up to what this payout covered (the
 * amount plus anything netted). Remembers the payout so a later reversal can undo exactly these.
 */
async function markSalesPaid(ctx: Ctx, item: Item) {
  const rows = await ctx.db
    .select({ id: orderItems.id, share: orderItems.instructorShareKobo })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.instructorId, item.instructorId),
        eq(orderItems.earningStatus, 'available'),
        ne(orderItems.status, 'refunded'),
      ),
    )
    .orderBy(asc(orders.paidAt), asc(orderItems.id))
  let left = item.amountKobo + item.nettedKobo
  const ids: string[] = []
  for (const r of rows) {
    const share = r.share ?? 0n
    if (share > left) break
    left -= share
    ids.push(r.id)
  }
  if (ids.length > 0) {
    await ctx.db
      .update(orderItems)
      .set({ earningStatus: 'paid', payoutItemId: item.id })
      .where(inArray(orderItems.id, ids))
  }
}

/** A transfer that never arrived (failed, or reversed before success): money back to available. */
async function unwind(
  ctx: Ctx,
  item: Item,
  status: 'failed' | 'reversed',
  reason: string | null,
  opts: { tellInstructor: boolean },
) {
  const done = await inTransaction(ctx, async (tx) => {
    const [locked] = await tx.db
      .select()
      .from(payoutItems)
      .where(and(eq(payoutItems.id, item.id), inArray(payoutItems.status, ['sent', 'sending'])))
      .for('update')
    if (!locked) return null
    await post(tx, {
      kind: 'payout_reversal',
      ref: { type: 'payout_item', id: locked.id },
      idempotencyKey: `payout-failed:${locked.id}:${locked.attempt}`,
      lines: [
        { account: instructorAccount(locked.instructorId, 'in_transit'), debit: locked.amountKobo },
        { account: instructorAccount(locked.instructorId, 'available'), credit: locked.amountKobo },
      ],
    })
    await tx.db
      .update(payoutItems)
      .set({
        status,
        failureReason: reason?.slice(0, 300) ?? null,
        settledAt: tx.now,
        updatedAt: tx.now,
      })
      .where(eq(payoutItems.id, locked.id))
    if (opts.tellInstructor) await tellInstructor(tx, locked, 'failed', reason)
    return locked
  })
  if (done) await finishRunIfDone(ctx, done.runId)
}

/** Paystack reversed a transfer it had reported as paid: the money is back in our balance. */
async function reverseAfterSuccess(ctx: Ctx, item: Item, reason: string | null) {
  const done = await inTransaction(ctx, async (tx) => {
    const [locked] = await tx.db
      .select()
      .from(payoutItems)
      .where(and(eq(payoutItems.id, item.id), eq(payoutItems.status, 'success')))
      .for('update')
    if (!locked) return null
    await post(tx, {
      kind: 'payout_reversal',
      ref: { type: 'payout_item', id: locked.id },
      idempotencyKey: `payout-reversed:${locked.id}:${locked.attempt}`,
      lines: [
        { account: P.cashPaystack, debit: locked.amountKobo },
        { account: instructorAccount(locked.instructorId, 'available'), credit: locked.amountKobo },
      ],
    })
    await tx.db
      .update(payoutItems)
      .set({ status: 'reversed', failureReason: reason?.slice(0, 300) ?? null, updatedAt: tx.now })
      .where(eq(payoutItems.id, locked.id))
    await tx.db
      .update(orderItems)
      .set({ earningStatus: 'available', payoutItemId: null })
      .where(and(eq(orderItems.payoutItemId, locked.id), eq(orderItems.earningStatus, 'paid')))
    await tellInstructor(tx, locked, 'failed', reason)
    return locked
  })
  if (done) await finishRunIfDone(ctx, done.runId)
}

/** Closes the run once nothing is in flight: completed, or partially_failed if any didn't land. */
async function finishRunIfDone(ctx: Ctx, runId: string) {
  const rows = await ctx.db
    .select({ status: payoutItems.status, n: sql<number>`count(*)::int` })
    .from(payoutItems)
    .where(eq(payoutItems.runId, runId))
    .groupBy(payoutItems.status)
  const n = (s: PayoutItemStatus) => rows.find((r) => r.status === s)?.n ?? 0
  if (n('queued') + n('sending') + n('sent') > 0) return
  await ctx.db
    .update(payoutRuns)
    .set({
      status: n('failed') + n('reversed') > 0 ? 'partially_failed' : 'completed',
      finishedAt: ctx.now,
      updatedAt: ctx.now,
    })
    .where(
      and(
        eq(payoutRuns.id, runId),
        or(eq(payoutRuns.status, 'processing'), eq(payoutRuns.status, 'approved')),
      ),
    )
}

async function tellInstructor(
  ctx: Ctx,
  item: Item,
  what: 'sent' | 'failed',
  reason: string | null,
) {
  const [[person], [account], [run]] = await Promise.all([
    ctx.db.select({ name: user.name }).from(user).where(eq(user.id, item.instructorId)),
    item.payoutAccountId
      ? ctx.db
          .select({ bankName: payoutAccounts.bankName, last4: payoutAccounts.accountNumberLast4 })
          .from(payoutAccounts)
          .where(eq(payoutAccounts.id, item.payoutAccountId))
      : Promise.resolve([]),
    ctx.db
      .select({ month: payoutRuns.month })
      .from(payoutRuns)
      .where(eq(payoutRuns.id, item.runId)),
  ])
  const app = provider(ctx, 'urls').app.replace(/\/$/, '')
  const amount = naira(item.amountKobo)
  const common = {
    name: (person?.name ?? '').split(/\s+/)[0] || 'there',
    amountKobo: item.amountKobo.toString(),
    bankName: account?.bankName ?? 'your bank',
    last4: account?.last4 ?? '····',
    monthLabel: run ? monthLabel(run.month) : '',
  }
  if (what === 'sent') {
    await notify(ctx, {
      userId: item.instructorId,
      type: 'payout.sent',
      title: `${amount} is on its way to your bank`,
      body: `Sent to ${common.bankName} •••• ${common.last4}.`,
      link: '/teach/earnings',
      dedupeKey: `payout-sent:${item.id}:${item.attempt}`,
      email: {
        id: 'payout-sent',
        businessKey: `${item.id}:${item.attempt}`,
        data: { ...common, url: `${app}/teach/earnings` },
      },
    })
  } else {
    await notify(ctx, {
      userId: item.instructorId,
      type: 'payout.failed',
      title: `Your payout of ${amount} didn’t go through`,
      body: 'The money is back in your available balance. Check your bank account details.',
      link: '/teach/settings',
      dedupeKey: `payout-failed:${item.id}:${item.attempt}`,
      email: {
        id: 'payout-failed',
        businessKey: `${item.id}:${item.attempt}`,
        data: { ...common, reason, url: `${app}/teach/settings` },
      },
    })
  }
}

// ─── Instructor view ─────────────────────────────────────────────────────────────────────────

export interface MyPayout {
  month: string
  label: string
  amountKobo: bigint
  /** Owed back from refunds, taken off before paying. */
  nettedKobo: bigint
  status: 'queued' | 'held' | 'sending' | 'paid' | 'failed'
  holdReason: PayoutHoldReason | null
  bankName: string | null
  last4: string | null
  payOn: Date
  settledAt: Date | null
}

/** `earnings.payouts`: the instructor's payouts, newest first (the last 24 runs). */
export async function listMyPayouts(ctx: Ctx): Promise<MyPayout[]> {
  const me = requireUser(ctx.actor)
  const rows = await ctx.db
    .select({
      item: payoutItems,
      month: payoutRuns.month,
      payOn: payoutRuns.payOn,
      runStatus: payoutRuns.status,
      bankName: payoutAccounts.bankName,
      last4: payoutAccounts.accountNumberLast4,
    })
    .from(payoutItems)
    .innerJoin(payoutRuns, eq(payoutRuns.id, payoutItems.runId))
    .leftJoin(payoutAccounts, eq(payoutAccounts.id, payoutItems.payoutAccountId))
    .where(eq(payoutItems.instructorId, me.userId))
    .orderBy(desc(payoutRuns.month))
    .limit(24)
  // Drafts aren't decided yet: instructors see a run once it's approved.
  return rows
    .filter((r) => r.runStatus !== 'draft')
    .map((r) => ({
      month: r.month,
      label: monthLabel(r.month),
      amountKobo: r.item.amountKobo,
      nettedKobo: r.item.nettedKobo,
      status:
        r.item.status === 'success'
          ? 'paid'
          : r.item.status === 'failed' || r.item.status === 'reversed'
            ? 'failed'
            : r.item.status === 'sent'
              ? 'sending'
              : r.item.status,
      holdReason: r.item.status === 'held' ? r.item.holdReason : null,
      bankName: r.bankName,
      last4: r.last4,
      payOn: r.payOn,
      settledAt: r.item.settledAt,
    }))
}

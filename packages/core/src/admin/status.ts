import { schema } from '@tokslearn/db'
import { and, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { hasRole } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { requireStaff } from '../kernel/guards'

// Background work at a glance for `/admin/jobs` and the dashboard alerts (docs/20, ADR-047): the
// outbox backlog (domain events waiting to reach Inngest) and webhooks that failed or stalled.
// Inngest's own run history stays in its dashboard; this is what our database can tell.
//
// Foreign reads (docs/03 §3): payment_events (commerce).

const { outbox, webhookEvents, paymentEvents, settings } = schema
const STALE_MS = 15 * 60 * 1000

export interface OutboxProblem {
  id: string
  eventName: string
  attempts: number
  lastError: string | null
  createdAt: Date
}

export interface WebhookProblem {
  provider: string
  type: string
  eventId: string
  error: string | null
  createdAt: Date
}

export interface SystemStatus {
  outbox: { pending: number; stale: number; failed: number; oldestPendingAt: Date | null }
  failedOutbox: OutboxProblem[]
  webhooks: { failed: number; stale: number }
  failedWebhooks: WebhookProblem[]
}

/** `admin.jobs.status`: admins. Stale = waiting over 15 minutes. */
export async function systemStatus(ctx: Ctx): Promise<SystemStatus> {
  requireStaff(ctx.actor, (a) => hasRole(a, 'admin', 'super_admin'))
  return readStatus(ctx)
}

/** The same numbers without the role check, for other staff surfaces (the dashboard alerts). */
export async function readStatus(ctx: Ctx): Promise<SystemStatus> {
  const staleBefore = new Date(ctx.now.getTime() - STALE_MS)
  const [[ob], failedOutbox, [wh], [pe], whRows, peRows] = await Promise.all([
    ctx.db
      .select({
        pending: sql<number>`count(*) filter (where ${outbox.status} = 'pending')::int`,
        stale: sql<number>`count(*) filter (where ${outbox.status} = 'pending' and ${outbox.availableAt} < ${staleBefore})::int`,
        failed: sql<number>`count(*) filter (where ${outbox.status} = 'failed')::int`,
        oldest: sql<
          string | null
        >`min(${outbox.createdAt}) filter (where ${outbox.status} = 'pending')`,
      })
      .from(outbox)
      .where(or(eq(outbox.status, 'pending'), eq(outbox.status, 'failed'))),
    ctx.db
      .select({
        id: outbox.id,
        eventName: outbox.eventName,
        attempts: outbox.attempts,
        lastError: outbox.lastError,
        createdAt: outbox.createdAt,
      })
      .from(outbox)
      .where(eq(outbox.status, 'failed'))
      .orderBy(desc(outbox.createdAt))
      .limit(20),
    ctx.db
      .select({
        failed: sql<number>`count(*) filter (where ${webhookEvents.error} is not null)::int`,
        stale: sql<number>`count(*) filter (where ${webhookEvents.error} is null and ${webhookEvents.processedAt} is null and ${webhookEvents.createdAt} < ${staleBefore})::int`,
      })
      .from(webhookEvents)
      .where(isNull(webhookEvents.processedAt)),
    ctx.db
      .select({
        failed: sql<number>`count(*) filter (where ${paymentEvents.error} is not null and ${paymentEvents.error} <> 'not_handled_yet')::int`,
        stale: sql<number>`count(*) filter (where ${paymentEvents.error} is null and ${paymentEvents.processedAt} is null and ${paymentEvents.createdAt} < ${staleBefore})::int`,
      })
      .from(paymentEvents)
      .where(or(isNull(paymentEvents.processedAt), isNotNull(paymentEvents.error))),
    ctx.db
      .select({
        provider: webhookEvents.provider,
        type: webhookEvents.type,
        eventId: webhookEvents.eventId,
        error: webhookEvents.error,
        createdAt: webhookEvents.createdAt,
      })
      .from(webhookEvents)
      .where(
        or(
          isNotNull(webhookEvents.error),
          and(isNull(webhookEvents.processedAt), lt(webhookEvents.createdAt, staleBefore)),
        ),
      )
      .orderBy(desc(webhookEvents.createdAt))
      .limit(20),
    ctx.db
      .select({
        provider: paymentEvents.provider,
        type: paymentEvents.type,
        eventId: paymentEvents.eventId,
        error: paymentEvents.error,
        createdAt: paymentEvents.createdAt,
      })
      .from(paymentEvents)
      .where(
        or(
          and(isNotNull(paymentEvents.error), sql`${paymentEvents.error} <> 'not_handled_yet'`),
          and(
            isNull(paymentEvents.processedAt),
            isNull(paymentEvents.error),
            lt(paymentEvents.createdAt, staleBefore),
          ),
        ),
      )
      .orderBy(desc(paymentEvents.createdAt))
      .limit(20),
  ])
  return {
    outbox: {
      pending: ob?.pending ?? 0,
      stale: ob?.stale ?? 0,
      failed: ob?.failed ?? 0,
      oldestPendingAt: ob?.oldest ? new Date(ob.oldest) : null,
    },
    failedOutbox,
    webhooks: {
      failed: (wh?.failed ?? 0) + (pe?.failed ?? 0),
      stale: (wh?.stale ?? 0) + (pe?.stale ?? 0),
    },
    failedWebhooks: [...whRows, ...peRows]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20),
  }
}

export interface CheckResult {
  ok: boolean
  at: string
  /** What went wrong, counted (e.g. unbalancedEntries: 2). */
  problems: Record<string, number>
}

const checkKey = (name: string) => `check:${name}`

/** Nightly jobs record their outcome here so the dashboard can show it without re-running them. */
export async function recordCheckResult(
  ctx: Ctx,
  name: 'ledger_integrity',
  result: { ok: boolean; problems: Record<string, number> },
): Promise<void> {
  const value: CheckResult = { ...result, at: ctx.now.toISOString() }
  await ctx.db
    .insert(settings)
    .values({ key: checkKey(name), value, updatedAt: ctx.now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: ctx.now } })
}

export async function lastCheckResult(
  ctx: Ctx,
  name: 'ledger_integrity',
): Promise<CheckResult | null> {
  const [row] = await ctx.db
    .select()
    .from(settings)
    .where(eq(settings.key, checkKey(name)))
  const v = row?.value as Partial<CheckResult> | undefined
  if (!v || typeof v.ok !== 'boolean' || typeof v.at !== 'string') return null
  return { ok: v.ok, at: v.at, problems: v.problems ?? {} }
}

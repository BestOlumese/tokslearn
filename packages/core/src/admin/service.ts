import { actorUserId } from '../kernel/actor'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireStaff } from '../kernel/guards'
import { log } from '../kernel/logger'
import * as repo from './repo'
import { canDispatchOutbox, canManageFeatureFlags, canViewAuditLog } from './rules'

// ── Health ───────────────────────────────────────────────
export type DependencyStatus = 'ok' | 'down' | 'not_configured'

export interface Health {
  status: 'ok' | 'degraded'
  checks: { database: DependencyStatus; redis: DependencyStatus }
}

const DB_PING_TIMEOUT_MS = 2_000

/** Public, cheap: used by uptime checks. `pingRedis` is injected so core stays provider-free. */
export async function getHealth(
  ctx: Ctx,
  deps: { pingRedis?: () => Promise<boolean> } = {},
): Promise<Health> {
  const database = await withTimeout(repo.pingDatabase(ctx.db), DB_PING_TIMEOUT_MS)
    .then((): DependencyStatus => 'ok')
    .catch((): DependencyStatus => 'down')
  const redis: DependencyStatus = deps.pingRedis
    ? (await deps.pingRedis().catch(() => false))
      ? 'ok'
      : 'down'
    : 'not_configured'
  const degraded = database === 'down' || redis === 'down'
  return { status: degraded ? 'degraded' : 'ok', checks: { database, redis } }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

// ── Audit ────────────────────────────────────────────────
export interface AuditInput {
  action: string
  targetType: string
  targetId: string
  before?: unknown
  after?: unknown
}

/** Every staff action and money-affecting action writes one row (docs/05 §2). */
export async function writeAudit(ctx: Ctx, entry: AuditInput): Promise<void> {
  await repo.insertAudit(ctx.db, {
    actorId: actorUserId(ctx.actor),
    actorKind: ctx.actor.kind,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipHash: ctx.ipHash,
    requestId: ctx.requestId,
  })
}

export type AuditEntry = Awaited<ReturnType<typeof repo.listAudit>>[number]

const encodeCursor = (e: { createdAt: Date; id: string }) =>
  Buffer.from(`${e.createdAt.toISOString()}|${e.id}`).toString('base64url')

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const createdAt = new Date(iso ?? '')
  return id && !Number.isNaN(createdAt.getTime()) ? { createdAt, id } : null
}

/** Audit log search for /admin/audit (docs/20 §6). Admins only. */
export async function listAuditLog(
  ctx: Ctx,
  filters: Omit<repo.AuditFilters, 'cursor'> & { cursor?: string | undefined },
): Promise<{ items: AuditEntry[]; nextCursor: string | null }> {
  requireStaff(ctx.actor, canViewAuditLog)
  const rows = await repo.listAudit(ctx.db, { ...filters, cursor: decodeCursor(filters.cursor) })
  const items = rows.slice(0, filters.limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > filters.limit && last ? encodeCursor(last) : null }
}

// ── Feature flags ────────────────────────────────────────
export interface FeatureFlag {
  key: string
  enabled: boolean
  description: string
  updatedAt: Date
}

const toFlag = (row: {
  key: string
  enabled: boolean
  description: string
  updatedAt: Date
}): FeatureFlag => ({
  key: row.key,
  enabled: row.enabled,
  description: row.description,
  updatedAt: row.updatedAt,
})

export async function listFeatureFlags(ctx: Ctx): Promise<FeatureFlag[]> {
  requireStaff(ctx.actor, canManageFeatureFlags)
  const rows = await repo.listFlags(ctx.db)
  return rows.map(toFlag)
}

export async function setFeatureFlag(
  ctx: Ctx,
  input: { key: string; enabled: boolean },
): Promise<FeatureFlag> {
  requireStaff(ctx.actor, canManageFeatureFlags)

  return inTransaction(ctx, async (tx) => {
    const before = await repo.getFlagForUpdate(tx.db, input.key)
    if (!before) throw new NotFoundError('FEATURE_FLAG_NOT_FOUND', { key: input.key })
    if (before.enabled === input.enabled) return toFlag(before)

    const after = await repo.updateFlag(tx.db, input.key, input.enabled, actorUserId(tx.actor))
    if (!after) throw new NotFoundError('FEATURE_FLAG_NOT_FOUND', { key: input.key })

    await writeAudit(tx, {
      action: 'feature_flag.update',
      targetType: 'feature_flag',
      targetId: input.key,
      before: { enabled: before.enabled },
      after: { enabled: after.enabled },
    })
    await tx.events.emit('feature_flag.updated', { key: input.key, enabled: input.enabled })
    tx.afterCommit(async () => {
      flagCache.clear()
      await tx.cache.invalidate([cacheTags.featureFlags])
    })
    return toFlag(after)
  })
}

const FLAG_TTL_MS = 60_000
const flagCache = new Map<string, { enabled: boolean; expiresAt: number }>()

/**
 * Cached for 60 s per server instance (docs/03 §7). Unknown flags are off.
 * Readable by any actor: it only reveals whether a feature is on.
 */
export async function isFeatureEnabled(ctx: Ctx, key: string): Promise<boolean> {
  const hit = flagCache.get(key)
  const nowMs = ctx.now.getTime()
  if (hit && hit.expiresAt > nowMs) return hit.enabled
  const rows = await repo.listFlags(ctx.db)
  for (const row of rows)
    flagCache.set(row.key, { enabled: row.enabled, expiresAt: nowMs + FLAG_TTL_MS })
  return rows.find((r) => r.key === key)?.enabled ?? false
}

/** Test helper: forget cached flag values. */
export const resetFeatureFlagCache = (): void => flagCache.clear()

// ── Settings ─────────────────────────────────────────────
/** Reads a platform setting and validates it with the caller's parser (e.g. a Zod `parse`). */
export async function getSetting<T>(
  ctx: Ctx,
  key: string,
  parse: (value: unknown) => T,
): Promise<T | undefined> {
  const value = await repo.getSettingValue(ctx.db, key)
  return value === undefined ? undefined : parse(value)
}

// ── Idempotency ──────────────────────────────────────────
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export type IdempotencyClaim = { kind: 'new' } | { kind: 'replay'; response: unknown }

/**
 * Claims a client-supplied key for one request (docs/06 §3.5). Same key + same input after
 * completion → replay the stored response. Same key + different input → IDEMPOTENCY_CONFLICT.
 * `key` must already be namespaced by the caller (procedure + actor) to avoid cross-user reuse.
 */
export async function claimIdempotencyKey(
  ctx: Ctx,
  input: { key: string; scope: string; requestHash: string },
): Promise<IdempotencyClaim> {
  const expiresAt = new Date(ctx.now.getTime() + IDEMPOTENCY_TTL_MS)
  if (await repo.claimIdempotencyKey(ctx.db, { ...input, expiresAt })) return { kind: 'new' }

  const existing = await repo.getIdempotencyKey(ctx.db, input.key)
  if (!existing || existing.expiresAt <= ctx.now) {
    await repo.deleteIdempotencyKey(ctx.db, input.key)
    if (await repo.claimIdempotencyKey(ctx.db, { ...input, expiresAt })) return { kind: 'new' }
    throw new ConflictError('IDEMPOTENCY_CONFLICT', { reason: 'in_progress' })
  }
  if (existing.requestHash !== input.requestHash || existing.scope !== input.scope) {
    throw new ConflictError('IDEMPOTENCY_CONFLICT', { reason: 'different_request' })
  }
  if (existing.response === null) {
    throw new ConflictError('IDEMPOTENCY_CONFLICT', { reason: 'in_progress' })
  }
  return { kind: 'replay', response: existing.response }
}

export async function completeIdempotencyKey(ctx: Ctx, key: string, response: unknown) {
  await repo.storeIdempotentResponse(ctx.db, key, response)
}

/** Frees the key after a failed request so the client can retry with the same key. */
export async function releaseIdempotencyKey(ctx: Ctx, key: string) {
  await repo.deleteIdempotencyKey(ctx.db, key)
}

// ── Outbox dispatch ──────────────────────────────────────
export interface OutboxMessage {
  id: string
  name: string
  payload: unknown
}

export interface DispatchResult {
  sent: number
  failed: number
}

const LEASE_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 10

/**
 * Leases due outbox rows in a short transaction, sends them outside it, then marks them.
 * `send` must be idempotent per message id (Inngest dedupes on event id).
 */
export async function dispatchOutbox(
  ctx: Ctx,
  send: (messages: ReadonlyArray<OutboxMessage>) => Promise<void>,
  options: { limit?: number } = {},
): Promise<DispatchResult> {
  if (!canDispatchOutbox(ctx.actor)) throw new ForbiddenError()
  const limit = options.limit ?? 100

  const leased = await inTransaction(ctx, (tx) =>
    repo.leaseOutbox(tx.db, ctx.now, limit, new Date(ctx.now.getTime() + LEASE_MS)),
  )
  if (leased.length === 0) return { sent: 0, failed: 0 }

  const messages = leased.map((r) => ({ id: r.id, name: r.eventName, payload: r.payload }))
  const ids = messages.map((m) => m.id)
  try {
    await send(messages)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await repo.recordOutboxError(ctx.db, ids, message, MAX_ATTEMPTS)
    log('error', 'outbox send failed', {
      requestId: ctx.requestId,
      module: 'admin',
      count: ids.length,
    })
    return { sent: 0, failed: ids.length }
  }
  await repo.markOutboxSent(ctx.db, ids, new Date())
  return { sent: ids.length, failed: 0 }
}

import { type DbOrTx, schema } from '@tokslearn/db'
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm'

const { auditLog, featureFlags, idempotencyKeys, outbox, settings } = schema

// ── Health ───────────────────────────────────────────────
export async function pingDatabase(db: DbOrTx): Promise<void> {
  await db.execute(sql`select 1`)
}

// ── Feature flags ────────────────────────────────────────
export const listFlags = (db: DbOrTx) =>
  db.select().from(featureFlags).orderBy(asc(featureFlags.key))

export async function getFlagForUpdate(db: DbOrTx, key: string) {
  const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).for('update')
  return row
}

export async function updateFlag(
  db: DbOrTx,
  key: string,
  enabled: boolean,
  updatedBy: string | null,
) {
  const [row] = await db
    .update(featureFlags)
    .set({ enabled, updatedBy })
    .where(eq(featureFlags.key, key))
    .returning()
  return row
}

// ── Settings ─────────────────────────────────────────────
export async function getSettingValue(db: DbOrTx, key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
  return row?.value
}

// ── Audit log (append-only) ──────────────────────────────
export type AuditInsert = typeof auditLog.$inferInsert

export async function insertAudit(db: DbOrTx, entry: AuditInsert): Promise<void> {
  await db.insert(auditLog).values(entry)
}

// ── Idempotency keys ─────────────────────────────────────
export async function claimIdempotencyKey(
  db: DbOrTx,
  row: { key: string; scope: string; requestHash: string; expiresAt: Date },
): Promise<boolean> {
  const inserted = await db
    .insert(idempotencyKeys)
    .values(row)
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key })
  return inserted.length === 1
}

export async function getIdempotencyKey(db: DbOrTx, key: string) {
  const [row] = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key))
  return row
}

export async function deleteIdempotencyKey(db: DbOrTx, key: string): Promise<void> {
  await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key))
}

export async function storeIdempotentResponse(
  db: DbOrTx,
  key: string,
  response: unknown,
): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ response: response ?? null })
    .where(eq(idempotencyKeys.key, key))
}

// ── Outbox ───────────────────────────────────────────────
/** Locks due rows and pushes their `available_at` forward so parallel sweepers skip them. */
export async function leaseOutbox(db: DbOrTx, now: Date, limit: number, leaseUntil: Date) {
  const rows = await db
    .select({ id: outbox.id, eventName: outbox.eventName, payload: outbox.payload })
    .from(outbox)
    .where(and(eq(outbox.status, 'pending'), lte(outbox.availableAt, now)))
    .orderBy(asc(outbox.availableAt))
    .limit(limit)
    .for('update', { skipLocked: true })
  if (rows.length > 0) {
    await db
      .update(outbox)
      .set({ availableAt: leaseUntil, attempts: sql`${outbox.attempts} + 1` })
      .where(
        inArray(
          outbox.id,
          rows.map((r) => r.id),
        ),
      )
  }
  return rows
}

export async function markOutboxSent(db: DbOrTx, ids: ReadonlyArray<string>, now: Date) {
  if (ids.length === 0) return
  await db
    .update(outbox)
    .set({ status: 'sent', sentAt: now, lastError: null })
    .where(inArray(outbox.id, [...ids]))
}

/** Records the error; rows that used up their attempts become `failed` for manual review. */
export async function recordOutboxError(
  db: DbOrTx,
  ids: ReadonlyArray<string>,
  error: string,
  maxAttempts: number,
) {
  if (ids.length === 0) return
  await db
    .update(outbox)
    .set({
      lastError: error.slice(0, 2000),
      status: sql`case when ${outbox.attempts} >= ${maxAttempts} then 'failed'::outbox_status else ${outbox.status} end`,
    })
    .where(inArray(outbox.id, [...ids]))
}

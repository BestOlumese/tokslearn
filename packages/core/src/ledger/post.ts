import { publicId, schema } from '@tokslearn/db'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { isUser } from '../kernel/actor'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { DomainError } from '../kernel/errors'
import { log } from '../kernel/logger'
import { describeAccount, isDebitNormal } from './accounts'

// ledger.post (docs/08 §5). The only way money moves in the books. Guarantees:
// - balanced: Σ debits = Σ credits, every line > 0, at least two lines;
// - idempotent: the same key returns the existing entry, even under concurrent calls;
// - one currency per entry (NGN in v1);
// - balances change in the same transaction, locking rows in account-id order (no deadlocks).

const { ledgerAccounts, journalEntries, journalLines, accountBalances } = schema

export type JournalKind =
  | 'sale'
  | 'refund'
  | 'release'
  | 'payout'
  | 'payout_reversal'
  | 'chargeback'
  | 'settlement'
  | 'fee'
  | 'adjustment'

export type LedgerLine =
  | { account: string; debit: bigint; credit?: never }
  | { account: string; credit: bigint; debit?: never }

export interface PostInput {
  kind: JournalKind
  ref: { type: string; id: string }
  idempotencyKey: string
  description?: string
  lines: ReadonlyArray<LedgerLine>
}

export interface PostedEntry {
  entryId: string
  publicId: string
  /** False when the idempotency key already existed and nothing new was written. */
  created: boolean
}

/** Never shown to users (docs/21): a bug upstream built an entry that can't be posted. */
export class LedgerError extends DomainError {
  constructor(reason: string, details: Record<string, unknown> = {}) {
    super('LEDGER_UNBALANCED', { reason, ...details }, `ledger: ${reason}`)
  }
}

/** Checks an entry before touching the database. Exported for unit tests. */
export function validateLines(lines: ReadonlyArray<LedgerLine>): void {
  if (lines.length < 2) throw new LedgerError('an entry needs at least two lines')
  let debits = 0n
  let credits = 0n
  for (const line of lines) {
    const amount = line.debit ?? line.credit
    if (typeof amount !== 'bigint') throw new LedgerError('line without an amount')
    if (line.debit !== undefined && line.credit !== undefined) {
      throw new LedgerError('a line is either a debit or a credit')
    }
    if (amount <= 0n) throw new LedgerError('lines must be positive', { account: line.account })
    if (!describeAccount(line.account)) {
      throw new LedgerError('unknown account', { account: line.account })
    }
    if (line.debit !== undefined) debits += amount
    else credits += amount
  }
  if (debits !== credits) {
    throw new LedgerError('debits and credits differ', {
      debits: debits.toString(),
      credits: credits.toString(),
    })
  }
}

async function ensureAccounts(ctx: Ctx, codes: ReadonlyArray<string>) {
  const unique = [...new Set(codes)]
  await ctx.db
    .insert(ledgerAccounts)
    .values(
      unique.map((code) => {
        const d = describeAccount(code)
        if (!d) throw new LedgerError('unknown account', { account: code })
        return { code, type: d.type, ownerId: d.ownerId, currency: 'NGN' }
      }),
    )
    .onConflictDoNothing({ target: ledgerAccounts.code })
  const rows = await ctx.db
    .select({ id: ledgerAccounts.id, code: ledgerAccounts.code, type: ledgerAccounts.type })
    .from(ledgerAccounts)
    .where(inArray(ledgerAccounts.code, unique))
  return new Map(rows.map((r) => [r.code, r]))
}

/**
 * Posts one journal entry. Runs inside the caller's transaction when there is one (it must be,
 * for sale/refund entries that go with status changes), else in its own.
 */
export async function post(ctx: Ctx, input: PostInput): Promise<PostedEntry> {
  validateLines(input.lines)
  return inTransaction(ctx, async (tx) => {
    const posted = publicId('JE', 10)
    // ON CONFLICT DO NOTHING: a concurrent post with the same key waits for the other
    // transaction, then inserts nothing, and we return the entry it wrote.
    const [entry] = await tx.db
      .insert(journalEntries)
      .values({
        publicId: posted,
        kind: input.kind,
        refType: input.ref.type,
        refId: input.ref.id,
        description: input.description ?? null,
        currency: 'NGN',
        postedAt: tx.now,
        postedByKind: tx.actor.kind,
        postedById: isUser(tx.actor) ? tx.actor.userId : null,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing({ target: journalEntries.idempotencyKey })
      .returning({ id: journalEntries.id, publicId: journalEntries.publicId })

    if (!entry) {
      const [existing] = await tx.db
        .select({ id: journalEntries.id, publicId: journalEntries.publicId })
        .from(journalEntries)
        .where(eq(journalEntries.idempotencyKey, input.idempotencyKey))
      if (!existing) throw new LedgerError('idempotency key conflict without an entry')
      return { entryId: existing.id, publicId: existing.publicId, created: false }
    }

    const accounts = await ensureAccounts(
      tx,
      input.lines.map((l) => l.account),
    )
    const lines = input.lines.map((l) => {
      const account = accounts.get(l.account)
      if (!account) throw new LedgerError('account missing after insert', { account: l.account })
      const debit = l.debit !== undefined
      const amount = (l.debit ?? l.credit) as bigint
      // Change in the account's normal direction.
      const delta = debit === isDebitNormal(account.type) ? amount : -amount
      return { account, debit, amount, delta }
    })

    await tx.db.insert(journalLines).values(
      lines.map((l) => ({
        entryId: entry.id,
        accountId: l.account.id,
        direction: l.debit ? ('debit' as const) : ('credit' as const),
        amountKobo: l.amount,
      })),
    )

    // Balance rows: create missing, then lock all in id order before updating.
    const deltas = new Map<string, bigint>()
    for (const l of lines) deltas.set(l.account.id, (deltas.get(l.account.id) ?? 0n) + l.delta)
    const ids = [...deltas.keys()].sort()
    await tx.db
      .insert(accountBalances)
      .values(ids.map((accountId) => ({ accountId })))
      .onConflictDoNothing({ target: accountBalances.accountId })
    await tx.db
      .select({ id: accountBalances.accountId })
      .from(accountBalances)
      .where(inArray(accountBalances.accountId, ids))
      .orderBy(asc(accountBalances.accountId))
      .for('update')
    for (const id of ids) {
      const delta = deltas.get(id) ?? 0n
      if (delta === 0n) continue
      await tx.db
        .update(accountBalances)
        .set({
          balanceKobo: sql`${accountBalances.balanceKobo} + ${delta}`,
          version: sql`${accountBalances.version} + 1`,
        })
        .where(and(eq(accountBalances.accountId, id)))
    }

    log('info', 'ledger entry posted', {
      requestId: tx.requestId,
      kind: input.kind,
      entry: entry.publicId,
      ref: `${input.ref.type}:${input.ref.id}`,
    })
    return { entryId: entry.id, publicId: entry.publicId, created: true }
  })
}

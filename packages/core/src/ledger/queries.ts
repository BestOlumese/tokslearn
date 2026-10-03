import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'
import type { JournalKind } from './post'

// Ledger reads: balances, entries for a reference (order, payout…), and the integrity check the
// nightly job runs (docs/05 §5). Callers authorize; these functions don't know who is asking.

const { ledgerAccounts, journalEntries, journalLines, accountBalances } = schema

/** Balances by account code in each account's normal direction; unknown codes read as 0. */
export async function balances(
  ctx: Ctx,
  codes: ReadonlyArray<string>,
): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>(codes.map((c) => [c, 0n]))
  if (codes.length === 0) return out
  const rows = await ctx.db
    .select({ code: ledgerAccounts.code, balance: accountBalances.balanceKobo })
    .from(ledgerAccounts)
    .innerJoin(accountBalances, eq(accountBalances.accountId, ledgerAccounts.id))
    .where(inArray(ledgerAccounts.code, [...codes]))
  for (const r of rows) out.set(r.code, r.balance)
  return out
}

/**
 * Debits and credits on some accounts in `[from, to)`, by entry kind (statements, "paid this
 * year"). Amounts are positive; the caller knows which side means what for its account.
 */
export async function movements(
  ctx: Ctx,
  input: { codes: ReadonlyArray<string>; from: Date; to: Date },
): Promise<Array<{ code: string; kind: JournalKind; debit: bigint; credit: bigint }>> {
  if (input.codes.length === 0) return []
  const rows = await ctx.db
    .select({
      code: ledgerAccounts.code,
      kind: journalEntries.kind,
      debit: sql<string>`coalesce(sum(${journalLines.amountKobo}) filter (where ${journalLines.direction} = 'debit'), 0)::text`,
      credit: sql<string>`coalesce(sum(${journalLines.amountKobo}) filter (where ${journalLines.direction} = 'credit'), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(
      and(
        inArray(ledgerAccounts.code, [...input.codes]),
        sql`${journalEntries.postedAt} >= ${input.from}`,
        lt(journalEntries.postedAt, input.to),
      ),
    )
    .groupBy(ledgerAccounts.code, journalEntries.kind)
  return rows.map((r) => ({ ...r, debit: BigInt(r.debit), credit: BigInt(r.credit) }))
}

export async function balanceOf(ctx: Ctx, code: string): Promise<bigint> {
  return (await balances(ctx, [code])).get(code) ?? 0n
}

export interface JournalEntryView {
  id: string
  publicId: string
  kind: JournalKind
  refType: string
  refId: string
  description: string | null
  postedAt: Date
  lines: Array<{ id: string; account: string; direction: 'debit' | 'credit'; amountKobo: bigint }>
}

async function withLines(
  ctx: Ctx,
  entries: Array<Omit<JournalEntryView, 'lines'>>,
): Promise<JournalEntryView[]> {
  if (entries.length === 0) return []
  const lines = await ctx.db
    .select({
      id: journalLines.id,
      entryId: journalLines.entryId,
      account: ledgerAccounts.code,
      direction: journalLines.direction,
      amountKobo: journalLines.amountKobo,
    })
    .from(journalLines)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(
      inArray(
        journalLines.entryId,
        entries.map((e) => e.id),
      ),
    )
    .orderBy(asc(journalLines.createdAt), asc(journalLines.id))
  return entries.map((e) => ({
    ...e,
    lines: lines.filter((l) => l.entryId === e.id).map(({ entryId: _e, ...l }) => l),
  }))
}

const entryColumns = {
  id: journalEntries.id,
  publicId: journalEntries.publicId,
  kind: journalEntries.kind,
  refType: journalEntries.refType,
  refId: journalEntries.refId,
  description: journalEntries.description,
  postedAt: journalEntries.postedAt,
}

/** Every entry posted for one reference (e.g. an order), oldest first. */
export async function entriesFor(
  ctx: Ctx,
  ref: { type: string; id: string },
): Promise<JournalEntryView[]> {
  const rows = await ctx.db
    .select(entryColumns)
    .from(journalEntries)
    .where(and(eq(journalEntries.refType, ref.type), eq(journalEntries.refId, ref.id)))
    .orderBy(asc(journalEntries.postedAt), asc(journalEntries.id))
  return withLines(ctx, rows)
}

/** Newest entries first, cursor-paged by (posted_at, id). */
export async function listEntries(
  ctx: Ctx,
  input: { kind?: JournalKind | undefined; cursor?: string | undefined; limit: number },
): Promise<{ items: JournalEntryView[]; nextCursor: string | null }> {
  const after = decodeCursor(input.cursor)
  const rows = await ctx.db
    .select(entryColumns)
    .from(journalEntries)
    .where(
      and(
        input.kind ? eq(journalEntries.kind, input.kind) : undefined,
        after
          ? or(
              lt(journalEntries.postedAt, after.at),
              and(eq(journalEntries.postedAt, after.at), lt(journalEntries.id, after.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(journalEntries.postedAt), desc(journalEntries.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  const last = page.at(-1)
  return {
    items: await withLines(ctx, page),
    nextCursor: rows.length > input.limit && last ? encodeCursor(last.postedAt, last.id) : null,
  }
}

const encodeCursor = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
function decodeCursor(cursor: string | undefined) {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const at = new Date(iso ?? '')
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null
}

export interface LedgerIntegrityReport {
  ok: boolean
  /** Entries whose lines don't balance. */
  unbalancedEntries: string[]
  /** Accounts whose cached balance differs from the sum of their lines. */
  balanceMismatches: Array<{ account: string; cached: string; fromLines: string }>
}

/** docs/05 §5 ledger checks. Read-only; the job reports failures. */
export async function checkLedgerIntegrity(ctx: Ctx): Promise<LedgerIntegrityReport> {
  const unbalanced = await ctx.db.execute(sql`
    select e.public_id as id
    from ${journalEntries} e
    join ${journalLines} l on l.entry_id = e.id
    group by e.id, e.public_id
    having sum(case when l.direction = 'debit' then l.amount_kobo else -l.amount_kobo end) <> 0
       or count(*) < 2`)
  const mismatches = await ctx.db.execute(sql`
    select a.code,
           coalesce(b.balance_kobo, 0)::text as cached,
           coalesce(sum(
             case when (l.direction = 'debit') = (a.type in ('asset', 'expense'))
                  then l.amount_kobo else -l.amount_kobo end), 0)::text as from_lines
    from ${ledgerAccounts} a
    left join ${accountBalances} b on b.account_id = a.id
    left join ${journalLines} l on l.account_id = a.id
    group by a.id, a.code, b.balance_kobo
    having coalesce(b.balance_kobo, 0) <> coalesce(sum(
             case when (l.direction = 'debit') = (a.type in ('asset', 'expense'))
                  then l.amount_kobo else -l.amount_kobo end), 0)`)
  const rowsOf = <T>(r: unknown) => (r as { rows: T[] }).rows
  const unbalancedEntries = rowsOf<{ id: string }>(unbalanced).map((r) => r.id)
  const balanceMismatches = rowsOf<{ code: string; cached: string; from_lines: string }>(
    mismatches,
  ).map((r) => ({ account: r.code, cached: r.cached, fromLines: r.from_lines }))
  return {
    ok: unbalancedEntries.length === 0 && balanceMismatches.length === 0,
    unbalancedEntries,
    balanceMismatches,
  }
}

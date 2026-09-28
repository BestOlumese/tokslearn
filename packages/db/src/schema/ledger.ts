import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, currency, kobo, timestamps, tstz } from '../columns'
import { attributionSourceEnum } from './commerce'
import { user } from './identity'

// Double-entry ledger (docs/05 ledger, docs/08 §5). Append-only: journal entries and lines are
// never updated or deleted (a trigger in the migration enforces it). Corrections are new
// `adjustment` entries. `account_balances` is a cache kept in the same transaction as the lines.

export const accountTypeEnum = pgEnum('ledger_account_type', [
  'asset',
  'liability',
  'revenue',
  'expense',
  'equity',
])

/** e.g. `platform:revenue`, `instructor:{userId}:pending`. Created lazily on first posting. */
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    ...baseColumns(),
    code: text().notNull().unique(),
    type: accountTypeEnum().notNull(),
    ownerId: uuid().references(() => user.id, { onDelete: 'restrict' }),
    currency: currency(),
  },
  (t) => [index().on(t.ownerId)],
)

export const journalKindEnum = pgEnum('journal_kind', [
  'sale',
  'refund',
  'release',
  'payout',
  'payout_reversal',
  'chargeback',
  'settlement',
  'fee',
  'adjustment',
])

export const journalEntries = pgTable(
  'journal_entries',
  {
    ...baseColumns(),
    publicId: text().notNull().unique(),
    kind: journalKindEnum().notNull(),
    refType: text().notNull(),
    refId: uuid().notNull(),
    description: text(),
    currency: currency(),
    postedAt: tstz().notNull(),
    /** 'user' or 'system'; with the user id when a person caused it. */
    postedByKind: text().notNull(),
    postedById: uuid().references(() => user.id, { onDelete: 'restrict' }),
    idempotencyKey: text().notNull().unique(),
  },
  (t) => [index().on(t.refType, t.refId), index().on(t.kind, t.postedAt), index().on(t.postedById)],
)

export const lineDirectionEnum = pgEnum('journal_line_direction', ['debit', 'credit'])

export const journalLines = pgTable(
  'journal_lines',
  {
    ...baseColumns(),
    entryId: uuid()
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'restrict' }),
    accountId: uuid()
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
    direction: lineDirectionEnum().notNull(),
    amountKobo: kobo().notNull(),
  },
  (t) => [
    index().on(t.entryId),
    index().on(t.accountId, t.createdAt),
    check('journal_lines_positive', sql`${t.amountKobo} > 0`),
  ],
)

/**
 * Running balance per account in its normal direction: debits minus credits for assets and
 * expenses, credits minus debits for liabilities, revenue and equity. The lines stay the source
 * of truth; the nightly check compares the two.
 */
export const accountBalances = pgTable('account_balances', {
  accountId: uuid()
    .primaryKey()
    .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
  balanceKobo: kobo().notNull().default(sql`0`),
  version: integer().notNull().default(0),
  ...timestamps(),
})

export const commissionScopeEnum = pgEnum('commission_scope', ['default', 'instructor', 'promo'])

/**
 * Commission as data (docs/08 §3). Resolution: active promo for instructor + source, then
 * instructor override, then the default for the source. Rules are never edited in place: a change
 * ends the old row (`ends_at`) and inserts a new one, so every order item points at the exact rule
 * it used.
 */
export const commissionRules = pgTable(
  'commission_rules',
  {
    ...baseColumns(),
    scope: commissionScopeEnum().notNull(),
    instructorId: uuid().references(() => user.id, { onDelete: 'restrict' }),
    source: attributionSourceEnum().notNull(),
    platformRateBps: integer().notNull(),
    startsAt: tstz().notNull().defaultNow(),
    endsAt: tstz(),
    note: text(),
    createdBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index().on(t.scope, t.source, t.startsAt),
    index().on(t.instructorId, t.source),
    index().on(t.createdBy),
    check('commission_rules_rate', sql`${t.platformRateBps} between 0 and 10000`),
    check(
      'commission_rules_instructor',
      sql`(${t.scope} = 'default') = (${t.instructorId} is null)`,
    ),
    check('commission_rules_window', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    // One open-ended default per source.
    uniqueIndex('commission_rules_one_default')
      .on(t.source)
      .where(sql`${t.scope} = 'default' and ${t.endsAt} is null`),
  ],
)

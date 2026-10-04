import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  char,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, tstz } from '../columns'
import { user } from './identity'
import { payoutAccounts } from './instructors'

// Monthly payout runs (docs/08 §9, ADR-046). A draft is made on the 1st with one item per
// instructor whose available balance reaches the minimum; finance approves it (2FA, a super admin
// co-signs large runs) and transfers go out from the pay day. Items that can't be paid stay in the
// run as `held` with the reason, so finance sees who is waiting and why.

export const payoutRunStatusEnum = pgEnum('payout_run_status', [
  'draft',
  'approved',
  'processing',
  'completed',
  'partially_failed',
])

export const payoutItemStatusEnum = pgEnum('payout_item_status', [
  'queued',
  'held',
  'sending',
  'sent',
  'success',
  'failed',
  'reversed',
])

export const payoutHoldReasonEnum = pgEnum('payout_hold_reason', [
  'no_payout_account',
  'payout_account_in_review',
  'payout_account_on_hold',
  'kyc_not_verified',
  'two_factor_off',
  'suspended',
  'below_minimum',
  'finance_hold',
])

export const payoutRuns = pgTable(
  'payout_runs',
  {
    ...baseColumns(),
    publicId: text().notNull().unique(),
    /** `YYYY-MM`, the Lagos month the run pays in. One run per month. */
    month: char({ length: 7 }).notNull(),
    /** Transfers start on this day (the payout day, moved past weekends and holidays). */
    payOn: tstz().notNull(),
    status: payoutRunStatusEnum().notNull().default('draft'),
    /** Sum of queued item amounts, in kobo, as approved. */
    totalKobo: bigint({ mode: 'bigint' }).notNull().default(sql`0`),
    cosignRequired: boolean().notNull().default(false),
    approvedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    approvedAt: tstz(),
    cosignedBy: uuid().references(() => user.id, { onDelete: 'restrict' }),
    cosignedAt: tstz(),
    startedAt: tstz(),
    finishedAt: tstz(),
    /** Last provider error while sending (e.g. Paystack balance too low), for the run page. */
    lastError: text(),
  },
  (t) => [uniqueIndex().on(t.month), index().on(t.status, t.payOn)],
)

export const payoutItems = pgTable(
  'payout_items',
  {
    ...baseColumns(),
    runId: uuid()
      .notNull()
      .references(() => payoutRuns.id, { onDelete: 'cascade' }),
    instructorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    payoutAccountId: uuid().references(() => payoutAccounts.id, { onDelete: 'restrict' }),
    /** What the run pays: available less anything owed back, as approved. Never paid above. */
    amountKobo: bigint({ mode: 'bigint' }).notNull(),
    /** Owed back from refunds after a payout, taken off this payout (Dr available / Cr receivable). */
    nettedKobo: bigint({ mode: 'bigint' }).notNull().default(sql`0`),
    status: payoutItemStatusEnum().notNull().default('queued'),
    holdReason: payoutHoldReasonEnum(),
    /** Things for finance to look at: first_payout, new_account, over_3x_last. */
    anomalies: text().array().notNull().default(sql`'{}'::text[]`),
    /** Sends so far; each one has its own Paystack reference. */
    attempt: smallint().notNull().default(0),
    reference: text().unique(),
    transferCode: text(),
    feeKobo: bigint({ mode: 'bigint' }),
    failureReason: text(),
    sentAt: tstz(),
    settledAt: tstz(),
  },
  (t) => [
    uniqueIndex().on(t.runId, t.instructorId),
    index().on(t.instructorId, t.createdAt),
    index().on(t.status, t.sentAt),
  ],
)

import { sql } from 'drizzle-orm'
import {
  char,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { baseColumns, timestamps, tstz } from '../columns'
import { user } from './identity'

// Instructor onboarding (docs/05 instructors, docs/07 §5). Never store a BVN, NIN or full account
// number here (CLAUDE.md §1.9): only provider references, results and the last 4 digits.

export const applicationStatusEnum = pgEnum('instructor_application_status', [
  'draft',
  'submitted',
  'in_review',
  'approved',
  'rejected',
])

/** One row per attempt. A rejected applicant reapplies with a new row after 30 days. */
export const instructorApplications = pgTable(
  'instructor_applications',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    status: applicationStatusEnum().notNull().default('draft'),
    /** Last step the applicant finished on /teach/apply (progress is saved per step). */
    step: smallint().notNull().default(0),
    expertise: text(),
    sampleUrl: text(),
    /** "About you" answers (headline, topics, experience…), validated by the contract schema. */
    answers: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    reviewerId: uuid().references(() => user.id, { onDelete: 'restrict' }),
    decisionReason: text(),
    submittedAt: tstz(),
    decidedAt: tstz(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index().on(t.status, t.submittedAt),
    index().on(t.reviewerId),
    // At most one open application per user.
    uniqueIndex('instructor_applications_one_open')
      .on(t.userId)
      .where(sql`${t.status} in ('draft', 'submitted', 'in_review')`),
  ],
)

export const kycMethodEnum = pgEnum('kyc_method', ['bvn', 'nin'])
export const kycStatusEnum = pgEnum('kyc_status', [
  'pending',
  'verified',
  'failed',
  'manual_review',
])

export const kycChecks = pgTable(
  'kyc_checks',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    provider: text().notNull().default('dojah'),
    method: kycMethodEnum().notNull(),
    status: kycStatusEnum().notNull().default('pending'),
    providerReference: text(),
    matchedName: text(),
    /** 0–100 confidence from the selfie match. */
    faceMatchScore: numeric({ precision: 5, scale: 2 }),
    /** Provider result with the ID number, photo and contact fields removed. */
    rawResultRedacted: jsonb().$type<Record<string, unknown>>(),
    verifiedAt: tstz(),
  },
  (t) => [index().on(t.userId, t.createdAt)],
)

export const payoutAccountStatusEnum = pgEnum('payout_account_status', [
  'active',
  'pending_review',
  'disabled',
])

export const payoutAccounts = pgTable(
  'payout_accounts',
  {
    ...baseColumns(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    bankCode: text().notNull(),
    bankName: text().notNull(),
    accountNumberLast4: char({ length: 4 }).notNull(),
    accountName: text().notNull(),
    paystackRecipientCode: text(),
    status: payoutAccountStatusEnum().notNull(),
    /** Token-set similarity of the bank's account name to the verified KYC name, 0–1. */
    nameMatchScore: numeric({ precision: 4, scale: 3 }),
    /** Payouts to a new account start 72 hours after it is added (docs/21 PAYOUT_HOLD_ACTIVE). */
    payoutsAllowedFrom: tstz().notNull(),
    disabledAt: tstz(),
  },
  (t) => [
    index().on(t.userId),
    uniqueIndex('payout_accounts_one_active').on(t.userId).where(sql`${t.status} = 'active'`),
  ],
)

export const instructorProfiles = pgTable('instructor_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => user.id, { onDelete: 'restrict' }),
  slug: text().notNull().unique(),
  displayName: text().notNull(),
  approvedAt: tstz().notNull(),
  /** FK to commission_rules arrives with that table in Phase 4. */
  commissionOverrideId: uuid(),
  /** Denormalized counters refreshed by a job (Phase 10). */
  stats: jsonb().$type<Record<string, number>>().notNull().default({}),
  ...timestamps(),
})

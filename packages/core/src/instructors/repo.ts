import { type DbOrTx, schema } from '@tokslearn/db'
import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from 'drizzle-orm'

// Owns instructor_applications, kyc_checks, payout_accounts, instructor_profiles.
// Foreign reads (docs/03 §3): `user` (name, email) for the review queue and detail.

const { instructorApplications: apps, kycChecks, payoutAccounts, instructorProfiles, user } = schema

export type ApplicationRow = typeof apps.$inferSelect
export type KycRow = typeof kycChecks.$inferSelect
export type PayoutAccountRow = typeof payoutAccounts.$inferSelect

export const OPEN_STATUSES = ['draft', 'submitted', 'in_review'] as const

export async function latestApplication(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(apps)
    .where(eq(apps.userId, userId))
    .orderBy(desc(apps.createdAt), desc(apps.id))
    .limit(1)
  return row
}

export async function getApplication(db: DbOrTx, id: string) {
  const [row] = await db.select().from(apps).where(eq(apps.id, id))
  return row
}

/** Row lock for decisions, so two reviewers can't decide the same application at once. */
export async function lockApplication(db: DbOrTx, id: string) {
  const [row] = await db.select().from(apps).where(eq(apps.id, id)).for('update')
  return row
}

export async function insertApplication(db: DbOrTx, values: typeof apps.$inferInsert) {
  const [row] = await db.insert(apps).values(values).returning()
  if (!row) throw new Error('application insert returned nothing')
  return row
}

export async function updateApplication(
  db: DbOrTx,
  id: string,
  values: Partial<typeof apps.$inferInsert>,
) {
  const [row] = await db.update(apps).set(values).where(eq(apps.id, id)).returning()
  if (!row) throw new Error('application update returned nothing')
  return row
}

export async function previousApplications(db: DbOrTx, userId: string, exceptId: string) {
  return db
    .select({ id: apps.id, status: apps.status, decidedAt: apps.decidedAt })
    .from(apps)
    .where(and(eq(apps.userId, userId), ne(apps.id, exceptId)))
    .orderBy(desc(apps.createdAt))
}

export async function latestKyc(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(kycChecks)
    .where(eq(kycChecks.userId, userId))
    .orderBy(desc(kycChecks.createdAt), desc(kycChecks.id))
    .limit(1)
  return row
}

export async function kycAttempts(db: DbOrTx, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(kycChecks)
    .where(eq(kycChecks.userId, userId))
  return row?.n ?? 0
}

export async function insertKyc(db: DbOrTx, values: typeof kycChecks.$inferInsert) {
  const [row] = await db.insert(kycChecks).values(values).returning()
  if (!row) throw new Error('kyc insert returned nothing')
  return row
}

export async function updateKyc(
  db: DbOrTx,
  id: string,
  values: Partial<typeof kycChecks.$inferInsert>,
) {
  await db.update(kycChecks).set(values).where(eq(kycChecks.id, id))
}

/** The account payouts go to: active, else one waiting for review. */
export async function currentPayoutAccount(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(payoutAccounts)
    .where(and(eq(payoutAccounts.userId, userId), ne(payoutAccounts.status, 'disabled')))
    .orderBy(desc(payoutAccounts.createdAt), desc(payoutAccounts.id))
    .limit(1)
  return row
}

export async function payoutAccountsOf(db: DbOrTx, userId: string) {
  return db
    .select()
    .from(payoutAccounts)
    .where(eq(payoutAccounts.userId, userId))
    .orderBy(desc(payoutAccounts.createdAt), desc(payoutAccounts.id))
}

export async function disableOpenPayoutAccounts(db: DbOrTx, userId: string, at: Date) {
  await db
    .update(payoutAccounts)
    .set({ status: 'disabled', disabledAt: at })
    .where(and(eq(payoutAccounts.userId, userId), ne(payoutAccounts.status, 'disabled')))
}

export async function insertPayoutAccount(db: DbOrTx, values: typeof payoutAccounts.$inferInsert) {
  const [row] = await db.insert(payoutAccounts).values(values).returning()
  if (!row) throw new Error('payout account insert returned nothing')
  return row
}

export async function activatePayoutAccount(db: DbOrTx, id: string) {
  await db
    .update(payoutAccounts)
    .set({ status: 'active' })
    .where(and(eq(payoutAccounts.id, id), eq(payoutAccounts.status, 'pending_review')))
}

export async function profileOf(db: DbOrTx, userId: string) {
  const [row] = await db
    .select()
    .from(instructorProfiles)
    .where(eq(instructorProfiles.userId, userId))
  return row
}

export async function isProfileSlugTaken(db: DbOrTx, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: instructorProfiles.userId })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.slug, slug))
  return Boolean(row)
}

export async function insertProfile(db: DbOrTx, values: typeof instructorProfiles.$inferInsert) {
  await db.insert(instructorProfiles).values(values).onConflictDoNothing()
}

export type QueueFilter = 'open' | 'approved' | 'rejected'

/**
 * Review queue. Open: oldest submitted first (fair queue). Decided: newest decision first.
 * Cursor is `(sortTime, id)`.
 */
export async function listApplications(
  db: DbOrTx,
  input: { filter: QueueFilter; after: { at: Date; id: string } | null; limit: number },
) {
  const open = input.filter === 'open'
  const sortCol = open ? apps.submittedAt : apps.decidedAt
  const statuses: ReadonlyArray<ApplicationRow['status']> =
    input.filter === 'open' ? ['submitted', 'in_review'] : [input.filter]
  const statusCond = inArray(apps.status, [...statuses])
  const after = input.after
  const cursorCond = after
    ? open
      ? or(gt(sortCol, after.at), and(eq(sortCol, after.at), gt(apps.id, after.id)))
      : or(lt(sortCol, after.at), and(eq(sortCol, after.at), lt(apps.id, after.id)))
    : undefined
  return db
    .select({
      id: apps.id,
      userId: apps.userId,
      name: user.name,
      answers: apps.answers,
      status: apps.status,
      submittedAt: apps.submittedAt,
      decidedAt: apps.decidedAt,
    })
    .from(apps)
    .innerJoin(user, eq(user.id, apps.userId))
    .where(and(statusCond, cursorCond))
    .orderBy(open ? asc(sortCol) : desc(sortCol), open ? asc(apps.id) : desc(apps.id))
    .limit(input.limit + 1)
}

export async function latestKycOfMany(db: DbOrTx, userIds: ReadonlyArray<string>) {
  if (userIds.length === 0) return new Map<string, KycRow>()
  const rows = await db
    .selectDistinctOn([kycChecks.userId])
    .from(kycChecks)
    .where(inArray(kycChecks.userId, [...userIds]))
    .orderBy(kycChecks.userId, desc(kycChecks.createdAt), desc(kycChecks.id))
  return new Map(rows.map((r) => [r.userId, r]))
}

export async function currentPayoutOfMany(db: DbOrTx, userIds: ReadonlyArray<string>) {
  if (userIds.length === 0) return new Map<string, PayoutAccountRow>()
  const rows = await db
    .selectDistinctOn([payoutAccounts.userId])
    .from(payoutAccounts)
    .where(and(inArray(payoutAccounts.userId, [...userIds]), ne(payoutAccounts.status, 'disabled')))
    .orderBy(payoutAccounts.userId, desc(payoutAccounts.createdAt), desc(payoutAccounts.id))
  return new Map(rows.map((r) => [r.userId, r]))
}

export async function userSummary(db: DbOrTx, userId: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
  return row
}

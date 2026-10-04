import { schema } from '@tokslearn/db'
import { and, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import { writeAudit } from '../admin'
import { hasRole, type UserActor } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { NotFoundError } from '../kernel/errors'
import { requireStaff } from '../kernel/guards'
import { balances, instructorAccount } from '../ledger'
import { notify } from '../notifications'

// `/admin/instructors` and its detail (docs/20 §6, ADR-047): who teaches, what they sell, what
// they're owed, their bank and identity status, and content-policy strikes (docs/25 §A).
//
// Foreign reads (docs/03 §3): user (identity), courses, course_revisions (courses), enrollments,
// course_rating_stats (reviews), payout_items, payout_runs (commerce).

const {
  instructorProfiles,
  instructorStrikes,
  kycChecks,
  payoutAccounts,
  user,
  courses,
  courseRevisions,
  enrollments,
  courseRatingStats,
  payoutItems,
  payoutRuns,
} = schema

const DAY = 86_400_000
/** docs/25: three strikes within 12 months remove instructor privileges. */
export const STRIKE_LIMIT = 3
const STRIKE_WINDOW_MS = 365 * DAY

const canViewInstructors = (a: UserActor) =>
  hasRole(a, 'reviewer', 'finance', 'support', 'admin', 'super_admin')
const canIssueStrikes = (a: UserActor) => hasRole(a, 'reviewer', 'admin', 'super_admin')
const canRevokeStrikes = (a: UserActor) => hasRole(a, 'admin', 'super_admin')

export interface InstructorRow {
  userId: string
  name: string
  email: string
  slug: string
  approvedAt: Date
  suspended: boolean
  publishedCourses: number
  learners: number
  availableKobo: bigint
  strikes: number
}

async function activeStrikeCounts(ctx: Ctx, ids: ReadonlyArray<string>) {
  const out = new Map<string, number>()
  if (ids.length === 0) return out
  const rows = await ctx.db
    .select({ id: instructorStrikes.instructorId, n: sql<number>`count(*)::int` })
    .from(instructorStrikes)
    .where(
      and(
        inArray(instructorStrikes.instructorId, [...ids]),
        isNull(instructorStrikes.revokedAt),
        gte(instructorStrikes.createdAt, new Date(ctx.now.getTime() - STRIKE_WINDOW_MS)),
      ),
    )
    .groupBy(instructorStrikes.instructorId)
  for (const r of rows) out.set(r.id, r.n)
  return out
}

/** `admin.instructors.list`: search by name, email or profile slug; newest approvals first. */
export async function listInstructors(
  ctx: Ctx,
  input: { q?: string | undefined; page?: number | undefined },
): Promise<{ items: InstructorRow[]; hasMore: boolean }> {
  requireStaff(ctx.actor, canViewInstructors)
  const limit = 50
  const page = Math.max(0, input.page ?? 0)
  const q = input.q?.trim()
  const rows = await ctx.db
    .select({
      userId: instructorProfiles.userId,
      slug: instructorProfiles.slug,
      approvedAt: instructorProfiles.approvedAt,
      name: user.name,
      email: user.email,
      banned: user.banned,
    })
    .from(instructorProfiles)
    .innerJoin(user, eq(user.id, instructorProfiles.userId))
    .where(
      q
        ? or(
            ilike(user.name, `%${q}%`),
            ilike(user.email, `%${q}%`),
            ilike(instructorProfiles.slug, `%${q}%`),
          )
        : undefined,
    )
    .orderBy(desc(instructorProfiles.approvedAt))
    .limit(limit + 1)
    .offset(page * limit)
  const pageRows = rows.slice(0, limit)
  const ids = pageRows.map((r) => r.userId)
  if (ids.length === 0) return { items: [], hasMore: false }
  const [courseCounts, learnerCounts, bal, strikes] = await Promise.all([
    ctx.db
      .select({ id: courses.instructorId, n: sql<number>`count(*)::int` })
      .from(courses)
      .where(and(inArray(courses.instructorId, ids), eq(courses.status, 'published')))
      .groupBy(courses.instructorId),
    ctx.db
      .select({
        id: courses.instructorId,
        n: sql<number>`count(distinct ${enrollments.userId})::int`,
      })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(inArray(courses.instructorId, ids))
      .groupBy(courses.instructorId),
    balances(
      ctx,
      ids.map((id) => instructorAccount(id, 'available')),
    ),
    activeStrikeCounts(ctx, ids),
  ])
  return {
    hasMore: rows.length > limit,
    items: pageRows.map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      slug: r.slug,
      approvedAt: r.approvedAt,
      suspended: Boolean(r.banned),
      publishedCourses: courseCounts.find((c) => c.id === r.userId)?.n ?? 0,
      learners: learnerCounts.find((c) => c.id === r.userId)?.n ?? 0,
      availableKobo: bal.get(instructorAccount(r.userId, 'available')) ?? 0n,
      strikes: strikes.get(r.userId) ?? 0,
    })),
  }
}

export interface StrikeView {
  id: string
  rule: string
  reason: string
  courseId: string | null
  courseTitle: string | null
  issuedByName: string | null
  createdAt: Date
  revokedAt: Date | null
  revokedByName: string | null
  revokeReason: string | null
  /** Counts toward the limit: not revoked and within 12 months. */
  active: boolean
}

export interface InstructorDetail {
  userId: string
  name: string
  email: string
  slug: string
  displayName: string
  approvedAt: Date
  suspended: boolean
  banReason: string | null
  twoFactorEnabled: boolean
  kycStatus: string | null
  payoutAccount: {
    bankName: string
    last4: string
    status: string
    payoutsAllowedFrom: Date
  } | null
  commissionOverrideId: string | null
  courses: Array<{
    id: string
    slug: string
    title: string
    status: string
    priceKobo: bigint
    learners: number
    rating: number | null
    ratings: number
  }>
  money: {
    pendingKobo: bigint
    availableKobo: bigint
    inTransitKobo: bigint
    receivableKobo: bigint
    paidKobo: bigint
  }
  payouts: Array<{ month: string; amountKobo: bigint; status: string; settledAt: Date | null }>
  strikes: StrikeView[]
  activeStrikes: number
}

/** `admin.instructors.get`: everything staff need about one instructor. */
export async function getInstructorDetail(ctx: Ctx, userId: string): Promise<InstructorDetail> {
  requireStaff(ctx.actor, canViewInstructors)
  const [row] = await ctx.db
    .select({ profile: instructorProfiles, person: user })
    .from(instructorProfiles)
    .innerJoin(user, eq(user.id, instructorProfiles.userId))
    .where(eq(instructorProfiles.userId, userId))
  if (!row) throw new NotFoundError('USER_NOT_FOUND')
  const buckets = ['pending', 'available', 'in_transit', 'receivable'] as const
  const [[kyc], [account], courseRows, bal, [paid], payouts, strikeRows] = await Promise.all([
    ctx.db
      .select({ status: kycChecks.status })
      .from(kycChecks)
      .where(eq(kycChecks.userId, userId))
      .orderBy(desc(kycChecks.createdAt))
      .limit(1),
    ctx.db
      .select()
      .from(payoutAccounts)
      .where(
        and(
          eq(payoutAccounts.userId, userId),
          inArray(payoutAccounts.status, ['active', 'pending_review']),
        ),
      )
      .orderBy(desc(payoutAccounts.createdAt))
      .limit(1),
    ctx.db
      .select({
        id: courses.id,
        slug: courses.slug,
        status: courses.status,
        priceKobo: courses.priceKobo,
        title: courseRevisions.title,
        learners: sql<number>`(select count(*)::int from ${enrollments} where ${enrollments.courseId} = ${courses.id})`,
        rating: courseRatingStats.avg,
        ratings: courseRatingStats.count,
      })
      .from(courses)
      .leftJoin(
        courseRevisions,
        sql`${courseRevisions.id} = coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`,
      )
      .leftJoin(courseRatingStats, eq(courseRatingStats.courseId, courses.id))
      .where(and(eq(courses.instructorId, userId), isNull(courses.deletedAt)))
      .orderBy(desc(courses.createdAt)),
    balances(
      ctx,
      buckets.map((b) => instructorAccount(userId, b)),
    ),
    ctx.db
      .select({ total: sql<string>`coalesce(sum(${payoutItems.amountKobo}), 0)::text` })
      .from(payoutItems)
      .where(and(eq(payoutItems.instructorId, userId), eq(payoutItems.status, 'success'))),
    ctx.db
      .select({
        month: payoutRuns.month,
        amountKobo: payoutItems.amountKobo,
        status: payoutItems.status,
        settledAt: payoutItems.settledAt,
      })
      .from(payoutItems)
      .innerJoin(payoutRuns, eq(payoutRuns.id, payoutItems.runId))
      .where(eq(payoutItems.instructorId, userId))
      .orderBy(desc(payoutRuns.month))
      .limit(6),
    listStrikes(ctx, userId),
  ])
  const get = (b: (typeof buckets)[number]) => bal.get(instructorAccount(userId, b)) ?? 0n
  return {
    userId,
    name: row.person.name,
    email: row.person.email,
    slug: row.profile.slug,
    displayName: row.profile.displayName,
    approvedAt: row.profile.approvedAt,
    suspended: Boolean(row.person.banned),
    banReason: row.person.banReason ?? null,
    twoFactorEnabled: Boolean(row.person.twoFactorEnabled),
    kycStatus: kyc?.status ?? null,
    payoutAccount: account
      ? {
          bankName: account.bankName,
          last4: account.accountNumberLast4,
          status: account.status,
          payoutsAllowedFrom: account.payoutsAllowedFrom,
        }
      : null,
    commissionOverrideId: row.profile.commissionOverrideId ?? null,
    courses: courseRows.map((c) => ({
      ...c,
      title: c.title ?? c.slug,
      rating: c.rating === null ? null : Number(c.rating),
      ratings: c.ratings ?? 0,
    })),
    money: {
      pendingKobo: get('pending'),
      availableKobo: get('available'),
      inTransitKobo: get('in_transit'),
      receivableKobo: get('receivable'),
      paidKobo: BigInt(paid?.total ?? '0'),
    },
    payouts,
    strikes: strikeRows,
    activeStrikes: strikeRows.filter((s) => s.active).length,
  }
}

async function listStrikes(ctx: Ctx, instructorId: string): Promise<StrikeView[]> {
  const issuer = schema.user
  const rows = await ctx.db
    .select({ strike: instructorStrikes, issuedByName: issuer.name })
    .from(instructorStrikes)
    .leftJoin(issuer, eq(issuer.id, instructorStrikes.issuedBy))
    .where(eq(instructorStrikes.instructorId, instructorId))
    .orderBy(desc(instructorStrikes.createdAt))
  const ids = [
    ...new Set(rows.flatMap((r) => [r.strike.revokedBy].filter((v): v is string => Boolean(v)))),
  ]
  const courseIds = [
    ...new Set(rows.map((r) => r.strike.courseId).filter((v): v is string => Boolean(v))),
  ]
  const [revokers, titles] = await Promise.all([
    ids.length > 0
      ? ctx.db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, ids))
      : Promise.resolve([]),
    courseIds.length > 0
      ? ctx.db
          .select({ id: courses.id, title: courseRevisions.title })
          .from(courses)
          .leftJoin(
            courseRevisions,
            sql`${courseRevisions.id} = coalesce(${courses.liveRevisionId}, ${courses.draftRevisionId})`,
          )
          .where(inArray(courses.id, courseIds))
      : Promise.resolve([]),
  ])
  const since = ctx.now.getTime() - STRIKE_WINDOW_MS
  return rows.map(({ strike: s, issuedByName }) => ({
    id: s.id,
    rule: s.rule,
    reason: s.reason,
    courseId: s.courseId,
    courseTitle: titles.find((t) => t.id === s.courseId)?.title ?? null,
    issuedByName,
    createdAt: s.createdAt,
    revokedAt: s.revokedAt,
    revokedByName: revokers.find((r) => r.id === s.revokedBy)?.name ?? null,
    revokeReason: s.revokeReason,
    active: !s.revokedAt && s.createdAt.getTime() >= since,
  }))
}

/**
 * `admin.instructors.issueStrike`: reviewers and admins record a content-policy strike with the
 * rule and reason; the instructor is told (in-app and email). Audit-logged.
 */
export async function issueStrike(
  ctx: Ctx,
  input: { instructorId: string; rule: string; reason: string; courseId?: string | undefined },
): Promise<InstructorDetail> {
  const staff = requireStaff(ctx.actor, canIssueStrikes)
  const [person] = await ctx.db
    .select({ name: user.name })
    .from(instructorProfiles)
    .innerJoin(user, eq(user.id, instructorProfiles.userId))
    .where(eq(instructorProfiles.userId, input.instructorId))
  if (!person) throw new NotFoundError('USER_NOT_FOUND')
  if (input.courseId) {
    const [course] = await ctx.db
      .select({ id: courses.id })
      .from(courses)
      .where(and(eq(courses.id, input.courseId), eq(courses.instructorId, input.instructorId)))
    if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  }
  await inTransaction(ctx, async (tx) => {
    const [strike] = await tx.db
      .insert(instructorStrikes)
      .values({
        instructorId: input.instructorId,
        rule: input.rule.trim(),
        reason: input.reason.trim(),
        courseId: input.courseId ?? null,
        issuedBy: staff.userId,
        createdAt: tx.now,
      })
      .returning({ id: instructorStrikes.id })
    if (!strike) throw new Error('strike not saved')
    const active = (await activeStrikeCounts(tx, [input.instructorId])).get(input.instructorId) ?? 0
    await writeAudit(tx, {
      action: 'instructor.strike_issued',
      targetType: 'user',
      targetId: input.instructorId,
      after: { strikeId: strike.id, rule: input.rule, active },
    })
    const app = provider(tx, 'urls').app.replace(/\/$/, '')
    await notify(tx, {
      userId: input.instructorId,
      type: 'instructor.strike',
      title: `A content-policy strike was added to your account (${active} of ${STRIKE_LIMIT})`,
      body: `${input.rule.trim()}: ${input.reason.trim()}`.slice(0, 300),
      link: '/content-policy',
      dedupeKey: `strike:${strike.id}`,
      email: {
        id: 'instructor-strike',
        businessKey: strike.id,
        data: {
          name: person.name.split(/\s+/)[0] || 'there',
          rule: input.rule.trim(),
          reason: input.reason.trim(),
          active,
          limit: STRIKE_LIMIT,
          url: `${app}/content-policy`,
        },
      },
    })
  })
  return getInstructorDetail(ctx, input.instructorId)
}

/** `admin.instructors.revokeStrike`: admins only, with a reason kept on the record. Audit-logged. */
export async function revokeStrike(
  ctx: Ctx,
  input: { strikeId: string; reason: string },
): Promise<InstructorDetail> {
  const staff = requireStaff(ctx.actor, canRevokeStrikes)
  const instructorId = await inTransaction(ctx, async (tx) => {
    const [s] = await tx.db
      .update(instructorStrikes)
      .set({
        revokedAt: tx.now,
        revokedBy: staff.userId,
        revokeReason: input.reason.trim(),
        updatedAt: tx.now,
      })
      .where(and(eq(instructorStrikes.id, input.strikeId), isNull(instructorStrikes.revokedAt)))
      .returning()
    if (!s) throw new NotFoundError('STRIKE_NOT_FOUND')
    await writeAudit(tx, {
      action: 'instructor.strike_revoked',
      targetType: 'user',
      targetId: s.instructorId,
      before: { strikeId: s.id, rule: s.rule },
      after: { reason: input.reason.trim() },
    })
    return s.instructorId
  })
  return getInstructorDetail(ctx, instructorId)
}

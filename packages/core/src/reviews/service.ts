import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getSetting, writeAudit } from '../admin'
import { track } from '../analytics'
import { setCourseRating } from '../catalog'
import { contentProblem } from '../community'
import { learnerDisplayName } from '../enrollments'
import { hasRole, isUser } from '../kernel/actor'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import {
  ForbiddenError,
  NotFoundError,
  RuleViolationError,
  ValidationError,
} from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { sendEmail } from '../notifications'
import {
  BODY_MAX,
  DEFAULT_MIN_LEARNING_MIN,
  DEFAULT_MIN_PROGRESS_PCT,
  type Eligibility,
  eligibility,
  PAGE_SIZE,
  publicAverage,
  REASON_MAX,
  REASON_MIN,
  REPLY_MAX,
  type Stars,
  settingKeys,
  starsFrom,
} from './rules'

// Reviews and ratings (docs/10 §12, docs/20 Phase 9 rows, ADR-040): learners review a course
// once they've done enough of it, instructors reply, anyone signed in marks reviews helpful or
// reports them, staff hide. Every change emits `review.changed`; the rating-stats job recomputes
// `course_rating_stats` and the course's search row.
// Foreign reads (docs/03 §3): courses, course_revisions, course_staff, instructor_profiles,
// enrollments, lesson_progress, user.

const {
  reviews,
  reviewVotes,
  reviewReports,
  courseRatingStats,
  courses,
  courseRevisions,
  courseStaff,
  instructorProfiles,
  enrollments,
  lessonProgress,
  user,
} = schema

type ReviewRow = typeof reviews.$inferSelect

const liveTitle = eq(courseRevisions.id, courses.liveRevisionId)
const numSetting = (v: unknown) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) throw new Error('bad review setting')
  return n
}

async function thresholds(ctx: Ctx) {
  const [pct, minutes] = await Promise.all([
    getSetting(ctx, settingKeys.minProgressPct, numSetting),
    getSetting(ctx, settingKeys.minLearningMin, numSetting),
  ])
  return {
    needPct: pct ?? DEFAULT_MIN_PROGRESS_PCT,
    needMinutes: minutes ?? DEFAULT_MIN_LEARNING_MIN,
  }
}

/** The learner's live enrollment in the course and how far they are, or NOT_ENROLLED. */
async function learnerState(ctx: Ctx, courseId: string, userId: string) {
  const [e] = await ctx.db
    .select({
      id: enrollments.id,
      status: enrollments.status,
      expires: enrollments.accessExpiresAt,
      progressPct: enrollments.progressPct,
    })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), eq(enrollments.userId, userId)))
  const live =
    e &&
    (e.status === 'active' || e.status === 'completed') &&
    (e.expires === null || e.expires > ctx.now)
  if (!e || !live) throw new ForbiddenError('NOT_ENROLLED')
  const [[watched], need] = await Promise.all([
    ctx.db
      .select({ sec: sql<number>`coalesce(sum(${lessonProgress.watchedSec}), 0)::int` })
      .from(lessonProgress)
      .where(and(eq(lessonProgress.courseId, courseId), eq(lessonProgress.userId, userId))),
    thresholds(ctx),
  ])
  return {
    enrollment: e,
    eligibility: eligibility({
      progressPct: e.progressPct,
      watchedSec: watched?.sec ?? 0,
      ...need,
    }),
  }
}

async function publishedCourse(ctx: Ctx, by: { slug: string } | { id: string }) {
  const [c] = await ctx.db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courseRevisions.title,
      instructorId: courses.instructorId,
      status: courses.status,
    })
    .from(courses)
    .innerJoin(courseRevisions, liveTitle)
    .where(
      and(
        'slug' in by ? eq(courses.slug, by.slug) : eq(courses.id, by.id),
        isNull(courses.deletedAt),
      ),
    )
  if (!c) throw new NotFoundError('COURSE_NOT_FOUND')
  return c
}

const changed = (ctx: Ctx, r: { id: string; courseId: string }) =>
  ctx.events.emit('review.changed', { reviewId: r.id, courseId: r.courseId })

// ─── The learner's own review ────────────────────────────────────────────────────────────────

export interface MyReview {
  id: string
  rating: number
  body: string | null
  hidden: boolean
  instructorReply: string | null
  createdAt: Date
  editedAt: Date | null
}

const toMine = (r: ReviewRow): MyReview => ({
  id: r.id,
  rating: r.rating,
  body: r.body,
  hidden: r.status === 'hidden',
  instructorReply: r.instructorReply,
  createdAt: r.createdAt,
  editedAt: r.editedAt,
})

export interface MyReviewPage {
  course: { id: string; slug: string; title: string }
  eligibility: Eligibility
  review: MyReview | null
}

/** `/learn/[courseSlug]/review`: eligibility and the learner's review, if any. */
export async function getMyReview(ctx: Ctx, courseSlug: string): Promise<MyReviewPage> {
  const me = requireUser(ctx.actor)
  const c = await publishedCourse(ctx, { slug: courseSlug })
  const state = await learnerState(ctx, c.id, me.userId)
  const [r] = await ctx.db
    .select()
    .from(reviews)
    .where(
      and(eq(reviews.courseId, c.id), eq(reviews.userId, me.userId), isNull(reviews.deletedAt)),
    )
  return {
    course: { id: c.id, slug: c.slug, title: c.title },
    eligibility: state.eligibility,
    review: r ? toMine(r) : null,
  }
}

function checkBody(body: string | null, accountCreatedAt: Date, now: Date) {
  const text = body?.trim() ?? ''
  if (text.length > BODY_MAX) {
    throw new ValidationError([{ path: 'body', message: `Up to ${BODY_MAX} characters.` }])
  }
  if (text) {
    const problem = contentProblem({ text, linkMarks: 0, accountCreatedAt, now })
    if (problem) throw new RuleViolationError('CONTENT_REJECTED', { problem })
  }
  return text || null
}

/** Writes or edits the learner's review. The instructor hears about new ones by email. */
export async function saveReview(
  ctx: Ctx,
  input: { courseId: string; rating: number; body: string | null },
): Promise<MyReview> {
  const me = requireUser(ctx.actor)
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ValidationError([{ path: 'rating', message: 'Pick 1 to 5 stars.' }])
  }
  const c = await publishedCourse(ctx, { id: input.courseId })
  const state = await learnerState(ctx, c.id, me.userId)
  if (!state.eligibility.eligible) {
    throw new RuleViolationError('REVIEW_NOT_ELIGIBLE', {
      pct: state.eligibility.needPct,
      minutes: state.eligibility.needMinutes,
    })
  }
  const [account] = await ctx.db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, me.userId))
  const body = checkBody(input.body, account?.createdAt ?? ctx.now, ctx.now)

  return inTransaction(ctx, async (tx) => {
    const [existing] = await tx.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.courseId, c.id), eq(reviews.userId, me.userId)))
      .for('update')
    let row: ReviewRow | undefined
    const fresh = !existing || existing.deletedAt !== null
    if (!existing) {
      ;[row] = await tx.db
        .insert(reviews)
        .values({
          courseId: c.id,
          userId: me.userId,
          enrollmentId: state.enrollment.id,
          rating: input.rating,
          body,
        })
        .returning()
    } else if (existing.deletedAt) {
      // Deleted and written again: a new review in the same row.
      await tx.db.delete(reviewVotes).where(eq(reviewVotes.reviewId, existing.id))
      ;[row] = await tx.db
        .update(reviews)
        .set({
          rating: input.rating,
          body,
          enrollmentId: state.enrollment.id,
          deletedAt: null,
          editedAt: null,
          helpfulCount: 0,
          instructorReply: null,
          repliedAt: null,
          repliedBy: null,
          createdAt: tx.now,
        })
        .where(eq(reviews.id, existing.id))
        .returning()
    } else {
      ;[row] = await tx.db
        .update(reviews)
        .set({ rating: input.rating, body, editedAt: tx.now })
        .where(eq(reviews.id, existing.id))
        .returning()
    }
    if (!row) throw new Error('review write returned nothing')
    await changed(tx, row)
    if (fresh) {
      await notifyInstructor(tx, c, row)
      await track(tx, 'review_submitted', { rating: row.rating })
    }
    return toMine(row)
  })
}

async function notifyInstructor(
  ctx: Ctx,
  c: { id: string; title: string; instructorId: string },
  r: ReviewRow,
) {
  const [to] = await ctx.db
    .select({ email: user.email, name: user.name, displayName: instructorProfiles.displayName })
    .from(user)
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, user.id))
    .where(eq(user.id, c.instructorId))
  if (!to) return
  await sendEmail(ctx, {
    id: 'new-review',
    to: to.email,
    businessKey: `${r.id}:${r.createdAt.getTime()}`,
    data: {
      name: (to.displayName ?? to.name).split(/\s+/)[0] ?? to.name,
      courseTitle: c.title,
      rating: r.rating,
      excerpt: r.body
        ? r.body.length > 280
          ? `${r.body.slice(0, 277).trimEnd()}…`
          : r.body
        : null,
      url: `${provider(ctx, 'urls').app.replace(/\/$/, '')}/teach/reviews?course=${c.id}`,
    },
  })
}

export async function deleteMyReview(ctx: Ctx, courseId: string): Promise<void> {
  const me = requireUser(ctx.actor)
  await inTransaction(ctx, async (tx) => {
    const [r] = await tx.db
      .update(reviews)
      .set({ deletedAt: tx.now })
      .where(
        and(
          eq(reviews.courseId, courseId),
          eq(reviews.userId, me.userId),
          isNull(reviews.deletedAt),
        ),
      )
      .returning({ id: reviews.id, courseId: reviews.courseId })
    if (!r) throw new NotFoundError('REVIEW_NOT_FOUND')
    await changed(tx, r)
  })
}

// ─── Public list ─────────────────────────────────────────────────────────────────────────────

export interface PublicReview {
  id: string
  rating: number
  body: string | null
  authorName: string
  /** Every review comes from an enrolment; this says they finished the course. */
  finished: boolean
  helpfulCount: number
  votedByMe: boolean
  mine: boolean
  instructorReply: { body: string; at: Date } | null
  createdAt: Date
  editedAt: Date | null
}

export interface ReviewSummary {
  count: number
  /** Null below 3 reviews (docs/10 §12). */
  avg: number | null
  /** Null below 3 reviews; index 0 is one star. */
  stars: Stars['stars'] | null
}

export interface ReviewPage {
  summary: ReviewSummary
  items: PublicReview[]
  hasMore: boolean
}

const visible = (courseId: string) =>
  and(eq(reviews.courseId, courseId), eq(reviews.status, 'visible'), isNull(reviews.deletedAt))

async function summaryOf(ctx: Ctx, courseId: string): Promise<ReviewSummary> {
  const [s] = await ctx.db
    .select()
    .from(courseRatingStats)
    .where(eq(courseRatingStats.courseId, courseId))
  const count = s?.count ?? 0
  const avg = s?.avg ? Number(s.avg) : null
  const shown = publicAverage({ count, avg })
  return {
    count,
    avg: shown,
    stars: shown === null || !s ? null : [s.stars1, s.stars2, s.stars3, s.stars4, s.stars5],
  }
}

/**
 * A published course's visible reviews: most helpful (then newest) or newest first. Public; a
 * signed-in viewer also learns which ones they marked helpful.
 */
export async function listCourseReviews(
  ctx: Ctx,
  input: { courseId: string; sort: 'helpful' | 'recent'; page: number; pageSize?: number },
): Promise<ReviewPage> {
  const c = await publishedCourse(ctx, { id: input.courseId })
  if (c.status !== 'published' && c.status !== 'unlisted')
    throw new NotFoundError('COURSE_NOT_FOUND')
  const size = Math.min(input.pageSize ?? PAGE_SIZE, 50)
  const me = isUser(ctx.actor) ? ctx.actor.userId : null
  const [summary, rows] = await Promise.all([
    summaryOf(ctx, c.id),
    ctx.db
      .select({
        r: reviews,
        name: user.name,
        finished: sql<boolean>`${enrollments.status} = 'completed'`,
      })
      .from(reviews)
      .innerJoin(user, eq(user.id, reviews.userId))
      .innerJoin(enrollments, eq(enrollments.id, reviews.enrollmentId))
      .where(visible(c.id))
      .orderBy(
        ...(input.sort === 'helpful'
          ? [desc(reviews.helpfulCount), desc(reviews.createdAt)]
          : [desc(reviews.createdAt)]),
        asc(reviews.id),
      )
      .limit(size + 1)
      .offset(Math.max(0, input.page) * size),
  ])
  const page = rows.slice(0, size)
  const voted =
    me && page.length > 0
      ? new Set(
          (
            await ctx.db
              .select({ id: reviewVotes.reviewId })
              .from(reviewVotes)
              .where(
                and(
                  eq(reviewVotes.userId, me),
                  inArray(
                    reviewVotes.reviewId,
                    page.map((x) => x.r.id),
                  ),
                ),
              )
          ).map((v) => v.id),
        )
      : new Set<string>()
  return {
    summary,
    hasMore: rows.length > size,
    items: page.map(({ r, name, finished }) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      authorName: learnerDisplayName(name),
      finished,
      helpfulCount: r.helpfulCount,
      votedByMe: voted.has(r.id),
      mine: r.userId === me,
      instructorReply:
        r.instructorReply && r.repliedAt ? { body: r.instructorReply, at: r.repliedAt } : null,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
    })),
  }
}

async function visibleReview(ctx: Ctx, reviewId: string) {
  const [r] = await ctx.db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.status, 'visible'), isNull(reviews.deletedAt)))
  if (!r) throw new NotFoundError('REVIEW_NOT_FOUND')
  return r
}

/** Marks (or unmarks) a review as helpful. Not your own. */
export async function voteHelpful(
  ctx: Ctx,
  input: { reviewId: string; on: boolean },
): Promise<{ helpfulCount: number; votedByMe: boolean }> {
  const me = requireUser(ctx.actor)
  const r = await visibleReview(ctx, input.reviewId)
  if (r.userId === me.userId) throw new RuleViolationError('REVIEW_OWN')
  return inTransaction(ctx, async (tx) => {
    const delta = input.on
      ? (
          await tx.db
            .insert(reviewVotes)
            .values({ reviewId: r.id, userId: me.userId })
            .onConflictDoNothing()
            .returning({ id: reviewVotes.reviewId })
        ).length
      : -(
          await tx.db
            .delete(reviewVotes)
            .where(and(eq(reviewVotes.reviewId, r.id), eq(reviewVotes.userId, me.userId)))
            .returning({ id: reviewVotes.reviewId })
        ).length
    const [row] = await tx.db
      .update(reviews)
      .set({ helpfulCount: sql`greatest(0, ${reviews.helpfulCount} + ${delta})` })
      .where(eq(reviews.id, r.id))
      .returning({ helpfulCount: reviews.helpfulCount })
    // Cached review lists refresh within minutes; votes don't change the rating, so no event.
    return { helpfulCount: row?.helpfulCount ?? r.helpfulCount, votedByMe: input.on }
  })
}

/** Anyone signed in reports a review once; staff see it in the moderation queue. */
export async function reportReview(
  ctx: Ctx,
  input: { reviewId: string; reason: string },
): Promise<void> {
  const me = requireUser(ctx.actor)
  const reason = input.reason.trim()
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new ValidationError([
      { path: 'reason', message: `Between ${REASON_MIN} and ${REASON_MAX} characters.` },
    ])
  }
  const r = await visibleReview(ctx, input.reviewId)
  if (r.userId === me.userId) throw new RuleViolationError('REVIEW_OWN')
  await ctx.db
    .insert(reviewReports)
    .values({ reviewId: r.id, reporterId: me.userId, reason })
    .onConflictDoNothing()
}

// ─── Studio ──────────────────────────────────────────────────────────────────────────────────

export interface StudioReview {
  id: string
  course: { id: string; title: string; slug: string }
  rating: number
  body: string | null
  authorName: string
  hidden: boolean
  helpfulCount: number
  reply: string | null
  repliedAt: Date | null
  canReply: boolean
  createdAt: Date
  editedAt: Date | null
}

/**
 * Reviews of the courses the viewer teaches (TAs read; the instructor and co-instructors
 * reply), newest first. `unreplied` shows those still waiting for a reply.
 */
export async function listStudioReviews(
  ctx: Ctx,
  input: { courseId?: string | undefined; filter: 'all' | 'unreplied'; page: number },
): Promise<{ items: StudioReview[]; hasMore: boolean }> {
  const me = requireUser(ctx.actor)
  const admin = hasRole(me, 'admin', 'super_admin')
  const rows = await ctx.db
    .select({
      r: reviews,
      name: user.name,
      courseTitle: courseRevisions.title,
      slug: courses.slug,
      instructorId: courses.instructorId,
      role: courseStaff.role,
    })
    .from(reviews)
    .innerJoin(courses, eq(courses.id, reviews.courseId))
    .innerJoin(courseRevisions, liveTitle)
    .innerJoin(user, eq(user.id, reviews.userId))
    .leftJoin(
      courseStaff,
      and(eq(courseStaff.courseId, reviews.courseId), eq(courseStaff.userId, me.userId)),
    )
    .where(
      and(
        sql`(${courses.instructorId} = ${me.userId} or ${courseStaff.userId} is not null)`,
        isNull(reviews.deletedAt),
        input.courseId ? eq(reviews.courseId, input.courseId) : undefined,
        input.filter === 'unreplied' ? isNull(reviews.instructorReply) : undefined,
      ),
    )
    .orderBy(desc(reviews.createdAt), asc(reviews.id))
    .limit(PAGE_SIZE * 2 + 1)
    .offset(Math.max(0, input.page) * PAGE_SIZE * 2)
  const size = PAGE_SIZE * 2
  return {
    hasMore: rows.length > size,
    items: rows.slice(0, size).map(({ r, name, courseTitle, slug, instructorId, role }) => ({
      id: r.id,
      course: { id: r.courseId, title: courseTitle, slug },
      rating: r.rating,
      body: r.body,
      authorName: learnerDisplayName(name),
      hidden: r.status === 'hidden',
      helpfulCount: r.helpfulCount,
      reply: r.instructorReply,
      repliedAt: r.repliedAt,
      canReply: instructorId === me.userId || role === 'co_instructor' || admin,
      createdAt: r.createdAt,
      editedAt: r.editedAt,
    })),
  }
}

/** The instructor's one reply: write, edit, or remove (`body` null). */
export async function replyToReview(
  ctx: Ctx,
  input: { reviewId: string; body: string | null },
): Promise<void> {
  const me = requireUser(ctx.actor)
  const [r] = await ctx.db
    .select({ review: reviews, instructorId: courses.instructorId, role: courseStaff.role })
    .from(reviews)
    .innerJoin(courses, eq(courses.id, reviews.courseId))
    .leftJoin(
      courseStaff,
      and(eq(courseStaff.courseId, reviews.courseId), eq(courseStaff.userId, me.userId)),
    )
    .where(and(eq(reviews.id, input.reviewId), isNull(reviews.deletedAt)))
  const teaches = r && (r.instructorId === me.userId || r.role !== null)
  if (!r || !teaches) throw new NotFoundError('REVIEW_NOT_FOUND')
  if (
    r.instructorId !== me.userId &&
    r.role !== 'co_instructor' &&
    !hasRole(me, 'admin', 'super_admin')
  ) {
    throw new ForbiddenError('NOT_COURSE_OWNER')
  }
  const body = input.body?.trim() || null
  if (body && body.length > REPLY_MAX) {
    throw new ValidationError([{ path: 'body', message: `Up to ${REPLY_MAX} characters.` }])
  }
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .update(reviews)
      .set({
        instructorReply: body,
        repliedAt: body ? tx.now : null,
        repliedBy: body ? me.userId : null,
      })
      .where(eq(reviews.id, r.review.id))
    await changed(tx, r.review)
  })
}

// ─── Staff moderation ────────────────────────────────────────────────────────────────────────

const requireStaff = (ctx: Ctx) => {
  const me = requireUser(ctx.actor)
  if (!hasRole(me, 'support', 'admin', 'super_admin')) throw new ForbiddenError('STAFF_ONLY')
  return me
}

export interface ReviewReportView {
  reviewId: string
  courseTitle: string
  courseSlug: string
  rating: number
  body: string | null
  authorName: string
  reason: string
  reports: number
  createdAt: Date
}

/** `/admin/moderation`: reviews with open reports, oldest first. */
export async function listReviewReports(ctx: Ctx): Promise<ReviewReportView[]> {
  requireStaff(ctx)
  const rows = await ctx.db
    .select({
      reviewId: reviewReports.reviewId,
      reason: sql<string>`(array_agg(${reviewReports.reason} order by ${reviewReports.createdAt}))[1]`,
      n: sql<number>`count(*)::int`,
      first: sql<Date>`min(${reviewReports.createdAt})`.mapWith(reviewReports.createdAt),
      rating: reviews.rating,
      body: reviews.body,
      name: user.name,
      courseTitle: courseRevisions.title,
      slug: courses.slug,
    })
    .from(reviewReports)
    .innerJoin(reviews, eq(reviews.id, reviewReports.reviewId))
    .innerJoin(user, eq(user.id, reviews.userId))
    .innerJoin(courses, eq(courses.id, reviews.courseId))
    .innerJoin(courseRevisions, liveTitle)
    .where(and(eq(reviewReports.status, 'open'), isNull(reviews.deletedAt)))
    .groupBy(
      reviewReports.reviewId,
      reviews.rating,
      reviews.body,
      user.name,
      courseRevisions.title,
      courses.slug,
    )
    .orderBy(sql`min(${reviewReports.createdAt})`)
    .limit(100)
  return rows.map((r) => ({
    reviewId: r.reviewId,
    courseTitle: r.courseTitle,
    courseSlug: r.slug,
    rating: r.rating,
    body: r.body,
    authorName: learnerDisplayName(r.name),
    reason: r.reason,
    reports: r.n,
    createdAt: r.first,
  }))
}

/** Staff hide or show a review. Hiding resolves its open reports. Audit-logged. */
export async function setReviewHidden(
  ctx: Ctx,
  input: { reviewId: string; hidden: boolean },
): Promise<void> {
  const me = requireStaff(ctx)
  await inTransaction(ctx, async (tx) => {
    const [r] = await tx.db
      .update(reviews)
      .set(
        input.hidden
          ? { status: 'hidden', hiddenAt: tx.now, hiddenBy: me.userId }
          : { status: 'visible', hiddenAt: null, hiddenBy: null },
      )
      .where(and(eq(reviews.id, input.reviewId), isNull(reviews.deletedAt)))
      .returning({ id: reviews.id, courseId: reviews.courseId })
    if (!r) throw new NotFoundError('REVIEW_NOT_FOUND')
    if (input.hidden) {
      await tx.db
        .update(reviewReports)
        .set({ status: 'resolved', handledBy: me.userId, handledAt: tx.now })
        .where(and(eq(reviewReports.reviewId, r.id), eq(reviewReports.status, 'open')))
    }
    await writeAudit(tx, {
      action: input.hidden ? 'review.hidden' : 'review.shown',
      targetType: 'review',
      targetId: r.id,
      after: { courseId: r.courseId },
    })
    await changed(tx, r)
  })
}

/** Staff: dismiss a review's open reports (it stays up). */
export async function dismissReviewReports(ctx: Ctx, reviewId: string): Promise<void> {
  const me = requireStaff(ctx)
  await inTransaction(ctx, async (tx) => {
    const done = await tx.db
      .update(reviewReports)
      .set({ status: 'dismissed', handledBy: me.userId, handledAt: tx.now })
      .where(and(eq(reviewReports.reviewId, reviewId), eq(reviewReports.status, 'open')))
      .returning({ id: reviewReports.id })
    if (done.length === 0) throw new NotFoundError('REVIEW_NOT_FOUND')
    await writeAudit(tx, {
      action: 'review.reports_dismissed',
      targetType: 'review',
      targetId: reviewId,
    })
  })
}

// ─── Rating stats (the rating-stats job) ─────────────────────────────────────────────────────

/**
 * Recomputes a course's rating from its visible reviews, copies it to the search row and
 * expires the cached course, instructor and listing pages. One run per course at a time.
 */
export async function recomputeRatingStats(ctx: Ctx, courseId: string): Promise<Stars> {
  const rows = await ctx.db
    .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(visible(courseId))
    .groupBy(reviews.rating)
  const s = starsFrom(rows)
  const values = {
    count: s.count,
    avg: s.avg === null ? null : s.avg.toFixed(2),
    stars1: s.stars[0],
    stars2: s.stars[1],
    stars3: s.stars[2],
    stars4: s.stars[3],
    stars5: s.stars[4],
  }
  await inTransaction(ctx, async (tx) => {
    await tx.db
      .insert(courseRatingStats)
      .values({ courseId, ...values })
      .onConflictDoUpdate({
        target: courseRatingStats.courseId,
        set: { ...values, updatedAt: tx.now },
      })
    await setCourseRating(tx, { courseId, avg: s.avg, count: s.count })
  })
  const [c] = await ctx.db
    .select({ slug: courses.slug, instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
  await ctx.cache.invalidate([
    cacheTags.course(courseId),
    ...(c ? [cacheTags.courseSlug(c.slug), cacheTags.instructor(c.instructorId)] : []),
    cacheTags.catalog,
  ])
  return s
}

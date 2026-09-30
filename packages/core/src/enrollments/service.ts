import { schema } from '@tokslearn/db'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { claimSeat } from '../cohorts'
import { hasRole, isUser, type UserActor } from '../kernel/actor'
import { cacheTags } from '../kernel/cache'
import type { Ctx } from '../kernel/ctx'
import { inTransaction, provider } from '../kernel/ctx'
import { NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { publicFileUrl } from '../media'
import { sendEmail } from '../notifications'

// Enrollments (docs/05 enrollments, docs/08 §6). The only answer to "may this person open this
// paid lesson?" is `canAccessCourse` / `canAccessLesson`; every learning surface calls them.
// Foreign reads (docs/03 §3): cohorts (start date for drip), courses, course_revisions, course_staff, lessons, user,
// instructor_profiles, files, lesson_progress.

const {
  enrollments,
  cohorts,
  courses,
  courseRevisions: revisions,
  lessons,
  user,
  instructorProfiles,
  files,
  lessonProgress,
} = schema

export type EnrollmentSource =
  | 'purchase'
  | 'free'
  | 'bundle'
  | 'coupon_100'
  | 'admin_grant'
  | 'subscription'
  | 'organization'

/**
 * Grants (or restores) access. Idempotent per user + course: an active enrollment is left as is,
 * a revoked or expired one becomes active again with the new source. Call inside the
 * transaction that paid for it.
 */
export async function grantEnrollment(
  ctx: Ctx,
  input: {
    userId: string
    courseId: string
    source: EnrollmentSource
    orderItemId?: string | null
    /** The run, for cohort-based courses (docs/10 §9). */
    cohortId?: string | null
  },
): Promise<{ enrollmentId: string; created: boolean }> {
  const [inserted] = await ctx.db
    .insert(enrollments)
    .values({
      userId: input.userId,
      courseId: input.courseId,
      source: input.source,
      orderItemId: input.orderItemId ?? null,
      cohortId: input.cohortId ?? null,
    })
    .onConflictDoNothing({ target: [enrollments.userId, enrollments.courseId] })
    .returning({ id: enrollments.id })
  if (inserted) {
    await ctx.events.emit('enrollment.created', {
      enrollmentId: inserted.id,
      userId: input.userId,
      courseId: input.courseId,
      source: input.source,
    })
    return { enrollmentId: inserted.id, created: true }
  }
  const [existing] = await ctx.db
    .select({ id: enrollments.id, status: enrollments.status })
    .from(enrollments)
    .where(and(eq(enrollments.userId, input.userId), eq(enrollments.courseId, input.courseId)))
  if (!existing) throw new Error('enrollment conflict without a row')
  if (existing.status === 'revoked' || existing.status === 'expired') {
    await ctx.db
      .update(enrollments)
      .set({
        status: 'active',
        source: input.source,
        orderItemId: input.orderItemId ?? null,
        cohortId: input.cohortId ?? null,
        accessExpiresAt: null,
      })
      .where(eq(enrollments.id, existing.id))
    return { enrollmentId: existing.id, created: true }
  }
  return { enrollmentId: existing.id, created: false }
}

/** Ends access, e.g. after a refund (docs/08 §7). */
export async function revokeEnrollment(ctx: Ctx, input: { userId: string; courseId: string }) {
  await ctx.db
    .update(enrollments)
    .set({ status: 'revoked' })
    .where(and(eq(enrollments.userId, input.userId), eq(enrollments.courseId, input.courseId)))
}

const liveEnrollment = (now: Date) =>
  and(
    inArray(enrollments.status, ['active', 'completed']),
    or(isNull(enrollments.accessExpiresAt), sql`${enrollments.accessExpiresAt} > ${now}`),
  )

/** Course ids (of those given) the user is enrolled in right now. */
export async function enrolledCourseIds(
  ctx: Ctx,
  userId: string,
  courseIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  if (courseIds.length === 0) return new Set()
  const rows = await ctx.db
    .select({ courseId: enrollments.courseId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        inArray(enrollments.courseId, [...courseIds]),
        liveEnrollment(ctx.now),
      ),
    )
  return new Set(rows.map((r) => r.courseId))
}

/** "3 h 20 min" / "45 min" for emails. */
export function durationText(sec: number): string {
  const minutes = Math.max(1, Math.round(sec / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`
}

const certificateWords: Readonly<Record<string, string | null>> = {
  none: null,
  completion: 'Finish every lesson to get a certificate employers can check on Tokslearn.',
  exam: 'Pass the final exam to get a certificate employers can check on Tokslearn.',
  external: 'The course prepares you for an external exam; the certificate comes from that body.',
}

const canSeeEveryCourse = (actor: UserActor) => hasRole(actor, 'reviewer', 'admin', 'super_admin')

/**
 * Full access to a course: an active enrollment, the course's instructor or staff, or a reviewer
 * or admin (they check content). Anonymous visitors never have access.
 */
export async function canAccessCourse(ctx: Ctx, courseId: string): Promise<boolean> {
  if (!isUser(ctx.actor)) return false
  const actor = ctx.actor
  if (canSeeEveryCourse(actor)) return true
  // Qualified names on purpose: in a one-table select Drizzle renders columns unqualified, and
  // inside these subqueries "id" would mean the subquery's own table.
  const [row] = await ctx.db
    .select({
      instructorId: courses.instructorId,
      staff: sql<boolean>`exists (select 1 from course_staff cs where cs.course_id = "courses"."id" and cs.user_id = ${actor.userId})`,
      enrolled: sql<boolean>`exists (select 1 from enrollments e where e.course_id = "courses"."id" and e.user_id = ${actor.userId} and e.status in ('active', 'completed') and (e.access_expires_at is null or e.access_expires_at > ${ctx.now}))`,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
  if (!row) return false
  return row.instructorId === actor.userId || row.staff || row.enrolled
}

export type LessonAccessReason =
  | 'preview'
  | 'enrolled'
  | 'teaching'
  | 'staff'
  | 'not_enrolled'
  | 'revoked'
  | 'locked'
  | 'missing'

export interface LessonAccess {
  allowed: boolean
  reason: LessonAccessReason
  /** When a drip-locked lesson opens. */
  unlocksAt: Date | null
  courseId: string | null
}

const DAY_MS = 86_400_000

/**
 * When a lesson opens for one enrollment under the course's drip mode (docs/10 §2). Cohort-
 * relative delays count from the run's start; a learner without a run counts from enrolment.
 */
export function dripUnlocksAt(
  dripMode: 'none' | 'fixed_dates' | 'after_enrollment' | 'cohort_relative',
  lesson: { dripOffsetDays: number | null; dripDate: Date | null },
  enrolledAt: Date,
  cohortStartsAt: Date | null = null,
): Date | null {
  if (dripMode === 'after_enrollment' && lesson.dripOffsetDays) {
    return new Date(enrolledAt.getTime() + lesson.dripOffsetDays * DAY_MS)
  }
  if (dripMode === 'cohort_relative' && lesson.dripOffsetDays) {
    return new Date((cohortStartsAt ?? enrolledAt).getTime() + lesson.dripOffsetDays * DAY_MS)
  }
  if (dripMode === 'fixed_dates' && lesson.dripDate) return lesson.dripDate
  return null
}

/**
 * docs/10 §2 `canAccessLesson`: previews are open to everyone; otherwise an active enrollment,
 * and drip decides when. The course's instructor, its staff, reviewers and admins always get in;
 * only an enrollment makes it `enrolled` (progress, streaks, refund evidence).
 */
export async function lessonAccess(ctx: Ctx, lessonId: string): Promise<LessonAccess> {
  const [row] = await ctx.db
    .select({
      courseId: lessons.courseId,
      isPreview: lessons.isPreview,
      dripOffsetDays: lessons.dripOffsetDays,
      dripDate: lessons.dripDate,
      live: sql<boolean>`${lessons.liveSince} is not null and ${lessons.deletedAt} is null`,
      courseStatus: courses.status,
      dripMode: courses.dripMode,
      instructorId: courses.instructorId,
    })
    .from(lessons)
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .where(eq(lessons.id, lessonId))
  const deny = (reason: LessonAccessReason, courseId: string | null = null): LessonAccess => ({
    allowed: false,
    reason,
    unlocksAt: null,
    courseId,
  })
  if (!row) return deny('missing')
  const ok = (reason: LessonAccessReason): LessonAccess => ({
    allowed: true,
    reason,
    unlocksAt: null,
    courseId: row.courseId,
  })
  const actor = isUser(ctx.actor) ? ctx.actor : null
  const courseLive = row.courseStatus === 'published' || row.courseStatus === 'unlisted'
  const preview = row.live && row.isPreview && courseLive
  if (!actor) {
    if (preview) return ok('preview')
    return deny(row.live ? 'not_enrolled' : 'missing', row.courseId)
  }

  // The enrollment comes first: a learner who is also staff (an admin who bought the course)
  // still builds progress. Staff roles, the instructor and TAs get in without one.
  const [facts] = await ctx.db
    .select({
      staff: sql<boolean>`exists (select 1 from course_staff cs where cs.course_id = ${row.courseId} and cs.user_id = ${actor.userId})`,
      status: enrollments.status,
      enrolledAt: enrollments.createdAt,
      accessExpiresAt: enrollments.accessExpiresAt,
      cohortStartsAt: cohorts.startsAt,
    })
    .from(courses)
    .leftJoin(
      enrollments,
      and(eq(enrollments.courseId, courses.id), eq(enrollments.userId, actor.userId)),
    )
    .leftJoin(cohorts, eq(cohorts.id, enrollments.cohortId))
    .where(eq(courses.id, row.courseId))
  const expired =
    facts?.accessExpiresAt !== null &&
    facts?.accessExpiresAt !== undefined &&
    facts.accessExpiresAt <= ctx.now
  const active = facts?.status === 'active' || facts?.status === 'completed'
  if (facts?.enrolledAt && active && !expired && row.live) {
    // Enrolled means learner, drip included, even for staff: an admin testing a course they
    // bought sees what learners see. Staff who aren't enrolled see everything (below).
    if (preview) return ok('enrolled')
    const unlocksAt = dripUnlocksAt(row.dripMode, row, facts.enrolledAt, facts.cohortStartsAt)
    if (unlocksAt && unlocksAt > ctx.now) {
      // Drip moved later after the learner started: what they opened stays open (ADR-034).
      const [started] = await ctx.db
        .select({ one: sql<number>`1` })
        .from(lessonProgress)
        .where(and(eq(lessonProgress.userId, actor.userId), eq(lessonProgress.lessonId, lessonId)))
      if (started) return ok('enrolled')
      return { allowed: false, reason: 'locked', unlocksAt, courseId: row.courseId }
    }
    return ok('enrolled')
  }
  if (canSeeEveryCourse(actor)) return ok('staff')
  if (row.instructorId === actor.userId) return ok('teaching')
  if (!row.live) return deny('missing', row.courseId)
  if (facts?.staff) return ok('teaching')
  if (preview) return ok('preview')
  if (facts?.status) return deny('revoked', row.courseId)
  return deny('not_enrolled', row.courseId)
}

/** A lesson opens for free previews (live, in a live course) or with course access. */
export async function canAccessLesson(ctx: Ctx, lessonId: string): Promise<boolean> {
  return (await lessonAccess(ctx, lessonId)).allowed
}

/**
 * Enroll in a free course (docs/20 `/courses/[slug]` "Enroll free"). No order, no payment:
 * the course must be live and cost ₦0. Needs a verified email, like buying.
 */
export async function enrollFree(ctx: Ctx, courseId: string, cohortId: string | null = null) {
  const actor = requireUser(ctx.actor)
  if (!actor.emailVerified) throw new RuleViolationError('EMAIL_NOT_VERIFIED')
  const [course] = await ctx.db
    .select({
      id: courses.id,
      slug: courses.slug,
      status: courses.status,
      priceKobo: courses.priceKobo,
      instructorId: courses.instructorId,
      title: revisions.title,
      lessonCount: courses.lessonCount,
      totalDurationSec: courses.totalDurationSec,
      certificateMode: courses.certificateMode,
      cohortBased: courses.cohortBased,
    })
    .from(courses)
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  if (course.status !== 'published' && course.status !== 'unlisted') {
    throw new RuleViolationError('COURSE_UNAVAILABLE')
  }
  if (course.priceKobo !== 0n) throw new RuleViolationError('COURSE_UNAVAILABLE')
  if (course.instructorId === actor.userId) throw new RuleViolationError('OWN_COURSE')
  if (course.cohortBased && !cohortId) {
    throw new RuleViolationError('COHORT_REQUIRED', { course: course.title })
  }

  const result = await inTransaction(ctx, async (tx) => {
    // Free runs still have a capacity: the run is locked and checked in this transaction.
    const run = course.cohortBased && cohortId ? cohortId : null
    if (run) await claimSeat(tx, { userId: actor.userId, courseId: course.id, cohortId: run })
    const granted = await grantEnrollment(tx, {
      userId: actor.userId,
      courseId: course.id,
      source: 'free',
      cohortId: run,
    })
    if (granted.created) {
      const [me] = await tx.db
        .select({ email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, actor.userId))
      if (me) {
        await sendEmail(tx, {
          id: 'enrollment-free',
          to: me.email,
          businessKey: granted.enrollmentId,
          data: {
            name: me.name.split(/\s+/)[0] ?? me.name,
            courseTitle: course.title,
            lessonCount: course.lessonCount,
            duration: course.totalDurationSec > 0 ? durationText(course.totalDurationSec) : null,
            certificate: certificateWords[course.certificateMode] ?? null,
            url: `${provider(tx, 'urls').app}/learn/${course.slug}`,
          },
        })
      }
    }
    return granted
  })
  await ctx.cache.invalidate([cacheTags.userEnrollments(actor.userId)])
  return { ...result, courseSlug: course.slug }
}

export interface MyCourse {
  enrollmentId: string
  courseId: string
  slug: string
  title: string
  instructorName: string
  coverUrl: string | null
  status: 'active' | 'completed'
  progressPct: number
  lessonCount: number
  lastAccessedAt: Date | null
  enrolledAt: Date
}

/**
 * "My learning" (docs/20 `/account`): live enrollments, most recently opened first, then newest.
 * Capped rather than cursor-paged: "last opened" changes as the learner studies, so a cursor over
 * it isn't stable, and learners rarely hold more than a few dozen courses.
 */
export async function listMyCourses(
  ctx: Ctx,
  input: { status?: 'active' | 'completed' | undefined; limit?: number } = {},
): Promise<MyCourse[]> {
  const actor = requireUser(ctx.actor)
  const rows = await ctx.db
    .select({
      enrollmentId: enrollments.id,
      courseId: courses.id,
      slug: courses.slug,
      title: revisions.title,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
      coverKey: files.key,
      status: enrollments.status,
      progressPct: enrollments.progressPct,
      lessonCount: courses.lessonCount,
      lastAccessedAt: enrollments.lastAccessedAt,
      enrolledAt: enrollments.createdAt,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .leftJoin(files, eq(files.id, revisions.coverFileId))
    .where(
      and(
        eq(enrollments.userId, actor.userId),
        input.status ? eq(enrollments.status, input.status) : liveEnrollment(ctx.now),
      ),
    )
    .orderBy(
      sql`${enrollments.lastAccessedAt} desc nulls last`,
      desc(enrollments.createdAt),
      desc(enrollments.id),
    )
    .limit(Math.min(input.limit ?? 100, 200))
  return rows.map(({ coverKey, ...r }) => ({
    ...r,
    status: r.status === 'completed' ? 'completed' : 'active',
    coverUrl: publicFileUrl(ctx, coverKey),
  }))
}

/** How many learners a course has, for instructor views. */
export async function countEnrollments(ctx: Ctx, courseId: string): Promise<number> {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(and(eq(enrollments.courseId, courseId), liveEnrollment(ctx.now)))
  return row?.n ?? 0
}

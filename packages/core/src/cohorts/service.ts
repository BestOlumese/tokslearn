import { schema } from '@tokslearn/db'
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { isFeatureEnabled } from '../admin'
import { reindexCourse } from '../catalog'
import { setCohortBased, studioCourse } from '../courses'
import { dripUnlocksAt, learnerDisplayName } from '../enrollments'
import { cacheTags } from '../kernel/cache'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import {
  type Availability,
  availability,
  type CohortInput,
  type CohortStatus,
  closesAt,
  cohortIssues,
  seatsLeft,
} from './rules'
import { seatsTaken } from './seats'

// Cohort runs (docs/10 §9, docs/20 Phase 8 rows): the studio's runs, the course page's start
// dates, and the learner's cohort home. Behind the `cohorts` feature flag.
// Foreign reads (docs/03 §3): courses, course_revisions, enrollments, user, sections, lessons.

const { cohorts, courses, courseRevisions, enrollments, user, sections, lessons } = schema

type CohortRow = typeof cohorts.$inferSelect

async function requireEnabled(ctx: Ctx) {
  if (!(await isFeatureEnabled(ctx, 'cohorts'))) throw new ForbiddenError('FEATURE_DISABLED')
}

/** After any change: the catalog's "next start date" and the cached course page. */
async function refreshCourse(ctx: Ctx, courseId: string) {
  await reindexCourse(ctx, courseId)
  const [c] = await ctx.db
    .select({ slug: courses.slug })
    .from(courses)
    .where(eq(courses.id, courseId))
  await ctx.cache.invalidate([
    cacheTags.course(courseId),
    ...(c ? [cacheTags.courseSlug(c.slug)] : []),
    cacheTags.catalog,
  ])
}

// ─── Studio ──────────────────────────────────────────────────────────────────────────────────

export interface StudioCohort {
  id: string
  name: string
  startsAt: Date
  endsAt: Date
  enrollOpensAt: Date | null
  enrollClosesAt: Date | null
  capacity: number | null
  status: CohortStatus
  timezone: string
  members: number
  seatsLeft: number | null
  availability: Availability
}

export interface StudioCohorts {
  courseId: string
  /** The `cohorts` feature flag. */
  enabled: boolean
  cohortBased: boolean
  canEdit: boolean
  cohorts: StudioCohort[]
}

async function memberCounts(ctx: Ctx, ids: ReadonlyArray<string>) {
  if (ids.length === 0) return new Map<string, number>()
  const rows = await ctx.db
    .select({ cohortId: enrollments.cohortId, n: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(
      and(
        inArray(enrollments.cohortId, [...ids]),
        inArray(enrollments.status, ['active', 'completed']),
      ),
    )
    .groupBy(enrollments.cohortId)
  return new Map(rows.map((r) => [r.cohortId ?? '', r.n]))
}

export async function getStudioCohorts(ctx: Ctx, courseId: string): Promise<StudioCohorts> {
  const access = await studioCourse(ctx, courseId, 'view')
  const [enabled, [course], rows] = await Promise.all([
    isFeatureEnabled(ctx, 'cohorts'),
    ctx.db
      .select({ cohortBased: courses.cohortBased })
      .from(courses)
      .where(eq(courses.id, courseId)),
    ctx.db
      .select()
      .from(cohorts)
      .where(eq(cohorts.courseId, courseId))
      .orderBy(asc(cohorts.startsAt)),
  ])
  const ids = rows.map((r) => r.id)
  const [members, taken] = await Promise.all([memberCounts(ctx, ids), seatsTaken(ctx, ids)])
  return {
    courseId,
    enabled,
    cohortBased: course?.cohortBased ?? false,
    canEdit: access.canEdit,
    cohorts: rows.map((r) => ({
      id: r.id,
      name: r.name,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      enrollOpensAt: r.enrollOpensAt,
      enrollClosesAt: r.enrollClosesAt,
      capacity: r.capacity,
      status: r.status,
      timezone: r.timezone,
      members: members.get(r.id) ?? 0,
      seatsLeft: seatsLeft(r, taken.get(r.id) ?? 0),
      availability: availability(r, taken.get(r.id) ?? 0, ctx.now),
    })),
  }
}

/** Sell this course by cohort run, or go back to self-paced (docs/10 §9). */
export async function setCohortSelling(
  ctx: Ctx,
  input: { courseId: string; cohortBased: boolean },
): Promise<StudioCohorts> {
  await studioCourse(ctx, input.courseId, 'edit')
  if (input.cohortBased) await requireEnabled(ctx)
  await setCohortBased(ctx, input)
  await refreshCourse(ctx, input.courseId)
  return getStudioCohorts(ctx, input.courseId)
}

function checkInput(input: CohortInput) {
  const issues = cohortIssues(input)
  if (issues.length > 0) throw new RuleViolationError('VALIDATION_FAILED', { issues })
}

export async function createCohort(
  ctx: Ctx,
  input: CohortInput & { courseId: string },
): Promise<StudioCohorts> {
  await studioCourse(ctx, input.courseId, 'edit')
  await requireEnabled(ctx)
  checkInput(input)
  await ctx.db.insert(cohorts).values({
    courseId: input.courseId,
    name: input.name.trim(),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    enrollOpensAt: input.enrollOpensAt,
    enrollClosesAt: input.enrollClosesAt,
    capacity: input.capacity,
  })
  await refreshCourse(ctx, input.courseId)
  return getStudioCohorts(ctx, input.courseId)
}

async function lockedCohort(tx: Ctx, cohortId: string): Promise<CohortRow> {
  const [row] = await tx.db.select().from(cohorts).where(eq(cohorts.id, cohortId)).for('update')
  if (!row) throw new NotFoundError('COHORT_NOT_FOUND')
  await studioCourse(tx, row.courseId, 'edit')
  return row
}

export async function updateCohort(
  ctx: Ctx,
  input: CohortInput & { cohortId: string },
): Promise<StudioCohorts> {
  checkInput(input)
  const courseId = await inTransaction(ctx, async (tx) => {
    const run = await lockedCohort(tx, input.cohortId)
    if (input.capacity !== null) {
      const taken = (await seatsTaken(tx, [run.id])).get(run.id) ?? 0
      if (input.capacity < taken) {
        throw new RuleViolationError('COHORT_CAPACITY_TOO_LOW', { taken })
      }
    }
    await tx.db
      .update(cohorts)
      .set({
        name: input.name.trim(),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        enrollOpensAt: input.enrollOpensAt,
        enrollClosesAt: input.enrollClosesAt,
        capacity: input.capacity,
      })
      .where(eq(cohorts.id, run.id))
    return run.courseId
  })
  await refreshCourse(ctx, courseId)
  return getStudioCohorts(ctx, courseId)
}

/**
 * Publish (open), take back to draft, or cancel a run. Draft and cancel only while nobody has
 * joined or holds a seat: people who paid for a date keep it (close enrolment instead).
 */
export async function setCohortStatus(
  ctx: Ctx,
  input: { cohortId: string; status: CohortStatus },
): Promise<StudioCohorts> {
  const courseId = await inTransaction(ctx, async (tx) => {
    const run = await lockedCohort(tx, input.cohortId)
    if (input.status === 'open') await requireEnabled(tx)
    if (input.status !== 'open' && run.status === 'open') {
      const taken = (await seatsTaken(tx, [run.id])).get(run.id) ?? 0
      if (taken > 0) throw new ConflictError('COHORT_HAS_LEARNERS')
    }
    await tx.db.update(cohorts).set({ status: input.status }).where(eq(cohorts.id, run.id))
    return run.courseId
  })
  await refreshCourse(ctx, courseId)
  return getStudioCohorts(ctx, courseId)
}

// ─── Course page ─────────────────────────────────────────────────────────────────────────────

export interface PublicCohort {
  id: string
  name: string
  startsAt: Date
  endsAt: Date
  closesAt: Date
  opensAt: Date | null
  seatsLeft: number | null
  availability: 'open' | 'full' | 'not_open_yet'
}

/** Runs a buyer can see: published and still taking (or about to take) people, soonest first. */
export async function listCourseCohorts(ctx: Ctx, courseId: string): Promise<PublicCohort[]> {
  const rows = await ctx.db
    .select()
    .from(cohorts)
    .where(
      and(eq(cohorts.courseId, courseId), eq(cohorts.status, 'open'), gt(cohorts.endsAt, ctx.now)),
    )
    .orderBy(asc(cohorts.startsAt))
    .limit(12)
  const taken = await seatsTaken(
    ctx,
    rows.map((r) => r.id),
  )
  const out: PublicCohort[] = []
  for (const r of rows) {
    const state = availability(r, taken.get(r.id) ?? 0, ctx.now)
    if (state !== 'open' && state !== 'full' && state !== 'not_open_yet') continue
    out.push({
      id: r.id,
      name: r.name,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      closesAt: closesAt(r),
      opensAt: r.enrollOpensAt,
      seatsLeft: seatsLeft(r, taken.get(r.id) ?? 0),
      availability: state,
    })
  }
  return out
}

/** The soonest run someone can still join, for the catalog's badge and "starting soon" row. */
export async function nextOpenCohortStart(ctx: Ctx, courseId: string): Promise<Date | null> {
  const runs = await listCourseCohorts(ctx, courseId)
  return runs.find((r) => r.availability !== 'full')?.startsAt ?? null
}

// ─── Learner ─────────────────────────────────────────────────────────────────────────────────

export interface MyCohort {
  course: { id: string; slug: string; title: string }
  cohort: { id: string; name: string; startsAt: Date; endsAt: Date; timezone: string }
  /** `id`: the enrollment, as a stable list key; never a user id. */
  members: Array<{ id: string; name: string; isMe: boolean }>
  memberCount: number
  /** Lessons with a cohort-relative opening date, in course order. */
  schedule: Array<{ lessonId: string; title: string; section: string; opensAt: Date }>
}

/** The cohort home (docs/20 `/learn/[courseSlug]/cohort`), or COHORT_NOT_FOUND without a run. */
export async function getMyCohort(ctx: Ctx, courseSlug: string): Promise<MyCohort> {
  const me = requireUser(ctx.actor)
  const [row] = await ctx.db
    .select({
      courseId: courses.id,
      slug: courses.slug,
      title: courseRevisions.title,
      dripMode: courses.dripMode,
      enrolledAt: enrollments.createdAt,
      cohort: cohorts,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(courseRevisions, eq(courseRevisions.id, courses.liveRevisionId))
    .innerJoin(cohorts, eq(cohorts.id, enrollments.cohortId))
    .where(
      and(
        eq(courses.slug, courseSlug),
        eq(enrollments.userId, me.userId),
        inArray(enrollments.status, ['active', 'completed']),
      ),
    )
  if (!row) throw new NotFoundError('COHORT_NOT_FOUND')

  const [memberRows, lessonRows] = await Promise.all([
    ctx.db
      .select({ id: enrollments.id, userId: enrollments.userId, name: user.name })
      .from(enrollments)
      .innerJoin(user, eq(user.id, enrollments.userId))
      .where(
        and(
          eq(enrollments.cohortId, row.cohort.id),
          inArray(enrollments.status, ['active', 'completed']),
        ),
      )
      .orderBy(asc(enrollments.createdAt))
      .limit(500),
    row.dripMode === 'cohort_relative'
      ? ctx.db
          .select({
            id: lessons.id,
            title: lessons.title,
            section: sections.title,
            dripOffsetDays: lessons.dripOffsetDays,
            dripDate: lessons.dripDate,
          })
          .from(lessons)
          .innerJoin(sections, eq(sections.id, lessons.sectionId))
          .where(
            and(
              eq(lessons.courseId, row.courseId),
              isNotNull(lessons.liveSince),
              isNull(lessons.deletedAt),
              isNotNull(lessons.dripOffsetDays),
            ),
          )
          .orderBy(asc(sections.position), asc(lessons.position))
      : Promise.resolve([]),
  ])
  const schedule = lessonRows.flatMap((l) => {
    const opensAt = dripUnlocksAt('cohort_relative', l, row.enrolledAt, row.cohort.startsAt)
    return opensAt ? [{ lessonId: l.id, title: l.title, section: l.section, opensAt }] : []
  })
  return {
    course: { id: row.courseId, slug: row.slug, title: row.title },
    cohort: {
      id: row.cohort.id,
      name: row.cohort.name,
      startsAt: row.cohort.startsAt,
      endsAt: row.cohort.endsAt,
      timezone: row.cohort.timezone,
    },
    members: memberRows.map((m) => ({
      id: m.id,
      name: learnerDisplayName(m.name),
      isMe: m.userId === me.userId,
    })),
    memberCount: memberRows.length,
    schedule,
  }
}

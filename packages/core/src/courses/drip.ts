import { schema } from '@tokslearn/db'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { type Ctx, inTransaction } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import * as repo from './repo'
import { canEditCourse, canViewCourseInStudio } from './rules'

// Drip schedule (docs/10 §2, docs/20 `/teach/courses/[id]/drip`). Scheduling, not content: it
// applies to the live course straight away, without a review (ADR-034). Cohort-relative drip
// counts from each cohort run's start (Phase 8) and is only offered on cohort-based courses.

const { lessons, sections, courses } = schema

export type EditableDripMode = 'none' | 'after_enrollment' | 'fixed_dates' | 'cohort_relative'
export const MAX_DRIP_OFFSET_DAYS = 365

export interface DripLesson {
  lessonId: string
  sectionTitle: string
  title: string
  isPreview: boolean
  /** False while the lesson only exists in the draft. */
  isLive: boolean
  offsetDays: number | null
  /** Lagos calendar day, `YYYY-MM-DD`. */
  date: string | null
}

export interface DripSettings {
  courseId: string
  version: number
  mode: EditableDripMode
  /** Offers "days after the start date" (cohort_relative). */
  cohortBased: boolean
  canEdit: boolean
  lessons: DripLesson[]
}

const lagosDate = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(d)

/** `2026-11-02` → midnight that day in Lagos (UTC+1, no daylight saving). */
export const lagosMidnight = (day: string) => new Date(`${day}T00:00:00+01:00`)

async function viewable(ctx: Ctx, courseId: string) {
  const user = requireUser(ctx.actor)
  const course = await repo.getCourse(ctx.db, courseId)
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  const staff = await repo.isCourseStaff(ctx.db, course.id, user.userId)
  if (!canViewCourseInStudio(user, course, staff)) throw new NotFoundError('COURSE_NOT_FOUND')
  return { user, course }
}

export async function getDripSettings(ctx: Ctx, courseId: string): Promise<DripSettings> {
  const { user, course } = await viewable(ctx, courseId)
  const rows = await ctx.db
    .select({
      lessonId: lessons.id,
      sectionTitle: sections.title,
      title: lessons.title,
      isPreview: lessons.isPreview,
      liveSince: lessons.liveSince,
      offsetDays: lessons.dripOffsetDays,
      date: lessons.dripDate,
    })
    .from(lessons)
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .where(and(eq(lessons.courseId, course.id), isNull(lessons.deletedAt)))
    .orderBy(asc(sections.position), asc(lessons.position))
  return {
    courseId: course.id,
    version: course.version,
    mode: course.dripMode,
    cohortBased: course.cohortBased,
    canEdit: canEditCourse(user, course),
    lessons: rows.map(({ liveSince, date, ...r }) => ({
      ...r,
      isLive: liveSince !== null,
      date: date ? lagosDate(date) : null,
    })),
  }
}

export async function updateDripSettings(
  ctx: Ctx,
  input: {
    courseId: string
    version: number
    mode: EditableDripMode
    lessons: Array<{ lessonId: string; offsetDays: number | null; date: string | null }>
  },
): Promise<DripSettings> {
  const user = requireUser(ctx.actor)
  const issues = input.lessons.flatMap((l, i) =>
    l.offsetDays !== null && (l.offsetDays < 0 || l.offsetDays > MAX_DRIP_OFFSET_DAYS)
      ? [
          {
            path: `lessons.${i}.offsetDays`,
            message: `Between 0 and ${MAX_DRIP_OFFSET_DAYS} days.`,
          },
        ]
      : [],
  )
  if (issues.length > 0) throw new RuleViolationError('VALIDATION_FAILED', { issues })

  await inTransaction(ctx, async (tx) => {
    const course = await repo.lockCourse(tx.db, input.courseId)
    if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
    if (!canEditCourse(user, course)) {
      if (await repo.isCourseStaff(tx.db, course.id, user.userId)) {
        throw new ForbiddenError('NOT_COURSE_OWNER')
      }
      throw new NotFoundError('COURSE_NOT_FOUND')
    }
    if (course.status === 'archived') throw new ConflictError('COURSE_NOT_EDITABLE')
    if (course.version !== input.version) throw new ConflictError('VERSION_CONFLICT')
    if (input.mode === 'cohort_relative' && !course.cohortBased) {
      throw new RuleViolationError('VALIDATION_FAILED', {
        issues: [{ path: 'mode', message: 'Sell this course in cohorts first.' }],
      })
    }
    const own = new Set(
      (
        await tx.db
          .select({ id: lessons.id })
          .from(lessons)
          .where(and(eq(lessons.courseId, course.id), isNull(lessons.deletedAt)))
      ).map((l) => l.id),
    )
    for (const l of input.lessons) {
      if (!own.has(l.lessonId)) throw new NotFoundError('LESSON_NOT_FOUND')
      await tx.db
        .update(lessons)
        .set({
          dripOffsetDays: l.offsetDays === 0 ? null : l.offsetDays,
          dripDate: l.date ? lagosMidnight(l.date) : null,
        })
        .where(eq(lessons.id, l.lessonId))
    }
    await tx.db
      .update(courses)
      .set({ dripMode: input.mode, version: course.version + 1 })
      .where(eq(courses.id, course.id))
  })
  return getDripSettings(ctx, input.courseId)
}

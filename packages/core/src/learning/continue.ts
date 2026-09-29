import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { Ctx } from '../kernel/ctx'
import { ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { publicFileUrl } from '../media'
import type { LessonType, ProgressStatus } from './outline'

// "Continue learning" (docs/20 `/account`, `/`) and per-course progress for the mobile app.
// Foreign reads (docs/03 §3): enrollments, courses, course_revisions, sections, lessons, files.

const {
  enrollments,
  courses,
  courseRevisions: revisions,
  sections,
  lessons,
  lessonProgress,
  files,
} = schema

export interface ContinueCard {
  courseId: string
  courseSlug: string
  courseTitle: string
  coverUrl: string | null
  progressPct: number
  lessonId: string
  lessonTitle: string
  lessonType: LessonType
  positionSec: number
  durationSec: number
}

const liveEnrollment = (now: Date) =>
  and(
    inArray(enrollments.status, ['active']),
    or(isNull(enrollments.accessExpiresAt), sql`${enrollments.accessExpiresAt} > ${now}`),
  )

/**
 * The lesson to pick up: in the course opened most recently, the lesson last touched if it isn't
 * finished, otherwise the first lesson not yet completed. Null when nothing is in progress.
 */
export async function continueLearning(ctx: Ctx): Promise<ContinueCard | null> {
  const actor = requireUser(ctx.actor)
  const [enrollment] = await ctx.db
    .select({
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: revisions.title,
      coverKey: files.key,
      progressPct: enrollments.progressPct,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .leftJoin(files, eq(files.id, revisions.coverFileId))
    .where(
      and(eq(enrollments.userId, actor.userId), liveEnrollment(ctx.now), isNull(courses.deletedAt)),
    )
    .orderBy(sql`${enrollments.lastAccessedAt} desc nulls last`, desc(enrollments.createdAt))
    .limit(1)
  if (!enrollment) return null

  const lessonCols = {
    lessonId: lessons.id,
    lessonTitle: lessons.title,
    lessonType: lessons.type,
    durationSec: lessons.durationSec,
  }
  const liveLesson = and(isNotNull(lessons.liveSince), isNull(lessons.deletedAt))
  const [touched] = await ctx.db
    .select({ ...lessonCols, positionSec: lessonProgress.positionSec })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
    .where(
      and(
        eq(lessonProgress.userId, actor.userId),
        eq(lessonProgress.courseId, enrollment.courseId),
        eq(lessonProgress.status, 'in_progress'),
        liveLesson,
      ),
    )
    .orderBy(desc(lessonProgress.updatedAt))
    .limit(1)
  const [next] = touched
    ? [touched]
    : await ctx.db
        .select({ ...lessonCols, positionSec: sql<number>`0` })
        .from(lessons)
        .innerJoin(sections, eq(sections.id, lessons.sectionId))
        .where(
          and(
            eq(lessons.courseId, enrollment.courseId),
            liveLesson,
            sql`not exists (select 1 from lesson_progress lp where lp.user_id = ${actor.userId} and lp.lesson_id = ${lessons.id} and lp.status = 'completed')`,
          ),
        )
        .orderBy(asc(sections.position), asc(lessons.position))
        .limit(1)
  if (!next) return null
  const { coverKey, ...course } = enrollment
  return { ...course, coverUrl: publicFileUrl(ctx, coverKey), ...next }
}

export interface CourseProgress {
  courseId: string
  progressPct: number
  lessons: Array<{
    lessonId: string
    status: ProgressStatus
    positionSec: number
    completedAt: Date | null
  }>
}

/** `progress.getCourse`: the learner's own progress in one course (the app's offline outline). */
export async function getCourseProgress(ctx: Ctx, courseId: string): Promise<CourseProgress> {
  const actor = requireUser(ctx.actor)
  const [enrollment] = await ctx.db
    .select({ progressPct: enrollments.progressPct, status: enrollments.status })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(
      and(
        eq(enrollments.userId, actor.userId),
        eq(enrollments.courseId, courseId),
        isNull(courses.deletedAt),
      ),
    )
  if (!enrollment) throw new NotFoundError('COURSE_NOT_FOUND')
  if (enrollment.status === 'revoked' || enrollment.status === 'expired') {
    throw new ForbiddenError('ENROLLMENT_REVOKED')
  }
  const rows = await ctx.db
    .select({
      lessonId: lessonProgress.lessonId,
      status: lessonProgress.status,
      positionSec: lessonProgress.positionSec,
      completedAt: lessonProgress.completedAt,
    })
    .from(lessonProgress)
    .where(and(eq(lessonProgress.userId, actor.userId), eq(lessonProgress.courseId, courseId)))
  return { courseId, progressPct: enrollment.progressPct, lessons: rows }
}

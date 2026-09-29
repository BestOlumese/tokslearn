import { schema } from '@tokslearn/db'
import { and, desc, eq, ilike, isNull, lt, or, sql } from 'drizzle-orm'
import { hasRole } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { NotFoundError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'

// The course's learners for its instructor and TAs (docs/20 `/teach/courses/[id]/learners`).
// Display names only: no emails (docs/14, learners didn't agree to share them).
// Foreign reads (docs/03 §3): courses, course_staff, user.

const { enrollments, courses, user } = schema

export interface CourseLearner {
  enrollmentId: string
  displayName: string
  enrolledAt: Date
  status: 'active' | 'completed' | 'revoked' | 'expired'
  progressPct: number
  lastActiveAt: Date | null
  /** Cohorts arrive in Phase 8. */
  cohortId: string | null
}

const encode = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
function decode(cursor: string | undefined) {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const at = new Date(iso ?? '')
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null
}

/** Shortens "Amaka Chiamaka Obi" to "Amaka O." so learners aren't fully named to the instructor. */
export const learnerDisplayName = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0] ?? 'Learner'
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first
}

export async function listCourseLearners(
  ctx: Ctx,
  input: {
    courseId: string
    status?: 'active' | 'completed' | undefined
    q?: string | undefined
    cursor?: string | undefined
    limit?: number | undefined
  },
): Promise<{ items: CourseLearner[]; nextCursor: string | null; total: number }> {
  const actor = requireUser(ctx.actor)
  const [course] = await ctx.db
    .select({
      id: courses.id,
      instructorId: courses.instructorId,
      staff: sql<boolean>`exists (select 1 from course_staff cs where cs.course_id = ${courses.id} and cs.user_id = ${actor.userId})`,
    })
    .from(courses)
    .where(and(eq(courses.id, input.courseId), isNull(courses.deletedAt)))
  const allowed =
    course &&
    (course.instructorId === actor.userId || course.staff || hasRole(actor, 'admin', 'super_admin'))
  if (!course || !allowed) throw new NotFoundError('COURSE_NOT_FOUND')

  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const c = decode(input.cursor)
  const q = input.q?.trim().replace(/[%_]/g, '')
  const filter = and(
    eq(enrollments.courseId, course.id),
    input.status ? eq(enrollments.status, input.status) : undefined,
    q ? ilike(user.name, `%${q}%`) : undefined,
  )
  const [rows, [count]] = await Promise.all([
    ctx.db
      .select({
        enrollmentId: enrollments.id,
        name: user.name,
        enrolledAt: enrollments.createdAt,
        status: enrollments.status,
        progressPct: enrollments.progressPct,
        lastActiveAt: enrollments.lastAccessedAt,
        cohortId: enrollments.cohortId,
      })
      .from(enrollments)
      .innerJoin(user, eq(user.id, enrollments.userId))
      .where(
        and(
          filter,
          c
            ? or(
                lt(enrollments.createdAt, c.at),
                and(eq(enrollments.createdAt, c.at), lt(enrollments.id, c.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(enrollments.createdAt), desc(enrollments.id))
      .limit(limit + 1),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(enrollments)
      .innerJoin(user, eq(user.id, enrollments.userId))
      .where(filter),
  ])
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    items: page.map(({ name, ...r }) => ({ ...r, displayName: learnerDisplayName(name) })),
    nextCursor: rows.length > limit && last ? encode(last.enrolledAt, last.enrollmentId) : null,
    total: count?.n ?? 0,
  }
}

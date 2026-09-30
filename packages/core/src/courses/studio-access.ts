import { schema } from '@tokslearn/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { UserActor } from '../kernel/actor'
import type { Ctx } from '../kernel/ctx'
import { ForbiddenError, NotFoundError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { canEditCourse, canViewCourseInStudio } from './rules'

// Studio access for modules that hang work off a course (assessments, assignments, grading):
// the instructor and admins edit; the course's TAs can look, and grade.

const { courses } = schema

export interface StudioCourseRef {
  id: string
  instructorId: string
  canEdit: boolean
  /** Instructor, the course's TAs and admins grade (docs/07 permission matrix). */
  canGrade: boolean
  user: UserActor
}

/** The course for studio work, or COURSE_NOT_FOUND (others can't tell it exists). */
export async function studioCourse(
  ctx: Ctx,
  courseId: string,
  need: 'view' | 'edit',
): Promise<StudioCourseRef> {
  const user = requireUser(ctx.actor)
  const [course] = await ctx.db
    .select({
      id: courses.id,
      instructorId: courses.instructorId,
      staff: sql<boolean>`exists (select 1 from course_staff cs where cs.course_id = "courses"."id" and cs.user_id = ${user.userId})`,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
  if (!course || !canViewCourseInStudio(user, course, course.staff)) {
    throw new NotFoundError('COURSE_NOT_FOUND')
  }
  const canEdit = canEditCourse(user, course)
  if (need === 'edit' && !canEdit) throw new ForbiddenError('NOT_COURSE_OWNER')
  return {
    id: course.id,
    instructorId: course.instructorId,
    canEdit,
    canGrade: canEdit || course.staff,
    user,
  }
}

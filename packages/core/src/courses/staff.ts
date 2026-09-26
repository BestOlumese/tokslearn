import { type Ctx, inTransaction } from '../kernel/ctx'
import { ConflictError, NotFoundError, RuleViolationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import * as repo from './repo'
import { canEditCourse, canViewCourseInStudio } from './rules'

// Teaching assistants (docs/05 course_staff; v1 = TA only). The instructor invites by email or
// username; TAs grade and moderate (later phases) but can't edit the course.

async function owned(ctx: Ctx, courseId: string) {
  const user = requireUser(ctx.actor)
  const course = await repo.getCourse(ctx.db, courseId)
  if (!course) throw new NotFoundError('COURSE_NOT_FOUND')
  return { user, course }
}

export async function listStaff(ctx: Ctx, courseId: string) {
  const { user, course } = await owned(ctx, courseId)
  const staff = await repo.isCourseStaff(ctx.db, course.id, user.userId)
  if (!canViewCourseInStudio(user, course, staff)) throw new NotFoundError('COURSE_NOT_FOUND')
  return repo.staffOf(ctx.db, course.id)
}

export async function addStaff(ctx: Ctx, input: { courseId: string; emailOrUsername: string }) {
  const { user, course } = await owned(ctx, input.courseId)
  if (!canEditCourse(user, course)) throw new NotFoundError('COURSE_NOT_FOUND')
  const target = await repo.findUserByEmailOrUsername(ctx.db, input.emailOrUsername)
  if (!target) throw new NotFoundError('USER_NOT_FOUND')
  if (target.id === course.instructorId) {
    throw new RuleViolationError('VALIDATION_FAILED', {
      issues: [{ path: 'emailOrUsername', message: 'You already own this course.' }],
    })
  }
  await inTransaction(ctx, async (tx) => {
    if (await repo.isCourseStaff(tx.db, course.id, target.id)) {
      throw new ConflictError('ALREADY_COURSE_STAFF')
    }
    await repo.insertStaff(tx.db, {
      courseId: course.id,
      userId: target.id,
      role: 'teaching_assistant',
      invitedBy: user.userId,
    })
  })
  return repo.staffOf(ctx.db, course.id)
}

export async function removeStaff(ctx: Ctx, input: { courseId: string; staffId: string }) {
  const { user, course } = await owned(ctx, input.courseId)
  if (!canEditCourse(user, course)) throw new NotFoundError('COURSE_NOT_FOUND')
  if (!(await repo.deleteStaff(ctx.db, course.id, input.staffId))) {
    throw new NotFoundError('USER_NOT_FOUND')
  }
  return repo.staffOf(ctx.db, course.id)
}

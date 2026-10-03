import type { RichTextDoc, Rubric } from '@tokslearn/contract'
import { schema } from '@tokslearn/db'
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import { track } from '../analytics'
import { renderRichText, richTextToPlain, studioCourse } from '../courses'
import { learnerDisplayName } from '../enrollments'
import { hasRole } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { completeLessonFor } from '../learning'
import { privateFileUrl } from '../media'
import { notify } from '../notifications'
import { maxScoreOf, readAssignmentSettings } from './authoring'
import { afterPenalty, passes, scoreRubric } from './rules'
import { type FileRef, fileRefs, type SubmissionView, toSubmissionView } from './submissions'

// Grading (docs/20 `/teach/grading`, docs/10 §7): a queue of submitted work across the courses
// the grader teaches or assists on, oldest first, and rubric grading with feedback. The learner
// is emailed and, on a pass, the assignment lesson is completed.
// Foreign reads (docs/03 §3): courses, course_revisions, course_staff, lessons, user.

const {
  assignments,
  submissions,
  grades,
  lessons,
  courses,
  courseRevisions: revisions,
  user,
} = schema

/** Waiting longer than this shows a warning in the queue. */
export const SLA_DAYS = 5
const FEEDBACK_MAX = 10_000

export interface QueueItem {
  submissionId: string
  courseId: string
  courseTitle: string
  lessonId: string
  assignmentTitle: string
  learnerName: string
  attemptNo: number
  submittedAt: Date
  isLate: boolean
  status: 'submitted' | 'grading' | 'graded' | 'returned'
  /** Past the SLA without a grade. */
  overdue: boolean
}

const encode = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
function decode(cursor: string | undefined) {
  if (!cursor) return null
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  const at = new Date(iso ?? '')
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null
}

/** Courses this actor grades: their own, those they assist on; admins all. */
const gradableCourse = (userId: string, isAdmin: boolean) =>
  isAdmin
    ? undefined
    : or(
        eq(courses.instructorId, userId),
        sql`exists (select 1 from course_staff cs where cs.course_id = "courses"."id" and cs.user_id = ${userId})`,
      )

/** `grading.queue`: waiting work oldest first, or graded work newest first. */
export async function gradingQueue(
  ctx: Ctx,
  input: {
    status?: 'waiting' | 'done' | undefined
    courseId?: string | undefined
    cursor?: string | undefined
    limit?: number | undefined
  },
): Promise<{ items: QueueItem[]; nextCursor: string | null }> {
  const actor = requireUser(ctx.actor)
  const waiting = (input.status ?? 'waiting') === 'waiting'
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 50)
  const c = decode(input.cursor)
  const isAdmin = hasRole(actor, 'admin', 'super_admin')
  const rows = await ctx.db
    .select({
      submissionId: submissions.id,
      courseId: courses.id,
      courseTitle: revisions.title,
      lessonId: lessons.id,
      assignmentTitle: lessons.title,
      learner: user.name,
      attemptNo: submissions.attemptNo,
      submittedAt: submissions.submittedAt,
      isLate: submissions.isLate,
      status: submissions.status,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .innerJoin(lessons, eq(lessons.assignmentId, assignments.id))
    .innerJoin(user, eq(user.id, submissions.userId))
    .where(
      and(
        waiting
          ? sql`${submissions.status} in ('submitted', 'grading')`
          : sql`${submissions.status} in ('graded', 'returned')`,
        input.courseId ? eq(courses.id, input.courseId) : undefined,
        isNull(courses.deletedAt),
        gradableCourse(actor.userId, isAdmin),
        c
          ? waiting
            ? or(
                gt(submissions.submittedAt, c.at),
                and(eq(submissions.submittedAt, c.at), gt(submissions.id, c.id)),
              )
            : or(
                lt(submissions.submittedAt, c.at),
                and(eq(submissions.submittedAt, c.at), lt(submissions.id, c.id)),
              )
          : undefined,
      ),
    )
    .orderBy(
      waiting ? asc(submissions.submittedAt) : desc(submissions.submittedAt),
      waiting ? asc(submissions.id) : desc(submissions.id),
    )
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    items: page.flatMap(({ learner, submittedAt, status, ...r }) =>
      submittedAt && status !== 'draft'
        ? [
            {
              ...r,
              status,
              submittedAt,
              learnerName: learnerDisplayName(learner),
              overdue: waiting && ctx.now.getTime() - submittedAt.getTime() > SLA_DAYS * 86_400_000,
            },
          ]
        : [],
    ),
    nextCursor:
      rows.length > limit && last?.submittedAt ? encode(last.submittedAt, last.submissionId) : null,
  }
}

export interface GradingView {
  submission: SubmissionView
  learnerName: string
  courseId: string
  courseTitle: string
  assignmentTitle: string
  lessonId: string
  instructionsHtml: string | null
  rubric: Rubric | null
  maxScore: number
  passPct: number
  /** The learner's earlier submissions, newest first. */
  earlier: SubmissionView[]
  canGrade: boolean
}

async function submissionFor(ctx: Ctx, submissionId: string) {
  const [row] = await ctx.db
    .select({
      s: submissions,
      a: assignments,
      courseTitle: revisions.title,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      learner: user.name,
    })
    .from(submissions)
    .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
    .innerJoin(courses, eq(courses.id, assignments.courseId))
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .innerJoin(lessons, eq(lessons.assignmentId, assignments.id))
    .innerJoin(user, eq(user.id, submissions.userId))
    .where(and(eq(submissions.id, submissionId), sql`${submissions.status} <> 'draft'`))
  if (!row) throw new NotFoundError('SUBMISSION_NOT_FOUND')
  let course: Awaited<ReturnType<typeof studioCourse>>
  try {
    course = await studioCourse(ctx, row.a.courseId, 'view')
  } catch (e) {
    if (e instanceof NotFoundError) throw new NotFoundError('SUBMISSION_NOT_FOUND')
    throw e
  }
  return { ...row, course }
}

/** `grading.get`: one submission with the brief, rubric and the learner's earlier attempts. */
export async function getSubmissionForGrading(
  ctx: Ctx,
  submissionId: string,
): Promise<GradingView> {
  const { s, a, courseTitle, lessonId, lessonTitle, learner, course } = await submissionFor(
    ctx,
    submissionId,
  )
  const settings = readAssignmentSettings(a)
  const history = await ctx.db
    .select({ s: submissions, g: grades })
    .from(submissions)
    .leftJoin(grades, eq(grades.submissionId, submissions.id))
    .where(
      and(
        eq(submissions.assignmentId, a.id),
        eq(submissions.userId, s.userId),
        sql`${submissions.status} <> 'draft'`,
      ),
    )
    .orderBy(desc(submissions.attemptNo))
  const fileMap = await fileRefs(
    ctx,
    history.flatMap((h) => h.s.fileIds),
  )
  const views = history.map((h) => toSubmissionView(h.s, fileMap, h.g ?? undefined))
  return {
    submission: views.find((v) => v.id === s.id) ?? toSubmissionView(s, fileMap, undefined),
    learnerName: learnerDisplayName(learner),
    courseId: a.courseId,
    courseTitle,
    assignmentTitle: lessonTitle,
    lessonId,
    instructionsHtml: a.instructionsHtml,
    rubric: settings.rubric,
    maxScore: maxScoreOf(settings),
    passPct: settings.passPct,
    earlier: views.filter((v) => v.id !== s.id),
    canGrade: course.canGrade,
  }
}

/** `grading.file`: a 5-minute link to a file in a submission, for its graders. */
export async function gradingFileUrl(
  ctx: Ctx,
  input: { submissionId: string; fileId: string },
): Promise<{ url: string; filename: string }> {
  const { s, course } = await submissionFor(ctx, input.submissionId)
  if (!course.canGrade || !s.fileIds.includes(input.fileId))
    throw new NotFoundError('FILE_NOT_FOUND')
  const [file] = await ctx.db.select().from(schema.files).where(eq(schema.files.id, input.fileId))
  if (!file) throw new NotFoundError('FILE_NOT_FOUND')
  const filename = file.originalName ?? file.key.split('/').pop() ?? 'file'
  return { url: await privateFileUrl(ctx, file, filename), filename }
}

export interface GradeInput {
  submissionId: string
  /** `returned` sends the work back for changes (always resubmittable). */
  decision: 'graded' | 'returned'
  /** Rubric assignments: criterion id → level id. */
  rubricScores?: Record<string, string> | undefined
  /** Assignments without a rubric. */
  score?: number | undefined
  feedback: RichTextDoc | null
}

/**
 * `grading.grade`: grades or returns one submission. One grade per submission; a second grader
 * racing gets SUBMISSION_ALREADY_GRADED. A late penalty is taken off the score.
 */
export async function gradeSubmission(ctx: Ctx, input: GradeInput): Promise<GradingView> {
  const grader = requireUser(ctx.actor)
  const { s, a, courseTitle, lessonId, lessonTitle, course } = await submissionFor(
    ctx,
    input.submissionId,
  )
  if (!course.canGrade) throw new ForbiddenError('FORBIDDEN')
  const settings = readAssignmentSettings(a)

  const feedbackText = richTextToPlain(input.feedback)
  if (feedbackText.length > FEEDBACK_MAX) {
    throw new ValidationError([{ path: 'feedback', message: 'Up to 10,000 characters.' }])
  }
  if (input.decision === 'returned' && !feedbackText) {
    throw new ValidationError([{ path: 'feedback', message: 'Say what to change.' }])
  }
  let raw: number | null = null
  let maxScore: number | null = null
  let rubricScores: Record<string, string> | null = null
  if (input.decision === 'graded') {
    if (settings.rubric) {
      const r = scoreRubric(settings.rubric, input.rubricScores ?? {})
      raw = r.score
      maxScore = r.maxScore
      rubricScores = { ...(input.rubricScores ?? {}) }
    } else {
      maxScore = settings.maxScore
      const given = input.score
      if (given === undefined || !Number.isFinite(given) || given < 0 || given > maxScore) {
        throw new ValidationError([{ path: 'score', message: `Between 0 and ${maxScore}.` }])
      }
      raw = Math.round(given * 100) / 100
    }
  }
  const score = raw === null ? null : afterPenalty(raw, s.latePenaltyPct)
  const passed =
    score === null || maxScore === null ? null : passes(score, maxScore, settings.passPct)
  const feedback = feedbackText ? input.feedback : null

  await inTransaction(ctx, async (tx) => {
    const [locked] = await tx.db
      .select()
      .from(submissions)
      .where(eq(submissions.id, s.id))
      .for('update')
    const [existing] = await tx.db
      .select({ id: grades.id })
      .from(grades)
      .where(eq(grades.submissionId, s.id))
    if (!locked || existing || (locked.status !== 'submitted' && locked.status !== 'grading')) {
      throw new ConflictError('SUBMISSION_ALREADY_GRADED')
    }
    await tx.db.insert(grades).values({
      submissionId: s.id,
      graderId: grader.userId,
      decision: input.decision,
      rubricScores,
      score,
      maxScore,
      passed,
      feedbackDoc: feedback as unknown as Record<string, unknown> | null,
      feedbackHtml: feedback ? renderRichText(feedback) : null,
      gradedAt: tx.now,
    })
    await tx.db.update(submissions).set({ status: input.decision }).where(eq(submissions.id, s.id))
    await tx.events.emit('assignment.graded', {
      userId: s.userId,
      courseId: a.courseId,
      assignmentId: a.id,
      submissionId: s.id,
      decision: input.decision,
      passed,
    })
    const [learner] = await tx.db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, s.userId))
    const [c] = await tx.db
      .select({ slug: courses.slug })
      .from(courses)
      .where(eq(courses.id, a.courseId))
    if (learner && c) {
      await notify(tx, {
        userId: s.userId,
        type: 'assignment.graded',
        title:
          input.decision === 'returned'
            ? `“${lessonTitle}” came back with feedback`
            : `“${lessonTitle}” was graded`,
        link: `/learn/${c.slug}/${lessonId}`,
        email: {
          id: 'assignment-graded',
          businessKey: s.id,
          data: {
            name: learner.name.split(/\s+/)[0] ?? learner.name,
            courseTitle,
            assignmentTitle: lessonTitle,
            decision: input.decision,
            score: score === null || maxScore === null ? null : `${score} / ${maxScore}`,
            passed,
            feedbackExcerpt: feedbackText
              ? feedbackText.length > 200
                ? `${feedbackText.slice(0, 197).trimEnd()}…`
                : feedbackText
              : null,
            url: `${provider(tx, 'urls').app}/learn/${c.slug}/${lessonId}`,
          },
        },
      })
    }
  })

  void track(ctx, 'assignment_graded', {
    assignment_id: a.id,
    is_late: s.isLate,
    score_pct: score !== null && maxScore ? Math.round((score * 100) / maxScore) : 0,
  })
  if (passed) {
    const [lesson] = await ctx.db
      .select({ id: lessons.id, courseId: lessons.courseId, type: lessons.type })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
    if (lesson) await completeLessonFor(ctx, { userId: s.userId, lesson })
  }
  return getSubmissionForGrading(ctx, s.id)
}

export type { FileRef }

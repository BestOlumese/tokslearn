import { schema } from '@tokslearn/db'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { studioCourse } from '../courses'
import { learnerDisplayName } from '../enrollments'
import { hasRole } from '../kernel/actor'
import { type Ctx, inTransaction, provider } from '../kernel/ctx'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { notify } from '../notifications'
import type { FlagReason, Integrity } from './integrity'

// Reviewing flagged exam attempts (docs/20 `/teach/grading`, flagged tab; docs/10 §6). A person
// decides: the instructor, a TA or an admin can void an attempt with a reason. The learner is
// emailed, and a voided attempt no longer counts toward the attempt limit.
// Foreign reads (docs/03 §3): courses, course_revisions, course_staff, lessons, user.

const {
  quizAttempts,
  quizzes,
  attemptAnswers,
  questions,
  courses,
  courseRevisions: revisions,
  lessons,
  user,
} = schema

export interface FlaggedAttempt {
  attemptId: string
  courseId: string
  courseTitle: string
  lessonId: string | null
  examTitle: string
  learnerName: string
  attemptNo: number
  submittedAt: Date | null
  score: number | null
  maxScore: number | null
  passed: boolean | null
  reasons: FlagReason[]
}

/** `grading.flagged`: flagged exam attempts in the courses this actor grades, newest first. */
export async function listFlaggedAttempts(
  ctx: Ctx,
  input: { courseId?: string | undefined } = {},
): Promise<FlaggedAttempt[]> {
  const actor = requireUser(ctx.actor)
  const isAdmin = hasRole(actor, 'admin', 'super_admin')
  const rows = await ctx.db
    .select({
      attempt: quizAttempts,
      courseId: courses.id,
      courseTitle: revisions.title,
      lessonId: lessons.id,
      examTitle: sql<string>`coalesce(${lessons.title}, ${quizzes.title})`,
      learner: user.name,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .innerJoin(courses, eq(courses.id, quizzes.courseId))
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .leftJoin(lessons, eq(lessons.quizId, quizzes.id))
    .innerJoin(user, eq(user.id, quizAttempts.userId))
    .where(
      and(
        eq(quizAttempts.flagged, true),
        inArray(quizAttempts.status, ['graded', 'auto_submitted']),
        input.courseId ? eq(courses.id, input.courseId) : undefined,
        isNull(courses.deletedAt),
        isAdmin
          ? undefined
          : or(
              eq(courses.instructorId, actor.userId),
              sql`exists (select 1 from course_staff cs where cs.course_id = "courses"."id" and cs.user_id = ${actor.userId})`,
            ),
      ),
    )
    .orderBy(desc(quizAttempts.submittedAt))
    .limit(200)
  return rows.map((r) => ({
    attemptId: r.attempt.id,
    courseId: r.courseId,
    courseTitle: r.courseTitle,
    lessonId: r.lessonId,
    examTitle: r.examTitle,
    learnerName: learnerDisplayName(r.learner),
    attemptNo: r.attempt.attemptNo,
    submittedAt: r.attempt.submittedAt,
    score: r.attempt.score,
    maxScore: r.attempt.maxScore,
    passed: r.attempt.passed,
    reasons: ((r.attempt.integrity as Integrity).flagReasons ?? []) as FlagReason[],
  }))
}

export interface AttemptReview extends FlaggedAttempt {
  status: string
  startedAt: Date
  integrity: Omit<Integrity, 'startIpHash' | 'otherIpHashes'> & { networksSeen: number }
  answers: Array<{
    questionId: string
    promptHtml: string
    answer: unknown
    correct: boolean | null
    points: number | null
    answeredAt: Date
  }>
  canVoid: boolean
}

async function attemptForStaff(ctx: Ctx, attemptId: string) {
  const [row] = await ctx.db
    .select({ attempt: quizAttempts, quiz: quizzes })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(eq(quizAttempts.id, attemptId))
  if (!row) throw new NotFoundError('ATTEMPT_NOT_FOUND')
  try {
    return { ...row, course: await studioCourse(ctx, row.quiz.courseId, 'view') }
  } catch (e) {
    if (e instanceof NotFoundError) throw new NotFoundError('ATTEMPT_NOT_FOUND')
    throw e
  }
}

/** `grading.attempt`: what the reviewer needs to decide. IP hashes are summarised, never shown. */
export async function getAttemptForReview(ctx: Ctx, attemptId: string): Promise<AttemptReview> {
  const { attempt, quiz, course } = await attemptForStaff(ctx, attemptId)
  const list = await listFlaggedAttemptsFor(ctx, attempt.id)
  const answers = await ctx.db
    .select({
      questionId: attemptAnswers.questionId,
      promptHtml: questions.promptHtml,
      answer: attemptAnswers.answer,
      correct: attemptAnswers.isCorrect,
      points: attemptAnswers.pointsAwarded,
      answeredAt: attemptAnswers.answeredAt,
    })
    .from(attemptAnswers)
    .innerJoin(questions, eq(questions.id, attemptAnswers.questionId))
    .where(eq(attemptAnswers.attemptId, attempt.id))
    .orderBy(attemptAnswers.answeredAt)
  const { startIpHash: _s, otherIpHashes, ...signals } = attempt.integrity as Integrity
  return {
    ...(list ?? {
      attemptId: attempt.id,
      courseId: quiz.courseId,
      courseTitle: '',
      lessonId: null,
      examTitle: quiz.title,
      learnerName: '',
      attemptNo: attempt.attemptNo,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      maxScore: attempt.maxScore,
      passed: attempt.passed,
      reasons: (signals.flagReasons ?? []) as FlagReason[],
    }),
    status: attempt.status,
    startedAt: attempt.startedAt,
    integrity: { ...signals, networksSeen: 1 + (otherIpHashes ?? []).length },
    answers,
    canVoid: course.canGrade && attempt.status !== 'void' && attempt.status !== 'in_progress',
  }
}

async function listFlaggedAttemptsFor(ctx: Ctx, attemptId: string) {
  const [row] = await ctx.db
    .select({
      attempt: quizAttempts,
      courseId: courses.id,
      courseTitle: revisions.title,
      lessonId: lessons.id,
      examTitle: sql<string>`coalesce(${lessons.title}, ${quizzes.title})`,
      learner: user.name,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .innerJoin(courses, eq(courses.id, quizzes.courseId))
    .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
    .leftJoin(lessons, eq(lessons.quizId, quizzes.id))
    .innerJoin(user, eq(user.id, quizAttempts.userId))
    .where(eq(quizAttempts.id, attemptId))
  if (!row) return null
  return {
    attemptId: row.attempt.id,
    courseId: row.courseId,
    courseTitle: row.courseTitle,
    lessonId: row.lessonId,
    examTitle: row.examTitle,
    learnerName: learnerDisplayName(row.learner),
    attemptNo: row.attempt.attemptNo,
    submittedAt: row.attempt.submittedAt,
    score: row.attempt.score,
    maxScore: row.attempt.maxScore,
    passed: row.attempt.passed,
    reasons: ((row.attempt.integrity as Integrity).flagReasons ?? []) as FlagReason[],
  }
}

/**
 * `grading.voidAttempt`: cancels a submitted attempt with a reason. It stops counting toward the
 * attempt limit; the learner is emailed. Only finished attempts can be voided.
 */
export async function voidAttempt(
  ctx: Ctx,
  input: { attemptId: string; reason: string },
): Promise<AttemptReview> {
  const actor = requireUser(ctx.actor)
  const { attempt, quiz, course } = await attemptForStaff(ctx, input.attemptId)
  if (!course.canGrade) throw new ForbiddenError('FORBIDDEN')
  const reason = input.reason.trim()
  if (reason.length < 10 || reason.length > 1000) {
    throw new ValidationError([{ path: 'reason', message: 'Explain in 10 to 1,000 characters.' }])
  }
  await inTransaction(ctx, async (tx) => {
    const [a] = await tx.db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.id, attempt.id))
      .for('update')
    if (!a || a.status === 'void' || a.status === 'in_progress')
      throw new ConflictError('ATTEMPT_ALREADY_SUBMITTED')
    await tx.db
      .update(quizAttempts)
      .set({ status: 'void', voidReason: reason, voidedBy: actor.userId, voidedAt: tx.now })
      .where(eq(quizAttempts.id, a.id))
    await tx.events.emit('attempt.voided', {
      userId: a.userId,
      courseId: quiz.courseId,
      quizId: quiz.id,
      attemptId: a.id,
    })
    const [learner] = await tx.db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, a.userId))
    const [where] = await tx.db
      .select({
        slug: courses.slug,
        courseTitle: revisions.title,
        lessonId: lessons.id,
        lessonTitle: lessons.title,
      })
      .from(courses)
      .innerJoin(revisions, eq(revisions.id, courses.liveRevisionId))
      .leftJoin(lessons, eq(lessons.quizId, quiz.id))
      .where(eq(courses.id, quiz.courseId))
    if (learner && where) {
      await notify(tx, {
        userId: a.userId,
        type: 'attempt.voided',
        title: `Your attempt at ${where.lessonTitle ?? quiz.title} was voided`,
        link: `/learn/${where.slug}${where.lessonId ? `/${where.lessonId}` : ''}`,
        email: {
          id: 'attempt-voided',
          businessKey: a.id,
          data: {
            name: learner.name.split(/\s+/)[0] ?? learner.name,
            courseTitle: where.courseTitle,
            examTitle: where.lessonTitle ?? quiz.title,
            reason,
            url: `${provider(tx, 'urls').app}/learn/${where.slug}${where.lessonId ? `/${where.lessonId}` : ''}`,
          },
        },
      })
    }
  })
  return getAttemptForReview(ctx, attempt.id)
}

/**
 * For certificates: the learner's first passing attempt at a quiz (graded, passed, not voided),
 * or null. Voided attempts never count.
 */
export async function passedAttempt(
  ctx: Ctx,
  input: { userId: string; quizId: string },
): Promise<{ attemptId: string; submittedAt: Date | null } | null> {
  const [row] = await ctx.db
    .select({ attemptId: quizAttempts.id, submittedAt: quizAttempts.submittedAt })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.quizId, input.quizId),
        eq(quizAttempts.userId, input.userId),
        eq(quizAttempts.status, 'graded'),
        eq(quizAttempts.passed, true),
      ),
    )
    .orderBy(quizAttempts.submittedAt)
    .limit(1)
  return row ?? null
}

import type { QuestionType, QuizKind, QuizSettings } from '@tokslearn/contract'
import { schema } from '@tokslearn/db'
import {
  and,
  arrayOverlaps,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm'
import { track } from '../analytics'
import { markPurchaseConsumed, purchaseRefundState } from '../commerce'
import { enrolledCourseIds, lessonAccess } from '../enrollments'
import type { Ctx } from '../kernel/ctx'
import { inTransaction } from '../kernel/ctx'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RuleViolationError,
  ValidationError,
} from '../kernel/errors'
import { requireUser } from '../kernel/guards'
import { completeLessonFor, lessonLocked } from '../learning'
import { readSettings } from './authoring'
import { gradeAttempt, optionOrder, readLearnerAnswer, shuffled } from './grading'
import { flagReasons, type Integrity, type IntegrityKind } from './integrity'

// Taking quizzes and exams (docs/10 §5–6). The server is the authority: it draws and freezes the
// questions, keeps the clock, grades, and decides what the learner may see afterwards. Answer
// keys leave the server only inside results the quiz's `show_answers` setting allows.
// Foreign reads (docs/03 §3): lessons, lesson_progress, consumption_events (write: exam_started).

const {
  quizzes,
  quizQuestions,
  quizSources,
  questions,
  questionBanks,
  quizAttempts,
  attemptAnswers,
  lessons,
  lessonProgress,
  consumptionEvents,
} = schema

/** Answers this long after the deadline are still accepted (slow networks). */
export const GRACE_MS = 5_000

type AttemptRow = typeof quizAttempts.$inferSelect
type QuizRow = typeof quizzes.$inferSelect

// ─── Views ───────────────────────────────────────────────────────────────────────────────────

type Choice = { id: string; text: string }
export type LearnerOptions =
  | { choices: Choice[] }
  | { items: Choice[] }
  | { left: Choice[]; right: Choice[] }
  | Record<string, never>

export interface AttemptQuestion {
  id: string
  type: QuestionType
  promptHtml: string
  points: number
  options: LearnerOptions
}

export interface QuestionFeedback {
  correct: boolean
  points: number
  /** The answer key, when the quiz shows answers. */
  correctAnswer: unknown
  explanationHtml: string | null
}

export interface AttemptView {
  id: string
  quizId: string
  lessonId: string | null
  kind: QuizKind
  attemptNo: number
  status: AttemptRow['status']
  startedAt: Date
  deadlineAt: Date | null
  submittedAt: Date | null
  oneQuestionPerScreen: boolean
  questions: AttemptQuestion[]
  /** The learner's own saved answers. */
  answers: Record<string, unknown>
  result: {
    score: number
    maxScore: number
    pct: number
    passed: boolean
    /** Per question, only when `show_answers` allows it now. */
    feedback: Record<string, QuestionFeedback> | null
  } | null
}

/** Options in the order this attempt shows them; never the key. */
export function learnerOptions(
  type: QuestionType,
  options: unknown,
  order: string[],
): LearnerOptions {
  const o = options as Record<string, Choice[] | undefined>
  const arrange = (list: Choice[] | undefined): Choice[] => {
    const all = list ?? []
    const byId = new Map(all.map((c) => [c.id, c]))
    const shown = order.map((id) => byId.get(id)).filter((c): c is Choice => c !== undefined)
    // Options added after the attempt started go at the end.
    const rest = all.filter((c) => !order.includes(c.id))
    return [...shown, ...rest].map((c) => ({ id: c.id, text: c.text }))
  }
  switch (type) {
    case 'single':
    case 'multiple':
      return { choices: arrange(o.choices) }
    case 'ordering':
      return { items: arrange(o.items) }
    case 'matching':
      return {
        left: (o.left ?? []).map((c) => ({ id: c.id, text: c.text })),
        right: arrange(o.right),
      }
    default:
      return {}
  }
}

/** Whether results may include the answer key right now. */
export function mayShowAnswers(settings: QuizSettings, passed: boolean, now: Date): boolean {
  switch (settings.showAnswers) {
    case 'after_submit':
      return true
    case 'after_pass':
      return passed
    case 'after_close':
      return settings.closesAt !== null && new Date(settings.closesAt) <= now
    default:
      return false
  }
}

const finished = (s: AttemptRow['status']) => s === 'graded' || s === 'auto_submitted'

async function buildView(ctx: Ctx, attempt: AttemptRow, quiz: QuizRow): Promise<AttemptView> {
  const settings = readSettings(quiz.settings)
  const [qs, answers, lessonRow] = await Promise.all([
    ctx.db
      .select({
        id: questions.id,
        type: questions.type,
        promptHtml: questions.promptHtml,
        options: questions.options,
        points: questions.points,
        answer: questions.answer,
        explanationHtml: questions.explanationHtml,
      })
      .from(questions)
      .where(inArray(questions.id, attempt.questionIds)),
    ctx.db
      .select({
        questionId: attemptAnswers.questionId,
        answer: attemptAnswers.answer,
        isCorrect: attemptAnswers.isCorrect,
        pointsAwarded: attemptAnswers.pointsAwarded,
      })
      .from(attemptAnswers)
      .where(eq(attemptAnswers.attemptId, attempt.id)),
    ctx.db.select({ id: lessons.id }).from(lessons).where(eq(lessons.quizId, quiz.id)),
  ])
  const byId = new Map(qs.map((q) => [q.id, q]))
  const ordered = attempt.questionIds.flatMap((id) => {
    const q = byId.get(id)
    return q ? [q] : []
  })
  const given = new Map(answers.map((a) => [a.questionId, a]))
  const done = finished(attempt.status)
  const passed = attempt.passed === true
  const show = done && mayShowAnswers(settings, passed, ctx.now)
  return {
    id: attempt.id,
    quizId: quiz.id,
    lessonId: lessonRow[0]?.id ?? null,
    kind: quiz.kind,
    attemptNo: attempt.attemptNo,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadlineAt: attempt.deadlineAt,
    submittedAt: attempt.submittedAt,
    oneQuestionPerScreen: quiz.kind === 'exam' && settings.oneQuestionPerScreen,
    questions: ordered.map((q) => ({
      id: q.id,
      type: q.type,
      promptHtml: q.promptHtml,
      points: q.points,
      options: learnerOptions(q.type, q.options, attempt.optionOrders[q.id] ?? []),
    })),
    answers: Object.fromEntries(answers.map((a) => [a.questionId, a.answer])),
    result:
      done && attempt.score !== null && attempt.maxScore !== null
        ? {
            score: attempt.score,
            maxScore: attempt.maxScore,
            pct:
              attempt.maxScore === 0
                ? 0
                : Math.round((attempt.score * 10000) / attempt.maxScore) / 100,
            passed,
            feedback: show
              ? Object.fromEntries(
                  ordered.map((q) => {
                    const a = given.get(q.id)
                    return [
                      q.id,
                      {
                        correct: a?.isCorrect === true,
                        points: a?.pointsAwarded ?? 0,
                        correctAnswer: q.answer,
                        explanationHtml: q.explanationHtml,
                      },
                    ]
                  }),
                )
              : null,
          }
        : null,
  }
}

// ─── Lookups ─────────────────────────────────────────────────────────────────────────────────

/** The quiz behind a lesson the viewer may open: enrolled learners, or the course's teachers. */
async function quizForLesson(ctx: Ctx, lessonId: string) {
  const access = await lessonAccess(ctx, lessonId)
  if (access.reason === 'missing' || !access.courseId) throw new NotFoundError('LESSON_NOT_FOUND')
  if (access.reason === 'revoked') throw new ForbiddenError('ENROLLMENT_REVOKED')
  if (access.reason === 'locked' && access.unlocksAt) throw lessonLocked(access.unlocksAt)
  if (!access.allowed || access.reason === 'preview') throw new ForbiddenError('NOT_ENROLLED')
  const [row] = await ctx.db
    .select({ lesson: lessons, quiz: quizzes })
    .from(lessons)
    .innerJoin(quizzes, eq(quizzes.id, lessons.quizId))
    .where(and(eq(lessons.id, lessonId), eq(lessons.type, 'quiz')))
  if (!row) throw new NotFoundError('QUIZ_NOT_FOUND')
  return { access, lesson: row.lesson, quiz: row.quiz, settings: readSettings(row.quiz.settings) }
}

async function ownAttempt(ctx: Ctx, attemptId: string) {
  const user = requireUser(ctx.actor)
  const [row] = await ctx.db
    .select({ attempt: quizAttempts, quiz: quizzes })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId))
    .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, user.userId)))
  if (!row) throw new NotFoundError('ATTEMPT_NOT_FOUND')
  return row
}

const pastDeadline = (a: Pick<AttemptRow, 'deadlineAt'>, now: Date) =>
  a.deadlineAt !== null && now.getTime() > a.deadlineAt.getTime() + GRACE_MS

/** Live lessons of the course, other than this one, the learner hasn't completed. */
async function lessonsLeft(ctx: Ctx, userId: string, courseId: string, exceptLessonId: string) {
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(lessons)
    .where(
      and(
        eq(lessons.courseId, courseId),
        ne(lessons.id, exceptLessonId),
        isNotNull(lessons.liveSince),
        isNull(lessons.deletedAt),
        sql`not exists (select 1 from ${lessonProgress} lp where lp.user_id = ${userId} and lp.lesson_id = ${lessons.id} and lp.status = 'completed')`,
      ),
    )
  return row?.n ?? 0
}

async function attemptStats(ctx: Ctx, quizId: string, userId: string) {
  const [row] = await ctx.db
    .select({
      used: sql<number>`count(*) filter (where ${quizAttempts.status} <> 'void')::int`,
      lastNo: sql<number>`coalesce(max(${quizAttempts.attemptNo}), 0)::int`,
      lastSubmittedAt: sql<Date | null>`max(${quizAttempts.submittedAt}) filter (where ${quizAttempts.status} <> 'void')`,
    })
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.userId, userId)))
  return {
    used: row?.used ?? 0,
    lastNo: row?.lastNo ?? 0,
    lastSubmittedAt: row?.lastSubmittedAt ? new Date(row.lastSubmittedAt) : null,
  }
}

const cooldownUntil = (settings: QuizSettings, lastSubmittedAt: Date | null) =>
  settings.cooldownHours > 0 && lastSubmittedAt
    ? new Date(lastSubmittedAt.getTime() + settings.cooldownHours * 3_600_000)
    : null

type DrawnQuestion = { id: string; type: QuestionType; options: unknown; answer: unknown }

/** The questions for a new attempt: the fixed list, or fresh draws from the banks. */
async function drawQuestions(
  ctx: Ctx,
  quizId: string,
  settings: QuizSettings,
): Promise<DrawnQuestion[]> {
  const cols = {
    id: questions.id,
    type: questions.type,
    options: questions.options,
    answer: questions.answer,
  }
  if (settings.mode === 'fixed') {
    return ctx.db
      .select(cols)
      .from(quizQuestions)
      .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
      .where(and(eq(quizQuestions.quizId, quizId), isNull(questions.archivedAt)))
      .orderBy(asc(quizQuestions.position))
  }
  const sources = await ctx.db
    .select()
    .from(quizSources)
    .innerJoin(questionBanks, eq(questionBanks.id, quizSources.bankId))
    .where(and(eq(quizSources.quizId, quizId), isNull(questionBanks.archivedAt)))
    .orderBy(asc(quizSources.createdAt))
  const picked: DrawnQuestion[] = []
  for (const { quiz_sources: s } of sources) {
    const taken = picked.map((p) => p.id)
    const rows = await ctx.db
      .select(cols)
      .from(questions)
      .where(
        and(
          eq(questions.bankId, s.bankId),
          isNull(questions.archivedAt),
          s.tagFilter.length > 0 ? arrayOverlaps(questions.tags, s.tagFilter) : undefined,
          taken.length > 0 ? notInArray(questions.id, taken) : undefined,
        ),
      )
      .orderBy(sql`random()`)
      .limit(s.questionCount)
    picked.push(...rows)
  }
  return picked
}

// ─── Starting ────────────────────────────────────────────────────────────────────────────────

/**
 * `quizzes.start` / `exams.start`. Exams need `confirmed` (the rules screen says starting ends
 * the refund right) and, when set, every other lesson completed. An attempt already running is
 * returned as ATTEMPT_IN_PROGRESS with its id, unless its time ran out: then it is submitted
 * first.
 */
export async function startAttempt(
  ctx: Ctx,
  input: { lessonId: string; confirmed?: boolean | undefined },
): Promise<AttemptView> {
  const user = requireUser(ctx.actor)
  const { access, lesson, quiz, settings } = await quizForLesson(ctx, input.lessonId)
  const learner = access.reason === 'enrolled'

  if (quiz.kind === 'exam') {
    if (learner && settings.requireAllLessons) {
      const remaining = await lessonsLeft(ctx, user.userId, lesson.courseId, lesson.id)
      if (remaining > 0) throw new RuleViolationError('EXAM_NOT_ELIGIBLE', { remaining })
    }
    if (input.confirmed !== true) throw new RuleViolationError('CONFIRMATION_REQUIRED')
  }

  const [open] = await ctx.db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.quizId, quiz.id),
        eq(quizAttempts.userId, user.userId),
        eq(quizAttempts.status, 'in_progress'),
      ),
    )
  if (open) {
    if (!pastDeadline(open, ctx.now)) {
      throw new ConflictError('ATTEMPT_IN_PROGRESS', { attemptId: open.id })
    }
    await finalize(ctx, open.id, 'auto')
  }

  const stats = await attemptStats(ctx, quiz.id, user.userId)
  if (settings.attemptsAllowed !== null && stats.used >= settings.attemptsAllowed) {
    throw new RuleViolationError('NO_ATTEMPTS_LEFT')
  }
  const until = cooldownUntil(settings, stats.lastSubmittedAt)
  if (until && until > ctx.now) {
    throw new RuleViolationError('COOLDOWN_ACTIVE', { availableAt: until.toISOString() })
  }

  const drawn = await drawQuestions(ctx, quiz.id, settings)
  if (drawn.length === 0) throw new RuleViolationError('QUIZ_EMPTY')
  const ids = settings.shuffleQuestions ? shuffled(drawn.map((q) => q.id)) : drawn.map((q) => q.id)
  const optionOrders = Object.fromEntries(
    drawn.map((q) => [
      q.id,
      optionOrder(
        q.type,
        q.options,
        settings.shuffleOptions,
        Math.random,
        q.type === 'ordering' ? (q.answer as { order?: string[] }).order : undefined,
      ),
    ]),
  )
  const integrity: Integrity = { startIpHash: ctx.ipHash ?? null }
  const [attempt] = await ctx.db
    .insert(quizAttempts)
    .values({
      quizId: quiz.id,
      userId: user.userId,
      attemptNo: stats.lastNo + 1,
      startedAt: ctx.now,
      deadlineAt: settings.timeLimitSec
        ? new Date(ctx.now.getTime() + settings.timeLimitSec * 1000)
        : null,
      questionIds: ids,
      optionOrders,
      integrity: integrity as Record<string, unknown>,
    })
    // A concurrent start won the race (one in progress per learner per quiz).
    .onConflictDoNothing()
    .returning()
  if (!attempt) {
    const [winner] = await ctx.db
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quiz.id),
          eq(quizAttempts.userId, user.userId),
          eq(quizAttempts.status, 'in_progress'),
        ),
      )
    throw new ConflictError('ATTEMPT_IN_PROGRESS', { attemptId: winner?.id ?? null })
  }

  if (quiz.kind === 'exam') {
    if (learner) {
      await ctx.db.insert(consumptionEvents).values({
        userId: user.userId,
        courseId: lesson.courseId,
        kind: 'exam_started',
        refId: attempt.id,
        occurredAt: ctx.now,
        ipHash: ctx.ipHash,
      })
      await markPurchaseConsumed(ctx, {
        userId: user.userId,
        courseId: lesson.courseId,
        reason: 'exam_started',
      })
    }
    void track(ctx, 'exam_started', { quiz_id: quiz.id, duration_sec: settings.timeLimitSec ?? 0 })
  }
  return buildView(ctx, attempt, quiz)
}

// ─── Answering ───────────────────────────────────────────────────────────────────────────────

/**
 * `quizzes.saveAnswer` / `exams.saveAnswer`: one answer, replacing the previous one. After the
 * deadline plus grace the attempt is submitted and ATTEMPT_EXPIRED returned.
 */
export async function saveAnswer(
  ctx: Ctx,
  input: { attemptId: string; questionId: string; answer: unknown },
): Promise<{ savedAt: Date }> {
  const { attempt } = await ownAttempt(ctx, input.attemptId)
  if (attempt.status !== 'in_progress') throw new ConflictError('ATTEMPT_ALREADY_SUBMITTED')
  if (pastDeadline(attempt, ctx.now)) {
    await finalize(ctx, attempt.id, 'auto')
    throw new RuleViolationError('ATTEMPT_EXPIRED')
  }
  if (!attempt.questionIds.includes(input.questionId)) throw new NotFoundError('QUESTION_NOT_FOUND')
  const [q] = await ctx.db
    .select({ type: questions.type })
    .from(questions)
    .where(eq(questions.id, input.questionId))
  if (!q) throw new NotFoundError('QUESTION_NOT_FOUND')
  const answer = readLearnerAnswer(q.type, input.answer)
  if (!answer)
    throw new ValidationError([
      { path: 'answer', message: 'That answer doesn’t fit this question.' },
    ])
  await ctx.db
    .insert(attemptAnswers)
    .values({ attemptId: attempt.id, questionId: input.questionId, answer, answeredAt: ctx.now })
    .onConflictDoUpdate({
      target: [attemptAnswers.attemptId, attemptAnswers.questionId],
      set: { answer, answeredAt: ctx.now },
    })
  await noteNetwork(ctx, attempt)
  return { savedAt: ctx.now }
}

/** Records a network the learner wasn't on at the start (hashed). Recorded, never blocking. */
async function noteNetwork(ctx: Ctx, attempt: AttemptRow) {
  const integrity = attempt.integrity as Integrity
  const ip = ctx.ipHash
  if (!ip || !integrity.startIpHash || ip === integrity.startIpHash) return
  if ((integrity.otherIpHashes ?? []).includes(ip)) return
  await ctx.db
    .update(quizAttempts)
    .set({
      integrity: sql`jsonb_set(${quizAttempts.integrity}, '{otherIpHashes}', coalesce(${quizAttempts.integrity}->'otherIpHashes', '[]'::jsonb) || to_jsonb(${ip}::text))`,
    })
    .where(eq(quizAttempts.id, attempt.id))
}

/** `exams.logIntegrityEvent`: a focus loss (with how long), a fullscreen exit, or a paste attempt. */
export async function logIntegrityEvent(
  ctx: Ctx,
  input: { attemptId: string; kind: IntegrityKind; durationMs?: number | undefined },
): Promise<{ ok: true }> {
  const { attempt } = await ownAttempt(ctx, input.attemptId)
  if (attempt.status !== 'in_progress') return { ok: true }
  const key = { focus_loss: 'focusLosses', fullscreen_exit: 'fullscreenExits', paste: 'pastes' }[
    input.kind
  ]
  const ms =
    input.kind === 'focus_loss' ? Math.max(0, Math.min(input.durationMs ?? 0, 4 * 3_600_000)) : 0
  await ctx.db
    .update(quizAttempts)
    .set({
      integrity: sql`${quizAttempts.integrity} || jsonb_build_object(
        ${key}::text, coalesce((${quizAttempts.integrity}->>${key})::int, 0) + 1,
        'focusLossMs', coalesce((${quizAttempts.integrity}->>'focusLossMs')::bigint, 0) + ${ms}
      )`,
    })
    .where(and(eq(quizAttempts.id, attempt.id), eq(quizAttempts.status, 'in_progress')))
  return { ok: true }
}

// ─── Submitting and grading ──────────────────────────────────────────────────────────────────

/** `quizzes.submit` / `exams.submit`. Submitting twice returns the same result. */
export async function submitAttempt(ctx: Ctx, attemptId: string): Promise<AttemptView> {
  const { attempt, quiz } = await ownAttempt(ctx, attemptId)
  const done =
    attempt.status === 'in_progress'
      ? await finalize(ctx, attempt.id, pastDeadline(attempt, ctx.now) ? 'auto' : 'manual')
      : attempt
  return buildView(ctx, done, quiz)
}

/** `quizzes.getAttempt`: the learner's own attempt (results per `show_answers`). */
export async function getAttempt(ctx: Ctx, attemptId: string): Promise<AttemptView> {
  const { attempt, quiz } = await ownAttempt(ctx, attemptId)
  if (attempt.status === 'in_progress' && pastDeadline(attempt, ctx.now)) {
    return buildView(ctx, await finalize(ctx, attempt.id, 'auto'), quiz)
  }
  return buildView(ctx, attempt, quiz)
}

/**
 * Grades and closes an attempt (idempotent: an attempt someone else already closed is returned
 * as it is). Completes the lesson when a practice quiz is submitted or a graded quiz or exam is
 * passed.
 */
async function finalize(ctx: Ctx, attemptId: string, mode: 'manual' | 'auto'): Promise<AttemptRow> {
  const out = await inTransaction(ctx, async (tx) => {
    const [a] = await tx.db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.id, attemptId))
      .for('update')
    if (!a) throw new NotFoundError('ATTEMPT_NOT_FOUND')
    const [quiz] = await tx.db.select().from(quizzes).where(eq(quizzes.id, a.quizId))
    if (!quiz) throw new NotFoundError('QUIZ_NOT_FOUND')
    if (a.status !== 'in_progress') return { attempt: a, quiz, closedNow: false }

    const settings = readSettings(quiz.settings)
    const [qs, answers] = await Promise.all([
      tx.db
        .select({
          id: questions.id,
          type: questions.type,
          options: questions.options,
          answer: questions.answer,
          points: questions.points,
        })
        .from(questions)
        .where(inArray(questions.id, a.questionIds)),
      tx.db
        .select({ questionId: attemptAnswers.questionId, answer: attemptAnswers.answer })
        .from(attemptAnswers)
        .where(eq(attemptAnswers.attemptId, a.id)),
    ])
    const result = gradeAttempt(qs, new Map(answers.map((x) => [x.questionId, x.answer])), {
      partialCredit: settings.partialCredit,
      passPct: settings.passPct,
    })
    const graded = answers.flatMap((x) => {
      const g = result.perQuestion.get(x.questionId)
      return g ? [{ questionId: x.questionId, ...g }] : []
    })
    if (graded.length > 0) {
      await tx.db.execute(sql`
        update ${attemptAnswers} set is_correct = v.correct, points_awarded = v.points, updated_at = now()
        from (values ${sql.join(
          graded.map(
            (g) => sql`(${g.questionId}::uuid, ${g.correct}::boolean, ${g.points}::numeric)`,
          ),
          sql`, `,
        )}) as v(question_id, correct, points)
        where ${attemptAnswers.attemptId} = ${a.id} and ${attemptAnswers.questionId} = v.question_id`)
    }
    const integrity = a.integrity as Integrity
    const reasons =
      quiz.kind === 'exam'
        ? flagReasons(integrity, {
            durationSec: Math.round((tx.now.getTime() - a.startedAt.getTime()) / 1000),
            questionCount: a.questionIds.length,
            passed: result.passed,
          })
        : []
    const [closed] = await tx.db
      .update(quizAttempts)
      .set({
        status: mode === 'auto' ? 'auto_submitted' : 'graded',
        submittedAt: tx.now,
        score: result.score,
        maxScore: result.maxScore,
        passed: result.passed,
        flagged: reasons.length > 0,
        integrity: { ...integrity, flagReasons: reasons } as Record<string, unknown>,
      })
      .where(eq(quizAttempts.id, a.id))
      .returning()
    if (!closed) throw new Error('attempt not closed')
    const event = {
      userId: a.userId,
      courseId: quiz.courseId,
      quizId: quiz.id,
      attemptId: a.id,
    }
    await tx.events.emit('quiz.submitted', { ...event, kind: quiz.kind, passed: result.passed })
    if (quiz.kind === 'exam' && result.passed) await tx.events.emit('exam.passed', event)
    return { attempt: closed, quiz, closedNow: true, pct: result.pct }
  })

  if (out.closedNow) {
    const { attempt, quiz } = out
    const passed = attempt.passed === true
    void track(
      ctx,
      quiz.kind === 'exam' ? 'exam_submitted' : 'quiz_submitted',
      quiz.kind === 'exam'
        ? {
            quiz_id: quiz.id,
            duration_sec: Math.round(
              ((attempt.submittedAt ?? ctx.now).getTime() - attempt.startedAt.getTime()) / 1000,
            ),
            passed,
            flagged: attempt.flagged,
          }
        : {
            quiz_id: quiz.id,
            kind: quiz.kind,
            score_pct: out.pct ?? 0,
            passed,
            attempt_no: attempt.attemptNo,
          },
      { distinctId: attempt.userId },
    )
    if (quiz.kind === 'practice' || passed) {
      const [lesson] = await ctx.db
        .select({ id: lessons.id, courseId: lessons.courseId, type: lessons.type })
        .from(lessons)
        .where(
          and(eq(lessons.quizId, quiz.id), isNotNull(lessons.liveSince), isNull(lessons.deletedAt)),
        )
      const enrolled = lesson
        ? await enrolledCourseIds(ctx, attempt.userId, [lesson.courseId])
        : new Set()
      if (lesson && enrolled.has(lesson.courseId)) {
        await completeLessonFor(ctx, { userId: attempt.userId, lesson })
      }
    }
  }
  return out.attempt
}

/** The `exam-autosubmit` job: closes attempts whose time ran out (docs/13). */
export async function autoSubmitExpired(ctx: Ctx, limit = 500): Promise<{ submitted: number }> {
  const due = await ctx.db
    .select({ id: quizAttempts.id })
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.status, 'in_progress'),
        lt(quizAttempts.deadlineAt, new Date(ctx.now.getTime() - GRACE_MS)),
      ),
    )
    .orderBy(asc(quizAttempts.deadlineAt))
    .limit(limit)
  for (const { id } of due) await finalize(ctx, id, 'auto')
  return { submitted: due.length }
}

// ─── The lesson's intro screen ───────────────────────────────────────────────────────────────

export interface QuizIntro {
  quizId: string
  kind: QuizKind
  questionCount: number
  timeLimitSec: number | null
  attemptsAllowed: number | null
  attemptsUsed: number
  passPct: number
  showAnswers: QuizSettings['showAnswers']
  oneQuestionPerScreen: boolean
  /** When the next attempt may start, if a cooldown is running. */
  availableAt: Date | null
  inProgress: { attemptId: string; deadlineAt: Date | null } | null
  lastAttempt: {
    attemptId: string
    status: AttemptRow['status']
    pct: number | null
    passed: boolean | null
    submittedAt: Date | null
  } | null
  /** Exams: lessons still to complete first (0 when not required). */
  lessonsRemaining: number
  /** Exams: starting ends a refund right the learner still has. */
  endsRefund: boolean
}

/** What the quiz lesson shows before starting (docs/20 quiz and exam lessons). */
export async function quizIntro(ctx: Ctx, lessonId: string): Promise<QuizIntro> {
  const user = requireUser(ctx.actor)
  const { access, lesson, quiz, settings } = await quizForLesson(ctx, lessonId)
  const learner = access.reason === 'enrolled'
  const [stats, attempts, count, remaining, refund] = await Promise.all([
    attemptStats(ctx, quiz.id, user.userId),
    ctx.db
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.quizId, quiz.id), eq(quizAttempts.userId, user.userId)))
      .orderBy(sql`${quizAttempts.attemptNo} desc`)
      .limit(2),
    questionsPerAttempt(ctx, quiz.id, settings),
    quiz.kind === 'exam' && learner && settings.requireAllLessons
      ? lessonsLeft(ctx, user.userId, lesson.courseId, lesson.id)
      : Promise.resolve(0),
    quiz.kind === 'exam' && learner
      ? purchaseRefundState(ctx, { userId: user.userId, courseId: lesson.courseId })
      : Promise.resolve(null),
  ])
  const open = attempts.find((a) => a.status === 'in_progress')
  const last = attempts.find((a) => a.status !== 'in_progress')
  const until = cooldownUntil(settings, stats.lastSubmittedAt)
  return {
    quizId: quiz.id,
    kind: quiz.kind,
    questionCount: count,
    timeLimitSec: settings.timeLimitSec,
    attemptsAllowed: settings.attemptsAllowed,
    attemptsUsed: stats.used,
    passPct: settings.passPct,
    showAnswers: settings.showAnswers,
    oneQuestionPerScreen: quiz.kind === 'exam' && settings.oneQuestionPerScreen,
    availableAt: until && until > ctx.now ? until : null,
    inProgress: open ? { attemptId: open.id, deadlineAt: open.deadlineAt } : null,
    lastAttempt: last
      ? {
          attemptId: last.id,
          status: last.status,
          pct:
            last.score !== null && last.maxScore
              ? Math.round((last.score * 10000) / last.maxScore) / 100
              : null,
          passed: last.passed,
          submittedAt: last.submittedAt,
        }
      : null,
    lessonsRemaining: remaining,
    endsRefund: refund?.state === 'open',
  }
}

async function questionsPerAttempt(ctx: Ctx, quizId: string, settings: QuizSettings) {
  if (settings.mode === 'fixed') {
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(quizQuestions)
      .innerJoin(questions, eq(questions.id, quizQuestions.questionId))
      .where(and(eq(quizQuestions.quizId, quizId), isNull(questions.archivedAt)))
    return row?.n ?? 0
  }
  const [row] = await ctx.db
    .select({
      n: sql<number>`coalesce(sum(least(${quizSources.questionCount}, (select count(*) from questions q where q.bank_id = ${quizSources.bankId} and q.archived_at is null and (cardinality(${quizSources.tagFilter}) = 0 or q.tags && ${quizSources.tagFilter})))), 0)::int`,
    })
    .from(quizSources)
    .where(eq(quizSources.quizId, quizId))
  return row?.n ?? 0
}

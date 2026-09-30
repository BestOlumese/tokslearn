import type { QuizSettings, RichTextDoc } from '@tokslearn/contract'
import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { and, eq, sql } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { addToCart, completeOrder, startCheckout } from '../commerce'
import { addStaff, getStudioCourse, removeLesson } from '../courses'
import type { UserActor } from '../kernel/actor'
import { fixedClock } from '../kernel/clock'
import { createCtx } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  addQuizLesson,
  archiveQuestion,
  autoSubmitExpired,
  createBank,
  createQuestion,
  getAttempt,
  getAttemptForReview,
  getStudioQuiz,
  listCourseQuizzes,
  listFlaggedAttempts,
  listQuestions,
  logIntegrityEvent,
  quizIntro,
  saveAnswer,
  setQuizQuestions,
  setQuizSources,
  startAttempt,
  submitAttempt,
  updateQuiz,
  voidAttempt,
} from '.'

afterAll(closeTestDb)

const T0 = new Date('2026-10-01T09:00:00Z')
const at = (sec: number) => new Date(T0.getTime() + sec * 1000)
const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const c = (...ids: string[]) => ids.map((id) => ({ id, text: `Option ${id.toUpperCase()}` }))

/** A bank with one question of every type, and the answers that get them all right. */
const QUESTIONS = [
  {
    type: 'single',
    options: { choices: c('a', 'b', 'c') },
    answer: { choice: 'b' },
    right: { choice: 'b' },
  },
  {
    type: 'multiple',
    options: { choices: c('a', 'b', 'c') },
    answer: { choices: ['a', 'c'] },
    right: { choices: ['c', 'a'] },
  },
  { type: 'true_false', options: {}, answer: { value: true }, right: { value: true } },
  {
    type: 'short_text',
    options: {},
    answer: { accepted: ['Zanzibar-naira'] },
    right: { text: 'zanzibar-naira.' },
  },
  {
    type: 'ordering',
    options: { items: c('a', 'b', 'c') },
    answer: { order: ['c', 'a', 'b'] },
    right: { order: ['c', 'a', 'b'] },
  },
  {
    type: 'matching',
    options: { left: c('a', 'b'), right: c('x', 'y', 'z') },
    answer: {
      pairs: [
        { left: 'a', right: 'y' },
        { left: 'b', right: 'x' },
      ],
    },
    right: {
      pairs: [
        { left: 'a', right: 'y' },
        { left: 'b', right: 'x' },
      ],
    },
  },
] as const

async function world(
  db: Db,
  opts: { kind?: 'practice' | 'graded' | 'exam'; settings?: Partial<QuizSettings> } = {},
) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const teach = env.ctx(owner, T0)

  const bank = await createBank(teach, { courseId: course.id, title: 'Money basics' })
  const made = []
  for (const q of QUESTIONS) {
    made.push(
      await createQuestion(teach, {
        bankId: bank.id,
        type: q.type,
        prompt: doc(`Question about ${q.type}`),
        options: q.options,
        answer: q.answer,
        explanation: doc(`Because of ${q.type}.`),
        points: 2,
        tags: [q.type === 'short_text' ? 'words' : 'picks'],
      }),
    )
  }
  const studio = await getStudioCourse(teach, course.id)
  const sectionId = studio.sections[0]?.id ?? ''
  const kind = opts.kind ?? 'graded'
  const after = await addQuizLesson(teach, {
    courseId: course.id,
    version: studio.version,
    sectionId,
    title: kind === 'exam' ? 'Final exam' : 'Check your understanding',
    kind,
  })
  const lesson = after.sections.flatMap((s) => s.lessons).find((l) => l.type === 'quiz')
  if (!lesson?.quizId) throw new Error('quiz lesson missing')
  // A new lesson goes live at the next review; tests skip the review.
  await db.update(schema.lessons).set({ liveSince: T0 }).where(eq(schema.lessons.id, lesson.id))
  await setQuizQuestions(teach, { quizId: lesson.quizId, questionIds: made.map((q) => q.id) })
  const quiz = await getStudioQuiz(teach, lesson.quizId)
  await updateQuiz(teach, {
    quizId: quiz.id,
    kind,
    settings: { ...quiz.settings, showAnswers: 'after_submit', ...opts.settings },
  })

  const buyer = testUser(['learner'], {
    userId: await insertUser(db, { name: 'Ada Eze', email: 'ada@example.com' }),
  })
  const bc = env.ctx(buyer, T0)
  await addToCart(bc, { itemType: 'course', itemId: course.id })
  const order = await startCheckout(bc, {
    expectedTotalKobo: 1_500_000n,
    idempotencyKey: 'buy',
    anonymousId: null,
  })
  await completeOrder(bc, { reference: order.publicId, via: 'confirm' })

  const rightAnswers = new Map(made.map((q, i) => [q.id, QUESTIONS[i]?.right]))
  return {
    env,
    owner,
    reviewer,
    course,
    bank,
    questions: made,
    lesson,
    quizId: lesson.quizId,
    buyer,
    order,
    rightAnswers,
  }
}

describe('authoring', () => {
  it('lists only quizzes still in the curriculum', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, quizId } = await world(db)
      const teach = env.ctx(owner, T0)
      let studio = await getStudioCourse(teach, course.id)
      studio = await addQuizLesson(teach, {
        courseId: course.id,
        version: studio.version,
        sectionId: studio.sections[0]?.id ?? '',
        title: 'Second check',
        kind: 'practice',
      })
      const draft = studio.sections
        .flatMap((s) => s.lessons)
        .find((l) => l.title === 'Second check')
      expect((await listCourseQuizzes(teach, course.id)).map((q) => q.lessonTitle)).toEqual([
        'Check your understanding',
        'Second check',
      ])
      // A lesson that never went live is deleted outright; its quiz row stays behind.
      await removeLesson(teach, {
        courseId: course.id,
        version: studio.version,
        lessonId: draft?.id ?? '',
      })
      expect((await listCourseQuizzes(teach, course.id)).map((q) => q.id)).toEqual([quizId])
    })
  })

  it('validates questions, keeps answers to the studio, and lets TAs look but not change', async () => {
    await withRollback(async (db) => {
      const { env, owner, course, bank, questions, quizId } = await world(db)
      const teach = env.ctx(owner, T0)
      expect(
        await codeOf(
          createQuestion(teach, {
            bankId: bank.id,
            type: 'single',
            prompt: doc('Pick one'),
            options: { choices: c('a', 'b') },
            answer: { choice: 'z' },
            points: 1,
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      // Stored keys are the validated ones (defaults filled in).
      expect((await listQuestions(teach, bank.id)).map((q) => q.answer)).toEqual(
        QUESTIONS.map((q) =>
          q.type === 'short_text' ? { ...q.answer, caseSensitive: false } : q.answer,
        ),
      )

      const taId = await insertUser(db, { email: 'ta@example.com', roles: ['learner'] })
      await addStaff(teach, { courseId: course.id, emailOrUsername: 'ta@example.com' })
      const ta = env.ctx(testUser(['learner'], { userId: taId }), T0)
      expect((await getStudioQuiz(ta, quizId)).canEdit).toBe(false)
      expect(await codeOf(createBank(ta, { courseId: course.id, title: 'Mine' }))).toBe(
        'NOT_COURSE_OWNER',
      )

      const stranger = env.ctx(
        testUser(['learner', 'instructor'], { userId: await insertUser(db) }),
        T0,
      )
      expect(await codeOf(getStudioQuiz(stranger, quizId))).toBe('QUIZ_NOT_FOUND')
      expect(await codeOf(listQuestions(stranger, bank.id))).toBe('QUESTION_BANK_NOT_FOUND')

      // Exams need a time limit.
      const quiz = await getStudioQuiz(teach, quizId)
      expect(
        await codeOf(
          updateQuiz(teach, {
            quizId,
            kind: 'exam',
            settings: { ...quiz.settings, timeLimitSec: null },
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      // Archiving takes a question out of the quiz.
      await archiveQuestion(teach, questions[0]?.id ?? '')
      expect((await getStudioQuiz(teach, quizId)).questionsPerAttempt).toBe(5)
    })
  })
})

describe('taking a quiz', () => {
  it('never sends the answer key while the attempt is open, grades on submit, and completes the lesson on a pass', async () => {
    await withRollback(async (db) => {
      const { env, buyer, lesson, quizId, rightAnswers } = await world(db, {
        settings: { passPct: 70 },
      })
      const me = env.ctx(buyer, at(0))
      const intro = await quizIntro(me, lesson.id)
      expect(intro).toMatchObject({
        quizId,
        questionCount: 6,
        attemptsAllowed: 3,
        attemptsUsed: 0,
        inProgress: null,
      })

      const attempt = await startAttempt(me, { lessonId: lesson.id })
      const open = JSON.stringify(attempt)
      // Nothing from any answer key leaves the server: not the accepted text, not the key fields.
      expect(open).not.toContain('Zanzibar')
      for (const field of [
        '"answer"',
        '"accepted"',
        '"choice"',
        '"order"',
        '"pairs"',
        'explanation',
      ]) {
        expect(open).not.toContain(field)
      }
      expect(attempt.result).toBeNull()
      expect(attempt.questions).toHaveLength(6)
      const ordering = attempt.questions.find((q) => q.type === 'ordering')
      if (!ordering) throw new Error('no ordering question')
      expect(
        (ordering.options as { items: Array<{ id: string }> }).items.map((i) => i.id),
      ).not.toEqual(['c', 'a', 'b'])

      // Answer everything right except the matching question.
      for (const q of attempt.questions) {
        const answer =
          q.type === 'matching'
            ? {
                pairs: [
                  { left: 'a', right: 'x' },
                  { left: 'b', right: 'y' },
                ],
              }
            : rightAnswers.get(q.id)
        await saveAnswer(env.ctx(buyer, at(30)), {
          attemptId: attempt.id,
          questionId: q.id,
          answer,
        })
      }
      expect(
        await codeOf(
          saveAnswer(me, {
            attemptId: attempt.id,
            questionId: attempt.questions[0]?.id ?? '',
            answer: { wrong: true },
          }),
        ),
      ).toBe('VALIDATION_FAILED')
      const done = await submitAttempt(env.ctx(buyer, at(60)), attempt.id)
      expect(done.status).toBe('graded')
      expect(done.result).toMatchObject({ score: 10, maxScore: 12, passed: true })
      expect(done.result?.pct).toBeCloseTo(83.33, 2)
      const feedback = done.result?.feedback ?? {}
      const matching = attempt.questions.find((q) => q.type === 'matching')?.id ?? ''
      expect(feedback[matching]).toMatchObject({ correct: false, points: 0 })
      expect(JSON.stringify(done)).toContain('Zanzibar')

      // Submitting again changes nothing; saving after is refused.
      expect((await submitAttempt(env.ctx(buyer, at(90)), attempt.id)).result?.score).toBe(10)
      expect(
        await codeOf(
          saveAnswer(me, { attemptId: attempt.id, questionId: matching, answer: { pairs: [] } }),
        ),
      ).toBe('ATTEMPT_ALREADY_SUBMITTED')
      const [progress] = await db
        .select()
        .from(schema.lessonProgress)
        .where(
          and(
            eq(schema.lessonProgress.userId, buyer.userId),
            eq(schema.lessonProgress.lessonId, lesson.id),
          ),
        )
      expect(progress?.status).toBe('completed')
      const events = await db.select({ name: schema.outbox.eventName }).from(schema.outbox)
      expect(events.map((e) => e.name)).toContain('quiz.submitted')
    })
  })

  it('hides answers per show_answers, and enforces one attempt at a time, attempt limits and cooldowns', async () => {
    await withRollback(async (db) => {
      const { env, buyer, lesson, quizId, owner } = await world(db, {
        settings: { showAnswers: 'never', attemptsAllowed: 2, cooldownHours: 1, passPct: 100 },
      })
      const a1 = await startAttempt(env.ctx(buyer, at(0)), { lessonId: lesson.id })
      expect(await codeOf(startAttempt(env.ctx(buyer, at(5)), { lessonId: lesson.id }))).toBe(
        'ATTEMPT_IN_PROGRESS',
      )
      const r1 = await submitAttempt(env.ctx(buyer, at(10)), a1.id)
      expect(r1.result).toMatchObject({ score: 0, passed: false, feedback: null })
      expect(JSON.stringify(r1)).not.toContain('Zanzibar')
      expect(await codeOf(startAttempt(env.ctx(buyer, at(20)), { lessonId: lesson.id }))).toBe(
        'COOLDOWN_ACTIVE',
      )
      const a2 = await startAttempt(env.ctx(buyer, at(3700)), { lessonId: lesson.id })
      expect(a2.attemptNo).toBe(2)
      await submitAttempt(env.ctx(buyer, at(3710)), a2.id)
      expect(await codeOf(startAttempt(env.ctx(buyer, at(9000)), { lessonId: lesson.id }))).toBe(
        'NO_ATTEMPTS_LEFT',
      )

      // after_pass: a failed attempt shows no answers.
      const quiz = await getStudioQuiz(env.ctx(owner, T0), quizId)
      await updateQuiz(env.ctx(owner, T0), {
        quizId,
        kind: 'graded',
        settings: { ...quiz.settings, showAnswers: 'after_pass' },
      })
      expect((await getAttempt(env.ctx(buyer, at(9000)), a2.id)).result?.feedback).toBeNull()

      // Strangers can't start or read.
      const stranger = env.ctx(testUser(['learner'], { userId: await insertUser(db) }), at(0))
      expect(await codeOf(startAttempt(stranger, { lessonId: lesson.id }))).toBe('NOT_ENROLLED')
      expect(await codeOf(getAttempt(stranger, a1.id))).toBe('ATTEMPT_NOT_FOUND')
    })
  })

  it('draws from banks by tag, and says when a quiz has nothing to draw', async () => {
    await withRollback(async (db) => {
      const { env, owner, buyer, lesson, quizId, bank, questions } = await world(db)
      const teach = env.ctx(owner, T0)
      const quiz = await getStudioQuiz(teach, quizId)
      await updateQuiz(teach, {
        quizId,
        kind: 'graded',
        settings: { ...quiz.settings, mode: 'draw' },
      })
      const drawn = await setQuizSources(teach, {
        quizId,
        sources: [{ bankId: bank.id, questionCount: 3, tagFilter: ['picks'] }],
      })
      expect(drawn.questionsPerAttempt).toBe(3)
      const a = await startAttempt(env.ctx(buyer, at(0)), { lessonId: lesson.id })
      const shortText = questions.find((q) => q.type === 'short_text')?.id
      expect(a.questions).toHaveLength(3)
      expect(a.questions.map((q) => q.id)).not.toContain(shortText)
      await submitAttempt(env.ctx(buyer, at(5)), a.id)
      await setQuizSources(teach, { quizId, sources: [] })
      expect(await codeOf(startAttempt(env.ctx(buyer, at(10)), { lessonId: lesson.id }))).toBe(
        'QUIZ_EMPTY',
      )
    })
  })
})

describe('exams', () => {
  it('asks for confirmation, ends the refund right, keeps time on the server and auto-submits', async () => {
    await withRollback(async (db) => {
      const { env, buyer, lesson, order, rightAnswers } = await world(db, {
        kind: 'exam',
        settings: {
          requireAllLessons: false,
          timeLimitSec: 60,
          attemptsAllowed: 3,
          cooldownHours: 0,
          shuffleQuestions: true,
        },
      })
      const intro = await quizIntro(env.ctx(buyer, at(0)), lesson.id)
      expect(intro).toMatchObject({ kind: 'exam', timeLimitSec: 60, endsRefund: true })
      expect(await codeOf(startAttempt(env.ctx(buyer, at(0)), { lessonId: lesson.id }))).toBe(
        'CONFIRMATION_REQUIRED',
      )
      const a = await startAttempt(env.ctx(buyer, at(0)), { lessonId: lesson.id, confirmed: true })
      expect(a.deadlineAt?.toISOString()).toBe(at(60).toISOString())
      const [item] = await db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, order.orderId))
      expect(item?.status).toBe('non_refundable')
      const consumed = await db
        .select()
        .from(schema.consumptionEvents)
        .where(eq(schema.consumptionEvents.kind, 'exam_started'))
      expect(consumed).toHaveLength(1)

      const first = a.questions[0]
      if (!first) throw new Error('no questions')
      // Within the 5 s grace: accepted. After it: the attempt is closed.
      await saveAnswer(env.ctx(buyer, at(64)), {
        attemptId: a.id,
        questionId: first.id,
        answer: rightAnswers.get(first.id),
      })
      expect(
        await codeOf(
          saveAnswer(env.ctx(buyer, at(66)), {
            attemptId: a.id,
            questionId: first.id,
            answer: rightAnswers.get(first.id),
          }),
        ),
      ).toBe('ATTEMPT_EXPIRED')
      const closed = await getAttempt(env.ctx(buyer, at(70)), a.id)
      expect(closed.status).toBe('auto_submitted')
      expect(closed.result?.score).toBe(2)

      // The job closes attempts nobody came back to.
      const b = await startAttempt(env.ctx(buyer, at(100)), {
        lessonId: lesson.id,
        confirmed: true,
      })
      expect(
        await autoSubmitExpired(env.ctx({ kind: 'system', reason: 'exam-autosubmit' }, at(150))),
      ).toEqual({ submitted: 0 })
      expect(
        await autoSubmitExpired(env.ctx({ kind: 'system', reason: 'exam-autosubmit' }, at(166))),
      ).toEqual({ submitted: 1 })
      expect((await getAttempt(env.ctx(buyer, at(170)), b.id)).status).toBe('auto_submitted')
      // Answers are hidden for exams by default... this one shows them after submit (set above).
    })
  })

  it('requires every other lesson first when set, and flags attempts over the integrity thresholds', async () => {
    await withRollback(async (db) => {
      const { env, owner, buyer, lesson, rightAnswers } = await world(db, {
        kind: 'exam',
        settings: { requireAllLessons: true, timeLimitSec: 600 },
      })
      expect(
        await codeOf(startAttempt(env.ctx(buyer, at(0)), { lessonId: lesson.id, confirmed: true })),
      ).toBe('EXAM_NOT_ELIGIBLE')
      expect((await quizIntro(env.ctx(buyer, at(0)), lesson.id)).lessonsRemaining).toBe(3)
      await db.update(schema.quizzes).set({
        settings: sql`${schema.quizzes.settings} || '{"requireAllLessons": false}'::jsonb`,
      })

      const env2 = setup(db)
      const withIp = (who: UserActor, sec: number, ipHash: string) =>
        createCtx({
          db,
          actor: who,
          requestId: 'req-test',
          clock: fixedClock(at(sec)),
          ipHash,
          providers: {
            storage: env2.storage,
            video: env2.bunny.provider,
            payments: env2.paystack.provider,
            sessions: { revokeSession: vi.fn(), revokeAllSessions: vi.fn() },
            urls: { app: 'https://tokslearn.test', cdn: null },
          },
        })
      const a = await startAttempt(withIp(buyer, 0, 'home-wifi'), {
        lessonId: lesson.id,
        confirmed: true,
      })
      for (let i = 0; i < 5; i++) {
        await logIntegrityEvent(withIp(buyer, 10 + i, 'home-wifi'), {
          attemptId: a.id,
          kind: 'focus_loss',
          durationMs: 4000,
        })
      }
      await logIntegrityEvent(withIp(buyer, 20, 'home-wifi'), { attemptId: a.id, kind: 'paste' })
      const q = a.questions[0]
      if (!q) throw new Error('no questions')
      await saveAnswer(withIp(buyer, 30, 'phone-data'), {
        attemptId: a.id,
        questionId: q.id,
        answer: rightAnswers.get(q.id),
      })
      await submitAttempt(withIp(buyer, 40, 'phone-data'), a.id)
      const [row] = await db
        .select()
        .from(schema.quizAttempts)
        .where(eq(schema.quizAttempts.id, a.id))
      expect(row?.flagged).toBe(true)
      expect(row?.integrity).toMatchObject({
        focusLosses: 5,
        focusLossMs: 20000,
        pastes: 1,
        otherIpHashes: ['phone-data'],
        flagReasons: ['focus_loss', 'network_change'],
      })

      // The instructor reviews it: signals summarised, networks counted, never the IP hashes.
      const teach = env.ctx(owner, at(100))
      const flagged = await listFlaggedAttempts(teach)
      expect(flagged).toEqual([
        expect.objectContaining({
          attemptId: a.id,
          learnerName: 'Ada E.',
          reasons: ['focus_loss', 'network_change'],
        }),
      ])
      const review = await getAttemptForReview(teach, a.id)
      expect(review.integrity).toMatchObject({ focusLosses: 5, networksSeen: 2 })
      expect(JSON.stringify(review)).not.toContain('phone-data')
      expect(await codeOf(voidAttempt(teach, { attemptId: a.id, reason: 'short' }))).toBe(
        'VALIDATION_FAILED',
      )
      const stranger = env.ctx(
        testUser(['learner', 'instructor'], { userId: await insertUser(db) }),
        at(100),
      )
      expect(
        await codeOf(voidAttempt(stranger, { attemptId: a.id, reason: 'Not my course at all.' })),
      ).toBe('ATTEMPT_NOT_FOUND')
      const voided = await voidAttempt(teach, {
        attemptId: a.id,
        reason: 'Left the exam five times for long stretches.',
      })
      expect(voided.status).toBe('void')
      expect(await listFlaggedAttempts(teach)).toEqual([])
      const outbox = await db.select({ payload: schema.outbox.payload }).from(schema.outbox)
      expect(outbox.map((o) => (o.payload as { id?: string }).id)).toContain('attempt-voided')
      // A voided attempt doesn't count toward the limit.
      expect((await quizIntro(env.ctx(buyer, at(120)), lesson.id)).attemptsUsed).toBe(0)
    })
  })
})

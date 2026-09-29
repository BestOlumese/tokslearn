import { createRouterClient } from '@orpc/server'
import { grantEnrollment } from '@tokslearn/core/enrollments'
import { approveChanges, people, publishCourse, setup } from '@tokslearn/core/fixtures'
import { type Actor, anonymousActor, inTransaction } from '@tokslearn/core/kernel'
import { insertUser, testUser } from '@tokslearn/core/testing'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { afterAll, describe, expect, it } from 'vitest'
import { router } from './router'
import { testContext } from './test-context'

afterAll(closeTestDb)

const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
})

/** Every field name in a value, with array positions collapsed ("questions[].options.choices[].text"). */
function fieldPaths(value: unknown, prefix = ''): Set<string> {
  const out = new Set<string>()
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item, `${path}[]`)
    } else if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        // Record keys that are ids (answers by question id) collapse to "{id}".
        const key = /^[0-9a-f-]{36}$/.test(k) ? '{id}' : k
        const next = path ? `${path}.${key}` : key
        out.add(next)
        walk(child, next)
      }
    }
  }
  walk(value, prefix)
  return out
}

describe('quiz and exam procedures', () => {
  it('never sends answer keys in an open attempt, and grades through the API', async () => {
    await withRollback(async (db) => {
      await seedCatalog(db)
      await seedCommission(db)
      const env = setup(db)
      const { owner, reviewer } = await people(db)
      const course = await publishCourse(env, owner, reviewer)
      const providers = { urls: { app: 'https://tokslearn.test', cdn: null } }
      const client = (actor: Actor = anonymousActor) =>
        createRouterClient(router, { context: testContext({ db, actor, providers }) })
      const teacher = client(owner)

      const bank = await teacher.studio.questionBanks.create({
        courseId: course.id,
        title: 'Checks',
      })
      const single = await teacher.studio.questions.create({
        bankId: bank.id,
        type: 'single',
        prompt: doc('Which is the naira sign?'),
        options: {
          choices: [
            { id: 'a', text: '$' },
            { id: 'b', text: '₦' },
          ],
        },
        answer: { choice: 'b' },
        explanation: doc('The naira sign is ₦.'),
        points: 1,
      })
      const text = await teacher.studio.questions.create({
        bankId: bank.id,
        type: 'short_text',
        prompt: doc('Name the currency.'),
        options: {},
        answer: { accepted: ['Naira-secret-word'] },
        points: 1,
      })
      expect(single.answer).toEqual({ choice: 'b' })

      const studio = await teacher.studio.courses.get({ courseId: course.id })
      const after = await teacher.studio.lessons.add({
        courseId: course.id,
        version: studio.version,
        sectionId: studio.sections[0]?.id ?? '',
        type: 'exam',
        title: 'Final exam',
      })
      const lesson = after.sections.flatMap((s) => s.lessons).find((l) => l.type === 'quiz')
      if (!lesson?.quizId) throw new Error('no exam lesson')
      // A new lesson goes live when the course's changes are approved.
      await approveChanges(env, owner, reviewer, course.id)
      await teacher.studio.quizzes.setQuestions({
        quizId: lesson.quizId,
        questionIds: [single.id, text.id],
      })
      const quiz = await teacher.studio.quizzes.get({ quizId: lesson.quizId })
      expect(quiz).toMatchObject({
        kind: 'exam',
        questionsPerAttempt: 2,
        settings: { showAnswers: 'never', timeLimitSec: 3600 },
      })
      await teacher.studio.quizzes.update({
        quizId: quiz.id,
        kind: 'exam',
        settings: { ...quiz.settings, requireAllLessons: false },
      })

      const learnerId = await insertUser(db, { roles: ['learner'] })
      await inTransaction(env.ctx({ kind: 'system', reason: 'test' }), (tx) =>
        grantEnrollment(tx, { userId: learnerId, courseId: course.id, source: 'free' }),
      )
      const learner = client(testUser(['learner'], { userId: learnerId }))
      expect((await learner.quizzes.intro({ lessonId: lesson.id })).kind).toBe('exam')
      await expect(
        learner.exams.start({ lessonId: lesson.id, confirmed: false }),
      ).rejects.toMatchObject({
        data: { code: 'CONFIRMATION_REQUIRED' },
      })
      const attempt = await learner.exams.start({ lessonId: lesson.id, confirmed: true })
      expect(typeof attempt.serverNow).toBe('string')

      // The whole open attempt, field by field: nothing that could carry an answer key.
      expect([...fieldPaths(attempt)].sort()).toEqual(
        [
          'answers',
          'attemptNo',
          'deadlineAt',
          'id',
          'kind',
          'lessonId',
          'oneQuestionPerScreen',
          'questions',
          'questions[].id',
          'questions[].options',
          'questions[].options.choices',
          'questions[].options.choices[].id',
          'questions[].options.choices[].text',
          'questions[].points',
          'questions[].promptHtml',
          'questions[].type',
          'quizId',
          'result',
          'serverNow',
          'startedAt',
          'status',
          'submittedAt',
        ].sort(),
      )
      expect(JSON.stringify(attempt)).not.toContain('Naira-secret-word')

      await learner.exams.saveAnswer({
        attemptId: attempt.id,
        questionId: single.id,
        answer: { choice: 'b' },
      })
      await learner.exams.saveAnswer({
        attemptId: attempt.id,
        questionId: text.id,
        answer: { text: 'naira-secret-word.' },
      })
      // Wrong shape for the question: refused.
      await expect(
        learner.exams.saveAnswer({
          attemptId: attempt.id,
          questionId: single.id,
          answer: { value: true },
        }),
      ).rejects.toMatchObject({ data: { code: 'VALIDATION_FAILED' } })
      const done = await learner.exams.submit({ attemptId: attempt.id })
      expect(done.result).toMatchObject({
        score: 2,
        maxScore: 2,
        pct: 100,
        passed: true,
        feedback: null,
      })
      // Exams show no answers by default, even after submitting.
      expect(JSON.stringify(done)).not.toContain('Naira-secret-word')
      expect(done.result?.feedback).toBeNull()

      // Someone who can't see the course can't read the exam or the attempt.
      const outsider = client(
        testUser(['learner'], { userId: await insertUser(db, { roles: ['learner'] }) }),
      )
      await expect(outsider.quizzes.getAttempt({ attemptId: attempt.id })).rejects.toMatchObject({
        data: { code: 'ATTEMPT_NOT_FOUND' },
      })
      await expect(outsider.studio.questions.list({ bankId: bank.id })).rejects.toMatchObject({
        data: { code: 'QUESTION_BANK_NOT_FOUND' },
      })
      await expect(client().quizzes.intro({ lessonId: lesson.id })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })
})

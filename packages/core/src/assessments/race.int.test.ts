import { newId, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, getTestDb, resetTestDb } from '@tokslearn/db/testing'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getStudioCourse } from '../courses'
import { grantEnrollment } from '../enrollments'
import { inTransaction } from '../kernel/ctx'
import { DomainError } from '../kernel/errors'
import { insertUser, testUser } from '../kernel/testing'
import { people, publishCourse, setup } from '../testing'
import { addQuizLesson, createBank, createQuestion, setQuizQuestions, startAttempt } from '.'

// docs/phases/phase-06 acceptance: one in-progress attempt per user and quiz under concurrency.
// Real transactions on separate connections, so this commits (fresh ids every run).

afterAll(async () => {
  await resetTestDb()
  await closeTestDb()
})

describe('starting a quiz concurrently', () => {
  it('five simultaneous starts give one attempt; the others point at it', async () => {
    const db = await getTestDb()
    await seedCatalog(db)
    await seedCommission(db)
    const env = setup(db)
    const { owner, reviewer } = await people(db)
    const course = await publishCourse(env, owner, reviewer, { title: `Race quiz ${newId()}` })
    const teach = env.ctx(owner)
    const bank = await createBank(teach, { courseId: course.id, title: 'Race bank' })
    const q = await createQuestion(teach, {
      bankId: bank.id,
      type: 'true_false',
      prompt: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes?' }] }],
      },
      options: {},
      answer: { value: true },
      points: 1,
    })
    const studio = await getStudioCourse(teach, course.id)
    const after = await addQuizLesson(teach, {
      courseId: course.id,
      version: studio.version,
      sectionId: studio.sections[0]?.id ?? '',
      title: 'Race quiz',
      kind: 'graded',
    })
    const lesson = after.sections.flatMap((s) => s.lessons).find((l) => l.type === 'quiz')
    if (!lesson?.quizId) throw new Error('no quiz lesson')
    await db
      .update(schema.lessons)
      .set({ liveSince: new Date() })
      .where(eq(schema.lessons.id, lesson.id))
    await setQuizQuestions(teach, { quizId: lesson.quizId, questionIds: [q.id] })

    const userId = await insertUser(db, {
      roles: ['learner'],
      email: `race-${newId()}@example.test`,
    })
    await inTransaction(env.ctx({ kind: 'system', reason: 'test' }), (tx) =>
      grantEnrollment(tx, { userId, courseId: course.id, source: 'free' }),
    )
    const learner = testUser(['learner'], { userId })

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        startAttempt(env.ctx(learner, new Date()), { lessonId: lesson.id }),
      ),
    )
    const started = results.filter((r) => r.status === 'fulfilled')
    const refused = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []))
    expect(started).toHaveLength(1)
    expect(refused).toHaveLength(4)
    for (const e of refused) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('ATTEMPT_IN_PROGRESS')
    }
    const open = await db
      .select()
      .from(schema.quizAttempts)
      .where(
        and(eq(schema.quizAttempts.userId, userId), eq(schema.quizAttempts.status, 'in_progress')),
      )
    expect(open).toHaveLength(1)
  })
})

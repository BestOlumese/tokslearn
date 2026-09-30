import type { RichTextDoc } from '@tokslearn/contract'
import { type Db, schema } from '@tokslearn/db'
import { seedCatalog, seedCommission } from '@tokslearn/db/seed'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetFeatureFlagCache } from '../admin'
import { createCohort, setCohortSelling, setCohortStatus } from '../cohorts'
import { addStaff, getStudioCourse } from '../courses'
import { grantEnrollment } from '../enrollments'
import { inTransaction } from '../kernel/ctx'
import { insertUser, testUser } from '../kernel/testing'
import { codeOf, people, publishCourse, setup } from '../testing'
import {
  acceptAnswer,
  createThread,
  getThread,
  handleReport,
  listOpenReports,
  listThreads,
  moderate,
  reply,
  report,
  sendAnnouncementEmails,
  unansweredQuestions,
} from '.'

afterAll(closeTestDb)
beforeEach(() => resetFeatureFlagCache())

const T0 = new Date('2026-10-01T09:00:00Z')
const para = (text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) =>
  ({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] },
    ],
  }) as RichTextDoc

async function flags(db: Db, ...keys: string[]) {
  for (const key of keys) {
    await db
      .insert(schema.featureFlags)
      .values({ key, enabled: true })
      .onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: true } })
  }
  resetFeatureFlagCache()
}

async function world(db: Db) {
  await seedCatalog(db)
  await seedCommission(db)
  const env = setup(db)
  const { owner, reviewer } = await people(db)
  const course = await publishCourse(env, owner, reviewer)
  const teach = env.ctx(owner, T0)
  let n = 0
  const person = async (
    opts: { enrolled?: boolean; cohortId?: string | null; old?: boolean } = {},
  ) => {
    n++
    const userId = await insertUser(db, {
      name: `Ada Learner${n}`,
      email: `ada${n}@example.com`,
      username: `ada${n}`,
    })
    // Accounts are a year old unless the test wants a brand-new one.
    if (opts.old !== false) {
      await db
        .update(schema.user)
        .set({ createdAt: new Date('2025-10-01T09:00:00Z') })
        .where(eq(schema.user.id, userId))
    }
    if (opts.enrolled !== false) {
      await inTransaction(env.ctx({ kind: 'system', reason: 'test' }, T0), (tx) =>
        grantEnrollment(tx, {
          userId,
          courseId: course.id,
          source: 'free',
          cohortId: opts.cohortId ?? null,
        }),
      )
    }
    return testUser(['learner'], { userId })
  }
  return { env, owner, reviewer, course, teach, person }
}

describe('access', () => {
  it('needs the flag, and keeps courses and cohorts to their members', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      const a = await w.person()
      expect(await codeOf(listThreads(w.env.ctx(a, T0), { courseId: w.course.id }))).toBe(
        'FEATURE_DISABLED',
      )
      await flags(db, 'community', 'cohorts')

      await setCohortSelling(w.teach, { courseId: w.course.id, cohortBased: true })
      const s = await createCohort(w.teach, {
        courseId: w.course.id,
        name: 'November 2026',
        startsAt: new Date('2026-11-01T00:00:00Z'),
        endsAt: new Date('2026-12-01T00:00:00Z'),
        enrollOpensAt: null,
        enrollClosesAt: null,
        capacity: null,
      })
      const run = s.cohorts[0]
      if (!run) throw new Error('no run')
      await setCohortStatus(w.teach, { cohortId: run.id, status: 'open' })
      const inRun = await w.person({ cohortId: run.id })
      const outsider = await w.person({ enrolled: false })

      const cohortThread = await createThread(w.env.ctx(inRun, T0), {
        scopeType: 'cohort',
        scopeId: run.id,
        kind: 'discussion',
        title: 'Study group on Saturdays?',
        body: para('Anyone want to meet on Saturdays?'),
      })
      // Phase 8 acceptance: not in the cohort, not in the thread.
      expect(await codeOf(getThread(w.env.ctx(a, T0), cohortThread.id))).toBe('THREAD_NOT_FOUND')
      expect(await codeOf(getThread(w.env.ctx(outsider, T0), cohortThread.id))).toBe(
        'THREAD_NOT_FOUND',
      )
      expect(
        await codeOf(reply(w.env.ctx(a, T0), { threadId: cohortThread.id, body: para('Me too') })),
      ).toBe('THREAD_NOT_FOUND')
      expect((await listThreads(w.env.ctx(a, T0), { courseId: w.course.id })).items).toEqual([])
      expect(
        (await listThreads(w.env.ctx(inRun, T0), { courseId: w.course.id })).items.map(
          (t) => t.title,
        ),
      ).toEqual(['Study group on Saturdays?'])
      // The instructor sees every run's threads.
      expect((await getThread(w.teach, cohortThread.id)).title).toBe('Study group on Saturdays?')
      expect(await codeOf(listThreads(w.env.ctx(outsider, T0), { courseId: w.course.id }))).toBe(
        'COURSE_NOT_FOUND',
      )
    })
  })
})

describe('posting', () => {
  it('turns scripts into text and drops unsafe links (Phase 8 acceptance)', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'community')
      const a = await w.person()
      const t = await createThread(w.env.ctx(a, T0), {
        scopeType: 'course',
        scopeId: w.course.id,
        kind: 'discussion',
        title: 'Formatting <b>test</b>',
        body: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'click',
                  marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
                },
              ],
            },
            { type: 'image', attrs: { src: 'https://evil.test/x.png', onerror: 'alert(1)' } },
          ],
        } as RichTextDoc,
      })
      expect(t.bodyHtml).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p>click</p>')
      expect(t.bodyHtml).not.toContain('<script')
      expect(t.bodyHtml).not.toContain('javascript:')
      // Titles are text, rendered escaped by the page.
      expect(t.title).toBe('Formatting <b>test</b>')
    })
  })

  it('filters words for learners, keeps links from new accounts, and checks lengths', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'community')
      const a = await w.person()
      const fresh = await w.person({ old: false })
      const post = (who: typeof a, text: string, title = 'A fair question') =>
        codeOf(
          createThread(w.env.ctx(who, T0), {
            scopeType: 'course',
            scopeId: w.course.id,
            kind: 'discussion',
            title,
            body: para(text),
          }),
        )
      expect(await post(a, 'You be mumu')).toBe('CONTENT_REJECTED')
      expect(await post(fresh, 'Read https://spam.test')).toBe('CONTENT_REJECTED')
      // An established account may post a normal link.
      const ok = await createThread(w.env.ctx(a, T0), {
        scopeType: 'course',
        scopeId: w.course.id,
        kind: 'discussion',
        title: 'Useful reading',
        body: para('Read https://docs.example.com first'),
      })
      expect(ok.title).toBe('Useful reading')
      expect(await post(a, 'ok', 'Hi')).toBe('VALIDATION_FAILED')
    })
  })
})

describe('Q&A', () => {
  it('marks teacher answers, lets the asker accept one, and emails the asker', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'community')
      const a = await w.person()
      const studio = await getStudioCourse(w.teach, w.course.id)
      const lesson = studio.sections[0]?.lessons[0]
      if (!lesson) throw new Error('no lesson')
      const q = await createThread(w.env.ctx(a, T0), {
        scopeType: 'lesson',
        scopeId: lesson.id,
        kind: 'question',
        title: 'Why XLOOKUP over VLOOKUP here?',
        body: para('The lesson uses XLOOKUP; my office has Excel 2016.'),
      })
      expect((await unansweredQuestions(w.teach)).map((x) => x.threadId)).toEqual([q.id])

      // A TA answers: it counts as the instructor's answer.
      const taId = await insertUser(db, { name: 'Tunde TA', email: 'ta@example.com' })
      await addStaff(w.teach, { courseId: w.course.id, emailOrUsername: 'ta@example.com' })
      const ta = testUser(['learner'], { userId: taId })
      const answered = await reply(w.env.ctx(ta, T0), {
        threadId: q.id,
        body: para('Use INDEX and MATCH in 2016; XLOOKUP needs 365.'),
      })
      const answer = answered.posts[0]
      expect(answer).toMatchObject({ isInstructorAnswer: true, author: { isTeacher: true } })
      expect(answered.answered).toBe(true)
      expect(await unansweredQuestions(w.teach)).toEqual([])

      const accepted = await acceptAnswer(w.env.ctx(a, T0), {
        threadId: q.id,
        postId: answer?.id ?? '',
      })
      expect(accepted.posts[0]?.isAccepted).toBe(true)
      // Another learner can't accept for the asker.
      const b = await w.person()
      expect(await codeOf(acceptAnswer(w.env.ctx(b, T0), { threadId: q.id, postId: null }))).toBe(
        'FORBIDDEN',
      )

      const emails = (await db.select({ payload: schema.outbox.payload }).from(schema.outbox))
        .map((o) => o.payload as { id?: string; data?: { isAnswer?: boolean } })
        .filter((p) => p.id === 'thread-reply')
      expect(emails).toHaveLength(1)
      expect(emails[0]?.data?.isAnswer).toBe(true)
    })
  })
})

describe('announcements and moderation', () => {
  it('lets only the instructor announce, and emails the course learners', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'community')
      const [a, b] = [await w.person(), await w.person()]
      expect(
        await codeOf(
          createThread(w.env.ctx(a, T0), {
            scopeType: 'course',
            scopeId: w.course.id,
            kind: 'announcement',
            title: 'I am not the teacher',
            body: para('Hello'),
          }),
        ),
      ).toBe('NOT_COURSE_OWNER')
      const t = await createThread(w.teach, {
        scopeType: 'course',
        scopeId: w.course.id,
        kind: 'announcement',
        title: 'New lesson on pivot tables',
        body: para('It is up in section two. Mention @ada2 here.'),
      })
      const sent = await sendAnnouncementEmails(w.teach, { threadId: t.id, afterUserId: null })
      expect(sent).toMatchObject({ sent: 2, done: true })
      const ids = (await db.select({ payload: schema.outbox.payload }).from(schema.outbox)).map(
        (o) => (o.payload as { id?: string }).id,
      )
      expect(ids.filter((x) => x === 'announcement')).toHaveLength(2)
      // @ada2 is a member, so the mention is emailed too.
      expect(ids).toContain('mention')
      expect(b.userId).toBeTruthy()
    })
  })

  it('hides reported posts, locks threads, and keeps hidden things from learners', async () => {
    await withRollback(async (db) => {
      const w = await world(db)
      await flags(db, 'community')
      const [a, b] = [await w.person(), await w.person()]
      const t = await createThread(w.env.ctx(a, T0), {
        scopeType: 'course',
        scopeId: w.course.id,
        kind: 'discussion',
        title: 'Share your month-end tips',
        body: para('Mine: reconcile the bank first.'),
      })
      const withReply = await reply(w.env.ctx(b, T0), {
        threadId: t.id,
        body: para('Buy my course instead, cheaper'),
      })
      const spam = withReply.posts[0]
      if (!spam) throw new Error('no reply')
      await report(w.env.ctx(a, T0), { targetType: 'post', targetId: spam.id, reason: 'Spam' })

      const admin = testUser(['admin'], {
        userId: await insertUser(db, { name: 'Admin' }),
        twoFactorEnabled: true,
        twoFactorVerifiedAt: T0,
      })
      const queue = await listOpenReports(w.env.ctx(admin, T0))
      expect(queue).toMatchObject([{ targetId: spam.id, reports: 1, reason: 'Spam' }])
      await handleReport(w.env.ctx(admin, T0), { reportId: queue[0]?.id ?? '', action: 'hide' })
      expect(await listOpenReports(w.env.ctx(admin, T0))).toEqual([])
      expect((await getThread(w.env.ctx(a, T0), t.id)).posts).toEqual([])
      expect((await getThread(w.teach, t.id)).posts[0]?.isHidden).toBe(true)

      await moderate(w.teach, { targetType: 'thread', targetId: t.id, action: 'lock' })
      expect(
        await codeOf(reply(w.env.ctx(a, T0), { threadId: t.id, body: para('One more tip') })),
      ).toBe('THREAD_LOCKED')
      // Learners can't moderate.
      expect(
        await codeOf(
          moderate(w.env.ctx(a, T0), { targetType: 'thread', targetId: t.id, action: 'unlock' }),
        ),
      ).toBe('FORBIDDEN')
    })
  })
})

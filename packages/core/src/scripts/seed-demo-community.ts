// Local demo community: turns on the `community` flag and adds a lesson question with the
// instructor's answer, a discussion and an announcement to Excel for Accountants. Refuses
// production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:demo-community
// Needs `pnpm db:seed:demo-assessments` first (Chiamaka is enrolled there).

import type { RichTextDoc } from '@tokslearn/contract'
import { createDb, type Db, schema } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { and, eq } from 'drizzle-orm'
import { resetFeatureFlagCache } from '../admin'
import { createThread, reply } from '../community'
import type { UserActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'

const TOBI = '01920000-0000-7000-8000-000000000201'
const CHIAMAKA = '01920000-0000-7000-8000-000000000100'

const doc = (...paragraphs: string[]): RichTextDoc => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
})
const actor = (userId: string, roles: UserActor['roles']): UserActor => ({
  kind: 'user',
  userId,
  sessionId: 'demo-seed',
  roles,
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date(),
})

async function run(db: Db) {
  const ctx = (a: UserActor) =>
    createCtx({
      db,
      actor: a,
      requestId: 'demo-seed',
      providers: {
        storage: createFakeStorage(),
        video: createFakeBunny().provider,
        sessions: { revokeSession: async () => {}, revokeAllSessions: async () => {} },
        urls: { app: 'http://localhost:3000', cdn: null },
      },
    })
  await db
    .insert(schema.featureFlags)
    .values({ key: 'community', enabled: true })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: true } })
  resetFeatureFlagCache()

  const [course] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.slug, 'excel-for-accountants'))
  if (!course) throw new Error('Run pnpm db:seed:demo-catalog first.')
  const [existing] = await db
    .select({ id: schema.threads.id })
    .from(schema.threads)
    .where(eq(schema.threads.courseId, course.id))
  if (existing) {
    console.info('skip  community (already there)')
    return
  }
  const [lesson] = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(and(eq(schema.lessons.courseId, course.id), eq(schema.lessons.type, 'video')))
    .limit(1)
  const learner = ctx(actor(CHIAMAKA, ['learner']))
  const teacher = ctx(actor(TOBI, ['learner', 'instructor']))

  if (lesson) {
    const q = await createThread(learner, {
      scopeType: 'lesson',
      scopeId: lesson.id,
      kind: 'question',
      title: 'Does this work in Excel 2016?',
      body: doc('My office laptop still has Excel 2016. Will the steps in this lesson work?'),
    })
    await reply(teacher, {
      threadId: q.id,
      body: doc(
        'Yes, except XLOOKUP. Where the lesson uses XLOOKUP, use INDEX with MATCH instead.',
        'The workbook in section two has both versions side by side.',
      ),
    })
  }
  await createThread(learner, {
    scopeType: 'course',
    scopeId: course.id,
    kind: 'discussion',
    title: 'How long does your month-end close take?',
    body: doc('Mine is four days. Hoping to get it to two by the end of this course.'),
  })
  await createThread(teacher, {
    scopeType: 'course',
    scopeId: course.id,
    kind: 'announcement',
    title: 'New practice workbook for section two',
    body: doc(
      'I added a second practice workbook with a messier bank statement. Try it after the reconciliation lesson.',
    ),
  })
  console.info('community on; threads added to /learn/excel-for-accountants/community')
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('Demo community is for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await run(db)
} finally {
  await close()
}

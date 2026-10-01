// Local demo live classes: turns on the `live_classes` flag, adds a "Live class" lesson to Excel
// for Accountants and three classes on it: one open now, one tomorrow evening, one yesterday.
// Refuses production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:demo-live
// Needs `pnpm db:seed:demo-assessments` first (Chiamaka is enrolled there). Without
// DAILY_API_KEY the web app uses a stand-in room, so Join won't connect to a real call.

import { createDb, type Db, newId, schema } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeDaily } from '@tokslearn/integrations/daily'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { and, asc, eq, sql } from 'drizzle-orm'
import { resetFeatureFlagCache } from '../admin'
import type { UserActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'
import { scheduleSession } from '../live'

const TOBI = '01920000-0000-7000-8000-000000000201'

const tobi: UserActor = {
  kind: 'user',
  userId: TOBI,
  sessionId: 'demo-seed',
  roles: ['learner', 'instructor'],
  emailVerified: true,
  twoFactorEnabled: true,
  twoFactorVerifiedAt: new Date(),
}

async function run(db: Db) {
  const ctx = createCtx({
    db,
    actor: tobi,
    requestId: 'demo-seed',
    providers: {
      storage: createFakeStorage(),
      video: createFakeBunny().provider,
      live: createFakeDaily().provider,
      sessions: { revokeSession: async () => {}, revokeAllSessions: async () => {} },
      urls: { app: 'http://localhost:3000', cdn: null },
    },
  })
  await db
    .insert(schema.featureFlags)
    .values({ key: 'live_classes', enabled: true })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: true } })
  resetFeatureFlagCache()

  const [course] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.slug, 'excel-for-accountants'))
  if (!course) throw new Error('Run pnpm db:seed:demo-catalog first.')
  const [existing] = await db
    .select({ id: schema.liveSessions.id })
    .from(schema.liveSessions)
    .where(eq(schema.liveSessions.courseId, course.id))
  if (existing) {
    console.info('skip  live classes (already there)')
    return
  }
  const [section] = await db
    .select({ id: schema.sections.id })
    .from(schema.sections)
    .where(eq(schema.sections.courseId, course.id))
    .orderBy(asc(schema.sections.position))
    .limit(1)
  if (!section) throw new Error('Excel for Accountants has no sections.')
  const [max] = await db
    .select({ n: sql<number>`coalesce(max(${schema.lessons.position}), 0)::int` })
    .from(schema.lessons)
    .where(and(eq(schema.lessons.sectionId, section.id)))
  // Straight in as live: in the app a new lesson on a published course waits for a review.
  const lessonId = newId()
  await db.insert(schema.lessons).values({
    id: lessonId,
    courseId: course.id,
    sectionId: section.id,
    type: 'live',
    title: 'Live: month-end questions',
    position: (max?.n ?? 0) + 1,
    liveSince: new Date(),
  })

  const now = Date.now()
  const min = (n: number) => new Date(now + n * 60_000)
  await scheduleSession(ctx, {
    courseId: course.id,
    cohortId: null,
    lessonId,
    title: 'Month-end questions, live',
    startsAt: min(10),
    durationMin: 60,
    recordingEnabled: true,
  })
  const tomorrow = new Date(now + 24 * 60 * 60_000)
  tomorrow.setUTCHours(18, 0, 0, 0)
  await scheduleSession(ctx, {
    courseId: course.id,
    cohortId: null,
    lessonId,
    title: 'Bank reconciliation walk-through',
    startsAt: tomorrow,
    durationMin: 90,
    recordingEnabled: true,
  })
  // Already happened: scheduled straight into the table.
  await db.insert(schema.liveSessions).values({
    courseId: course.id,
    lessonId,
    createdBy: TOBI,
    title: 'Welcome class',
    startsAt: min(-26 * 60),
    endsAt: min(-25 * 60),
    status: 'ended',
    recordingEnabled: false,
  })
  console.info(
    'live classes on; three classes on /teach/live and the "Live: month-end questions" lesson',
  )
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('Demo live classes are for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await run(db)
} finally {
  await close()
}

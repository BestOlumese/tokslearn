// Load-test learners for the exam spike (load/exam-spike.js, Phase 6 acceptance). Creates
// LOAD_USERS learners (default 500, load-<n>@tokslearn.test), enrols them in Excel for Accountants,
// clears their earlier attempts at the demo final exam, and gives each a fresh session. The k6
// script signs in with those tokens as bearer tokens, because 500 sign-ins from one machine
// would hit the sign-in limit. Refuses production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:load-exam
// Needs `pnpm db:seed:demo-catalog` and `pnpm db:seed:demo-assessments` first.
// Writes load/.exam-users.json (gitignored): the lesson id and one token per learner.

import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createDb, type Db, newId, schema } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { and, eq, inArray, like } from 'drizzle-orm'
import { grantEnrollment } from '../enrollments'
import { systemActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'

const count = Number(process.env.LOAD_USERS ?? 500)
const out = resolve(process.env.LOAD_OUT ?? '../../load/.exam-users.json')
const DAY = 86_400_000

async function run(db: Db) {
  const [exam] = await db
    .select({ lessonId: schema.lessons.id, quizId: schema.lessons.quizId })
    .from(schema.lessons)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.lessons.courseId))
    .where(
      and(eq(schema.courses.slug, 'excel-for-accountants'), eq(schema.lessons.title, 'Final exam')),
    )
  if (!exam?.quizId) throw new Error('Run pnpm db:seed:demo-assessments first.')

  const ctx = createCtx({
    db,
    actor: systemActor('seed-load-exam'),
    requestId: 'seed-load-exam',
    providers: {
      storage: createFakeStorage(),
      video: createFakeBunny().provider,
      sessions: { revokeSession: async () => {}, revokeAllSessions: async () => {} },
      urls: { app: 'http://localhost:3000', cdn: null },
    },
  })
  const [course] = await db
    .select({ id: schema.lessons.courseId })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, exam.lessonId))

  const wanted = Array.from({ length: count }, (_, i) => ({
    id: newId(),
    name: `Load Tester ${i + 1}`,
    email: `load-${i + 1}@tokslearn.test`,
    username: `load${i + 1}`,
    emailVerified: true,
  }))
  await db.insert(schema.user).values(wanted).onConflictDoNothing()
  const users = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(like(schema.user.email, 'load-%@tokslearn.test'))
    .limit(count)
  const ids = users.map((u) => u.id)
  await db
    .insert(schema.userRoles)
    .values(ids.map((userId) => ({ userId, role: 'learner' as const })))
    .onConflictDoNothing()
  for (const userId of ids) {
    await grantEnrollment(ctx, { userId, courseId: course?.id ?? '', source: 'admin_grant' })
  }

  // A clean slate each run: attempts cascade to their answers.
  await db
    .delete(schema.quizAttempts)
    .where(
      and(eq(schema.quizAttempts.quizId, exam.quizId), inArray(schema.quizAttempts.userId, ids)),
    )
  await db.delete(schema.session).where(inArray(schema.session.userId, ids))
  const tokens = ids.map(() => randomBytes(24).toString('base64url'))
  await db.insert(schema.session).values(
    ids.map((userId, i) => ({
      id: newId(),
      userId,
      token: tokens[i] ?? '',
      expiresAt: new Date(Date.now() + DAY),
      userAgent: 'k6 load test',
    })),
  )

  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ lessonId: exam.lessonId, tokens }))
  console.info(`${ids.length} load learners ready; tokens in ${out}`)
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('Load-test learners are for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await run(db)
} finally {
  await close()
}

// Local demo cohorts: turns on the `cohorts` flag and sells Financial Modelling in Excel by start
// date, with one run on sale (25 seats) and one whose enrolment opens later. Refuses production.
//   DATABASE_URL=… pnpm --filter @tokslearn/core seed:demo-cohorts
// Needs `pnpm db:seed` and `pnpm db:seed:demo-catalog` first.

import { createDb, type Db, schema } from '@tokslearn/db'
import { createFakeBunny } from '@tokslearn/integrations/bunny'
import { createFakeStorage } from '@tokslearn/integrations/r2'
import { eq } from 'drizzle-orm'
import { resetFeatureFlagCache } from '../admin'
import { createCohort, getStudioCohorts, setCohortSelling, setCohortStatus } from '../cohorts'
import type { UserActor } from '../kernel/actor'
import { createCtx } from '../kernel/ctx'

const TOBI = '01920000-0000-7000-8000-000000000201'
const DAY = 86_400_000

async function run(db: Db) {
  const owner: UserActor = {
    kind: 'user',
    userId: TOBI,
    sessionId: 'demo-seed',
    roles: ['learner', 'instructor'],
    emailVerified: true,
    twoFactorEnabled: true,
    twoFactorVerifiedAt: new Date(),
  }
  const ctx = createCtx({
    db,
    actor: owner,
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
    .values({ key: 'cohorts', enabled: true })
    .onConflictDoUpdate({ target: schema.featureFlags.key, set: { enabled: true } })
  resetFeatureFlagCache()

  const [course] = await db
    .select({ id: schema.courses.id })
    .from(schema.courses)
    .where(eq(schema.courses.slug, 'financial-modelling-in-excel'))
  if (!course) throw new Error('Run pnpm db:seed:demo-catalog first.')
  if ((await getStudioCohorts(ctx, course.id)).cohorts.length > 0) {
    console.info('skip  cohorts (already there)')
    return
  }
  await setCohortSelling(ctx, { courseId: course.id, cohortBased: true })
  const at = (days: number) => new Date(Date.now() + days * DAY)
  for (const r of [
    { name: 'November 2026', startsAt: at(30), endsAt: at(72), enrollOpensAt: null, capacity: 25 },
    {
      name: 'January 2027',
      startsAt: at(95),
      endsAt: at(137),
      enrollOpensAt: at(45),
      capacity: 25,
    },
  ]) {
    const s = await createCohort(ctx, { courseId: course.id, enrollClosesAt: null, ...r })
    const created = s.cohorts.find((c) => c.name === r.name)
    if (created) await setCohortStatus(ctx, { cohortId: created.id, status: 'open' })
  }
  console.info('cohorts on; /courses/financial-modelling-in-excel sells two runs')
}

const url = process.env.DATABASE_URL
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
  throw new Error('Demo cohorts are for local and preview databases only.')
}
const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  await run(db)
} finally {
  await close()
}

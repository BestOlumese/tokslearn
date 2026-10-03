import * as commerce from '@tokslearn/core/commerce'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { jobRuntime } from '../runtime'

const ctx = (reason: string, requestId: string) =>
  createCtx({
    actor: systemActor(reason),
    db: jobRuntime().db(),
    requestId,
    providers: jobRuntime().providers(),
  })

/**
 * `earnings-release` (docs/08 §8): every night at 02:00 Lagos, moves the shares of purchases
 * whose refund window has closed from pending to available, 500 per step.
 */
export const earningsRelease = inngest.createFunction(
  {
    id: 'earnings-release',
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 0 2 * * *' }],
  },
  async ({ step, runId }) => {
    let released = 0
    for (let batch = 0; batch < 200; batch++) {
      const r = await step.run(`batch-${batch}`, () =>
        commerce.releaseEarnings(ctx('earnings-release', runId)),
      )
      released += r.released
      if (r.done) break
    }
    return { released }
  },
)

/**
 * `monthly-statements` (docs/08 §9): on the 1st at 06:00 Lagos (after the night's release),
 * a PDF statement and email for every instructor with activity in the month before. Re-runs
 * skip statements already made.
 */
export const monthlyStatements = inngest.createFunction(
  {
    id: 'monthly-statements',
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 0 6 1 * *' }],
  },
  async ({ step, runId }) => {
    const month = await step.run('month', () => commerce.previousMonth(new Date()))
    const ids = await step.run('instructors', () =>
      commerce.instructorsWithActivity(ctx('monthly-statements', runId), month),
    )
    let made = 0
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20)
      made += await step.run(`statements-${i}`, async () => {
        let n = 0
        for (const instructorId of chunk) {
          const r = await commerce.generateStatement(ctx('monthly-statements', runId), {
            instructorId,
            month,
          })
          if (r.created) n++
        }
        return n
      })
    }
    return { month, instructors: ids.length, made }
  },
)

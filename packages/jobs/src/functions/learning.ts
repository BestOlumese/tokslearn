import * as engagement from '@tokslearn/core/engagement'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import * as learning from '@tokslearn/core/learning'
import { inngest } from '../client'
import { courseCompleted, lessonCompleted, streakExtended } from '../events'
import { jobRuntime } from '../runtime'

// Learning jobs (docs/10 §2 and §4): badges, the nightly streak rollover, drip unlock emails.

const DAY_MS = 86_400_000

const ctxFor = (name: string, runId: string) =>
  createCtx({
    actor: systemActor(name),
    db: jobRuntime().db(),
    requestId: runId,
    providers: jobRuntime().providers(),
  })

/** Awards any badges the learner now qualifies for. Awarding is idempotent, so retries are safe. */
export const badgesEvaluate = inngest.createFunction(
  {
    id: 'badges-evaluate',
    retries: 3,
    // Several events for one learner arrive together (lesson + course + streak): run them in turn.
    concurrency: { limit: 1, key: 'event.data.userId' },
    triggers: [lessonCompleted, courseCompleted, streakExtended],
  },
  async ({ event, step, runId }) => {
    const awarded = await step.run('evaluate', () =>
      engagement.evaluateBadges(ctxFor('badges-evaluate', runId), event.data.userId),
    )
    return { awarded }
  },
)

/** 00:15 Lagos: spends freeze tokens on missed days, or ends the streak (docs/10 §4). */
export const streakRollover = inngest.createFunction(
  {
    id: 'streak-rollover',
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 15 0 * * *' }],
  },
  async ({ step, runId }) =>
    step.run('rollover', () => engagement.rolloverStreaks(ctxFor('streak-rollover', runId))),
)

/**
 * 07:00 Lagos: emails learners about drip lessons that opened in the last 24 hours. Morning, so
 * nobody gets it at midnight; the email's idempotency key makes a re-run harmless.
 */
export const dripUnlocks = inngest.createFunction(
  {
    id: 'drip-unlocks',
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 0 7 * * *' }],
  },
  async ({ step, runId }) =>
    step.run('send', () => {
      const ctx = ctxFor('drip-unlocks', runId)
      return learning.sendUnlockEmails(ctx, {
        from: new Date(ctx.now.getTime() - DAY_MS),
        to: ctx.now,
      })
    }),
)

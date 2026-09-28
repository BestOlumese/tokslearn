import * as commerce from '@tokslearn/core/commerce'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { jobRuntime } from '../runtime'

/**
 * Hourly money housekeeping (docs/08 §6): verify recent pending orders whose confirm call and
 * webhook were both missed, give stale ones a last check before marking them abandoned, and move
 * referral click counts from Redis into the database.
 */
export const commerceHourly = inngest.createFunction(
  {
    id: 'commerce-hourly',
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 7 * * * *' }],
  },
  async ({ step, runId }) => {
    const ctx = () =>
      createCtx({
        actor: systemActor('commerce-hourly'),
        db: jobRuntime().db(),
        requestId: runId,
        providers: jobRuntime().providers(),
      })
    const reconciled = await step.run('reconcile', () => commerce.reconcilePendingOrders(ctx()))
    const abandoned = await step.run('abandon', () => commerce.abandonStaleOrders(ctx()))
    const clicks = await step.run('flush-clicks', () => commerce.flushReferralClicks(ctx()))
    return { reconciled, abandoned, clickLinks: clicks }
  },
)

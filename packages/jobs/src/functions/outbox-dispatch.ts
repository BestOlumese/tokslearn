import * as admin from '@tokslearn/core/admin'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { outboxDispatchRequested } from '../events'
import { jobRuntime } from '../runtime'

const MAX_BATCHES = 10

/**
 * Sends committed outbox rows to Inngest (docs/03 §6). Triggered right after a commit and by a
 * one-minute sweeper. The outbox row id becomes the Inngest event id, so re-sends are deduped.
 */
export const outboxDispatch = inngest.createFunction(
  {
    id: 'outbox-dispatch',
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ cron: '* * * * *' }, outboxDispatchRequested],
  },
  async ({ step, runId }) => {
    let sent = 0
    let failed = 0
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const result = await step.run(`dispatch-batch-${batch}`, () => {
        const ctx = createCtx({
          actor: systemActor('outbox-dispatch'),
          db: jobRuntime().db(),
          requestId: runId,
        })
        return admin.dispatchOutbox(ctx, async (messages) => {
          await inngest.send(
            messages.map((m) => ({
              id: m.id,
              name: m.name,
              data: (m.payload ?? {}) as Record<string, unknown>,
            })),
          )
        })
      })
      sent += result.sent
      failed += result.failed
      if (result.sent + result.failed === 0 || result.failed > 0) break
    }
    return { sent, failed }
  },
)

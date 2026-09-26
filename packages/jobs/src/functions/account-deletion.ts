import * as identity from '@tokslearn/core/identity'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { jobRuntime } from '../runtime'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Anonymizes accounts whose 14-day deletion grace has passed (docs/07 §6, docs/13 §2).
 * Runs daily at 01:00 Lagos time; each user is its own step so one failure doesn't block others.
 */
export const accountDeletion = inngest.createFunction(
  {
    id: 'account-deletion',
    retries: 3,
    concurrency: { limit: 1 },
    triggers: [{ cron: 'TZ=Africa/Lagos 0 1 * * *' }],
  },
  async ({ step, runId }) => {
    const rt = jobRuntime()
    const cutoff = new Date(Date.now() - identity.DELETION_GRACE_DAYS * DAY_MS)
    const due = await step.run('find-due', () => identity.usersDueForDeletion(rt.db(), cutoff))
    let anonymized = 0
    for (const { id } of due) {
      const result = await step.run(`anonymize-${id}`, () =>
        identity.anonymizeUser(
          createCtx({
            actor: systemActor('account-deletion'),
            db: rt.db(),
            requestId: runId,
            providers: rt.providers(),
          }),
          id,
        ),
      )
      if (result === 'anonymized') anonymized++
    }
    return { due: due.length, anonymized }
  },
)

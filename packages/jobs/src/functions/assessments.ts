import * as assessments from '@tokslearn/core/assessments'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { jobRuntime } from '../runtime'

/**
 * `exam-autosubmit` (docs/13): every minute, grades and closes attempts whose time ran out plus
 * the 5 s grace, so a learner who closes the tab still gets their result (docs/10 §6).
 */
export const examAutosubmit = inngest.createFunction(
  {
    id: 'exam-autosubmit',
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: '* * * * *' }],
  },
  async ({ step, runId }) =>
    step.run('submit-expired', () =>
      assessments.autoSubmitExpired(
        createCtx({
          actor: systemActor('exam-autosubmit'),
          db: jobRuntime().db(),
          requestId: runId,
          providers: jobRuntime().providers(),
        }),
      ),
    ),
)

import * as community from '@tokslearn/core/community'
import { createCtx, systemActor } from '@tokslearn/core/kernel'
import { inngest } from '../client'
import { announcementPosted } from '../events'
import { jobRuntime } from '../runtime'

/**
 * `announcement-send` (docs/10 §10): emails an announcement to every learner it's for, 500 per
 * step. Each email's idempotency key is (announcement, learner), so a retry never sends twice.
 */
export const announcementSend = inngest.createFunction(
  {
    id: 'announcement-send',
    retries: 3,
    concurrency: { limit: 1, key: 'event.data.courseId' },
    triggers: [announcementPosted],
  },
  async ({ event, step, runId }) => {
    let after: string | null = null
    let sent = 0
    for (let page = 0; page < 1000; page++) {
      const batch: { sent: number; lastUserId: string | null; done: boolean } = await step.run(
        `page-${page}`,
        () =>
          community.sendAnnouncementEmails(
            createCtx({
              actor: systemActor('announcement-send'),
              db: jobRuntime().db(),
              requestId: runId,
              providers: jobRuntime().providers(),
            }),
            { threadId: event.data.threadId, afterUserId: after },
          ),
      )
      sent += batch.sent
      if (batch.done) break
      after = batch.lastUserId
    }
    return { sent }
  },
)

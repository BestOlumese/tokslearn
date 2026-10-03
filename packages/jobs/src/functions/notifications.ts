import { createCtx, systemActor } from '@tokslearn/core/kernel'
import * as notifications from '@tokslearn/core/notifications'
import { inngest } from '../client'
import { digestRequested } from '../events'
import { jobRuntime } from '../runtime'

const ctx = (reason: string, requestId: string) =>
  createCtx({
    actor: systemActor(reason),
    db: jobRuntime().db(),
    requestId,
    providers: jobRuntime().providers(),
  })

/**
 * `notification-digest` (docs/13 §3): after a busy hour, one email with the replies and
 * mentions that waited. Waits for 30 quiet minutes, at most an hour, per person.
 */
export const notificationDigest = inngest.createFunction(
  {
    id: 'notification-digest',
    retries: 3,
    debounce: { key: 'event.data.userId', period: '30m', timeout: '60m' },
    triggers: [digestRequested],
  },
  async ({ event, step, runId }) => {
    const sent = await step.run('send', () =>
      notifications.sendDigest(ctx('notification-digest', runId), event.data.userId),
    )
    return { userId: event.data.userId, items: sent }
  },
)

/** `notifications-prune`: read notifications older than 90 days go (daily, 03:30 Lagos). */
export const notificationsPrune = inngest.createFunction(
  { id: 'notifications-prune', retries: 2, triggers: [{ cron: 'TZ=Africa/Lagos 30 3 * * *' }] },
  async ({ step, runId }) => {
    const removed = await step.run('prune', () =>
      notifications.pruneNotifications(ctx('notifications-prune', runId)),
    )
    return { removed }
  },
)

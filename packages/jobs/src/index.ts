import { inngest } from './client'
import { outboxDispatchRequested } from './events'
import { outboxDispatch } from './functions/outbox-dispatch'

export { inngest } from './client'
export { featureFlagUpdated, outboxDispatchRequested } from './events'

/** Every function served from /api/inngest. */
export const functions = [outboxDispatch]

/** After-commit hook for request contexts: deliver outbox rows now instead of waiting for cron. */
export async function requestOutboxDispatch(): Promise<void> {
  await inngest.send({ name: outboxDispatchRequested.name, data: {} })
}

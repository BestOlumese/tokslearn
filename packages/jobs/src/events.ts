import { eventType } from 'inngest'
import { z } from 'zod'

// Inngest event schemas. Domain events use the same names as core's `DomainEvents`
// (docs/13 §1); `outbox/*` and `webhook/*` are infrastructure events.

export const outboxDispatchRequested = eventType('outbox/dispatch.requested', {
  schema: z.object({}),
})

export const featureFlagUpdated = eventType('feature_flag.updated', {
  schema: z.object({ key: z.string(), enabled: z.boolean() }),
})

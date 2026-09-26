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

const emailRequest = z.object({
  id: z.string(),
  to: z.email(),
  data: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string(),
})

/** From the outbox (core `notifications.sendEmail`). */
export const emailRequested = eventType('notification.email_requested', { schema: emailRequest })

/** Straight from the auth layer: emails with sign-in secrets skip the outbox (ADR-028). */
export const authEmailRequested = eventType('auth/email.requested', { schema: emailRequest })

export const exportRequested = eventType('user.export_requested', {
  schema: z.object({ userId: z.string() }),
})

/** Bunny Stream said a video changed; the job re-reads it from Bunny (docs/09 §2). */
export const bunnyVideoChanged = eventType('webhook/bunny.video_changed', {
  schema: z.object({ videoGuid: z.string(), eventId: z.string() }),
})

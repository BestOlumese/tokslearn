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

/** A verified Paystack `charge.success`; the job re-verifies with Paystack (docs/08 §6). */
export const paystackChargeSucceeded = eventType('webhook/paystack.charge_success', {
  schema: z.object({ reference: z.string(), eventId: z.string() }),
})

/** Learning events from the outbox; badges are evaluated on each (docs/10 §4). */
export const lessonCompleted = eventType('lesson.completed', {
  schema: z.object({ userId: z.string(), courseId: z.string(), lessonId: z.string() }),
})
export const courseCompleted = eventType('course.completed', {
  schema: z.object({ userId: z.string(), courseId: z.string() }),
})
export const streakExtended = eventType('streak.extended', {
  schema: z.object({ userId: z.string(), length: z.number() }),
})

/** Certificate triggers (docs/10 §8): each may complete a course's criteria. */
export const examPassed = eventType('exam.passed', {
  schema: z.object({
    userId: z.string(),
    courseId: z.string(),
    quizId: z.string(),
    attemptId: z.string(),
  }),
})
export const externalResultRecorded = eventType('external_result.recorded', {
  schema: z.object({
    resultId: z.string(),
    userId: z.string(),
    courseId: z.string(),
    result: z.enum(['pass', 'fail']),
  }),
})
export const certificateIssued = eventType('certificate.issued', {
  schema: z.object({ certificateId: z.string(), userId: z.string(), courseId: z.string() }),
})
export const certificateNameCorrected = eventType('certificate.name_corrected', {
  schema: z.object({ certificateId: z.string(), userId: z.string(), courseId: z.string() }),
})
/** A course's rules went live: learners who already qualify get their certificates. */
export const coursePublished = eventType('course.published', {
  schema: z.object({ courseId: z.string(), revisionId: z.string(), instructorId: z.string() }),
})
export const courseUpdated = eventType('course.updated', {
  schema: z.object({ courseId: z.string(), revisionId: z.string(), instructorId: z.string() }),
})

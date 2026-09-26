/**
 * Domain events (docs/03 §6). Names are `<module>.<past_tense>`. Add each event here with its
 * payload type; the Inngest schemas in packages/jobs mirror these names.
 * Payloads carry ids, never personal data.
 */
export interface DomainEvents {
  'feature_flag.updated': { key: string; enabled: boolean }
  'user.signed_up': { userId: string; method: 'password' | 'otp' | 'google' }
  'user.deletion_requested': { userId: string; scheduledFor: string }
  'user.deletion_cancelled': { userId: string }
  'user.export_requested': { userId: string }
  'user.banned': { userId: string; banned: boolean }
  'instructor.application_submitted': { applicationId: string; userId: string }
  'instructor.application_decided': { applicationId: string; userId: string; approved: boolean }
  'kyc.completed': {
    userId: string
    kycCheckId: string
    status: 'verified' | 'failed' | 'manual_review'
  }
  'payout_account.added': { userId: string; payoutAccountId: string; replaced: boolean }
  'course.submitted': { courseId: string; revisionId: string }
  'course.published': { courseId: string; revisionId: string; instructorId: string }
  'course.updated': { courseId: string; revisionId: string; instructorId: string }
  'course.changes_requested': { courseId: string; revisionId: string }
  'video.status_changed': { videoAssetId: string; status: 'processing' | 'ready' | 'failed' }
  /** Queued email; the `email-send` job renders and sends it (docs/13 §3). */
  'notification.email_requested': {
    id: string
    to: string
    data: Record<string, unknown>
    idempotencyKey: string
  }
}

export type EventName = keyof DomainEvents

export interface EventEmitter {
  /** Writes to the outbox in the caller's transaction; sent to Inngest after commit. */
  emit<N extends EventName>(name: N, payload: DomainEvents[N]): Promise<void>
}

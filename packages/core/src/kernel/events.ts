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
  'enrollment.created': {
    enrollmentId: string
    userId: string
    courseId: string
    source: string
  }
  'lesson.completed': { userId: string; courseId: string; lessonId: string }
  'course.completed': { userId: string; courseId: string }
  'streak.extended': { userId: string; length: number }
  'quiz.submitted': {
    userId: string
    courseId: string
    quizId: string
    attemptId: string
    kind: 'practice' | 'graded' | 'exam'
    passed: boolean
  }
  /** Certificates (Phase 7) listen for this. */
  'exam.passed': { userId: string; courseId: string; quizId: string; attemptId: string }
  'attempt.voided': { userId: string; courseId: string; quizId: string; attemptId: string }
  'assignment.submitted': {
    userId: string
    courseId: string
    assignmentId: string
    submissionId: string
  }
  'assignment.graded': {
    userId: string
    courseId: string
    assignmentId: string
    submissionId: string
    decision: 'graded' | 'returned'
    passed: boolean | null
  }
  /** A pass or fail recorded for an exam taken elsewhere (external certificates). */
  'external_result.recorded': {
    resultId: string
    userId: string
    courseId: string
    result: 'pass' | 'fail'
  }
  /** Makes the purchase non-refundable; the render job makes the PDF and emails the learner. */
  'certificate.issued': { certificateId: string; userId: string; courseId: string }
  /** The learner corrected the name once: the render job makes a new PDF (same code). */
  'certificate.name_corrected': { certificateId: string; userId: string; courseId: string }
  'certificate.revoked': { certificateId: string; userId: string; courseId: string }
  /** The announcement-send job emails it to the course's (or cohort's) learners. */
  'announcement.posted': { threadId: string; courseId: string }
  /** Scheduled or moved: the live-reminders job waits for 24 h and 15 min before `startsAt`. */
  'live.scheduled': { sessionId: string; courseId: string; startsAt: string }
  /** Daily finished a cloud recording: the recording-import job sends it to Bunny. */
  'live.recording_ready': { sessionId: string; recordingId: string; durationSec: number }
  /** A review was written, edited, deleted, hidden, shown or replied to: the rating-stats job. */
  'review.changed': { reviewId: string; courseId: string }
  /** A published course's price went down (approval applied a lower price). */
  'course.price_dropped': { courseId: string; fromKobo: string; toKobo: string }
  /** An instructor told people who saved the course(s) about a coupon. */
  'coupon.announced': { couponId: string }
  /** A refund was approved (by the rules or finance): the refund-send job asks Paystack. */
  'refund.approved': { refundId: string }
  /** A payout run is approved (or a failed transfer is retried): send it once its pay day comes. */
  'payout_run.approved': { runId: string }
  /** Paystack sent a refund.* webhook for this transaction: the refund-settle job checks. */
  'refund.provider_updated': { reference: string }
  /** Replies and mentions are waiting for one digest email (a busy hour). */
  'notification.digest_requested': { userId: string }
  'order.paid': { orderId: string; userId: string; totalKobo: string; itemsCount: number }
  'order.failed': { orderId: string; reason: string }
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

import { authMessages, fillMessage } from './auth-messages'
import type { ErrorEntry, ErrorStatus } from './message-types'

/**
 * Zod-free on purpose: public pages import this without pulling in Zod (docs/12 §1).
 *
 * Stable error codes (docs/21-error-codes.md is the source of truth; add codes there first).
 * Clients switch on `error.data.code` and show `message` (or a context-specific variant).
 * `{name}` placeholders are filled from `error.data`.
 */

export type { ErrorEntry, ErrorStatus } from './message-types'

const notFound = (thing: string): ErrorEntry => ({
  status: 'NOT_FOUND',
  message: `We couldn't find that ${thing}.`,
})

export const errorCatalog = {
  ...authMessages,

  // Permissions and lookup
  FORBIDDEN: { status: 'FORBIDDEN', message: "You don't have access to this." },
  NOT_COURSE_OWNER: { status: 'FORBIDDEN', message: 'Only the course instructor can do this.' },
  NOT_ENROLLED: { status: 'FORBIDDEN', message: 'Enroll in this course to open this lesson.' },
  ENROLLMENT_REVOKED: { status: 'FORBIDDEN', message: 'Your access to this course has ended.' },
  INSTRUCTOR_REQUIRED: { status: 'FORBIDDEN', message: 'Apply to teach to use the studio.' },
  KYC_REQUIRED: { status: 'FORBIDDEN', message: 'Complete identity verification to continue.' },
  STAFF_ONLY: { status: 'FORBIDDEN', message: 'This area is for Tokslearn staff.' },
  SELF_REVIEW_NOT_ALLOWED: {
    status: 'FORBIDDEN',
    message: "You can't decide your own application or course. Ask another reviewer.",
  },
  COURSE_NOT_FOUND: notFound('course'),
  LESSON_NOT_FOUND: notFound('lesson'),
  ORDER_NOT_FOUND: notFound('order'),
  USER_NOT_FOUND: notFound('user'),
  CERTIFICATE_NOT_FOUND: notFound('certificate'),
  THREAD_NOT_FOUND: notFound('discussion'),
  COUPON_NOT_FOUND: notFound('coupon'),
  COMMISSION_RULE_NOT_FOUND: notFound('commission rule'),
  NOTE_NOT_FOUND: notFound('note'),
  QUESTION_BANK_NOT_FOUND: notFound('question bank'),
  QUESTION_NOT_FOUND: notFound('question'),
  QUIZ_NOT_FOUND: notFound('quiz'),
  ATTEMPT_NOT_FOUND: notFound('attempt'),
  ASSIGNMENT_NOT_FOUND: notFound('assignment'),
  SUBMISSION_NOT_FOUND: notFound('submission'),
  RESOURCE_NOT_FOUND: notFound('file'),
  FILE_NOT_FOUND: notFound('file'),
  SESSION_NOT_FOUND: notFound('session'),
  FEATURE_FLAG_NOT_FOUND: notFound('feature flag'),
  APPLICATION_NOT_FOUND: notFound('application'),
  CATEGORY_NOT_FOUND: notFound('category'),
  SECTION_NOT_FOUND: notFound('section'),
  BUNDLE_NOT_FOUND: notFound('bundle'),
  REVISION_NOT_FOUND: notFound('course version'),
  VIDEO_NOT_FOUND: notFound('video'),

  // Instructor onboarding
  APPLICATION_EXISTS: {
    status: 'CONFLICT',
    message: 'You already have an application in progress.',
  },
  REAPPLY_TOO_SOON: { status: 'UNPROCESSABLE_CONTENT', message: 'You can apply again on {date}.' },
  KYC_FAILED: {
    status: 'UNPROCESSABLE_CONTENT',
    message:
      "We couldn't verify your identity. Check the number and try again, or contact support.",
  },
  KYC_PROVIDER_UNAVAILABLE: {
    status: 'SERVICE_UNAVAILABLE',
    message: 'Identity verification is temporarily unavailable. Try again shortly.',
  },
  BANK_ACCOUNT_UNRESOLVED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "We couldn't find that account number at this bank.",
  },
  BANK_NAME_MISMATCH: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "The account name doesn't match your verified name. We've sent it for manual review.",
  },
  APPLICATION_NOT_EDITABLE: {
    status: 'CONFLICT',
    message: "Your application is in review, so it can't be changed now.",
  },
  APPLICATION_INCOMPLETE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Finish every step before you submit.',
  },
  APPLICATION_ALREADY_DECIDED: {
    status: 'CONFLICT',
    message: 'This application already has a decision.',
  },
  BANK_PROVIDER_UNAVAILABLE: {
    status: 'SERVICE_UNAVAILABLE',
    message: "We can't reach the bank directory right now. Try again in a few minutes.",
  },

  // Authoring and media
  COURSE_NOT_EDITABLE: {
    status: 'CONFLICT',
    message: 'This course is in review. You can edit it after the review.',
  },
  VERSION_CONFLICT: {
    status: 'CONFLICT',
    message: 'This was changed in another tab. Reload to see the latest version.',
  },
  PUBLISH_CHECKLIST_INCOMPLETE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Finish the checklist before submitting.',
  },
  SLUG_TAKEN: { status: 'CONFLICT', message: 'That URL is taken. Try another.' },
  CATEGORY_IN_USE: {
    status: 'CONFLICT',
    message: 'Move its courses and subcategories first, then delete it.',
  },
  UPLOAD_TOO_LARGE: { status: 'BAD_REQUEST', message: 'Files must be under {limit}.' },
  UNSUPPORTED_FILE_TYPE: {
    status: 'BAD_REQUEST',
    message: "This file type isn't supported. Use {types}.",
  },
  VIDEO_NOT_READY: { status: 'CONFLICT', message: 'This video is still processing.' },
  VIDEO_PROCESSING_FAILED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Processing failed. Upload the video again.',
  },
  VIDEO_PROVIDER_UNAVAILABLE: {
    status: 'SERVICE_UNAVAILABLE',
    message: 'Video uploads are temporarily unavailable. Try again shortly.',
  },
  COURSE_NOT_IN_REVIEW: {
    status: 'CONFLICT',
    message: "This course isn't waiting for review any more.",
  },
  ALREADY_COURSE_STAFF: {
    status: 'CONFLICT',
    message: 'That person already helps with this course.',
  },
  INVALID_MOVE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "That move isn't possible. Reload the curriculum and try again.",
  },

  // Catalog, cart, checkout
  COURSE_UNAVAILABLE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "This course isn't available for purchase.",
  },
  ALREADY_ENROLLED: { status: 'CONFLICT', message: "You're already enrolled in this course." },
  OWN_COURSE: { status: 'UNPROCESSABLE_CONTENT', message: "You can't buy your own course." },
  CART_EMPTY: { status: 'UNPROCESSABLE_CONTENT', message: 'Your cart is empty.' },
  CART_CHANGED: {
    status: 'CONFLICT',
    message: 'Your cart changed. Review it before paying.',
  },
  COUPON_INVALID: { status: 'UNPROCESSABLE_CONTENT', message: "This coupon code isn't valid." },
  COUPON_EXPIRED: { status: 'UNPROCESSABLE_CONTENT', message: 'This coupon has expired.' },
  COUPON_LIMIT_REACHED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'This coupon has been fully used.',
  },
  COUPON_NOT_APPLICABLE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "This coupon doesn't apply to the items in your cart.",
  },
  COUPON_CODE_TAKEN: { status: 'CONFLICT', message: 'That code is already in use. Try another.' },
  CART_FULL: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Your cart holds up to 20 items. Buy these first, then add more.',
  },
  COHORT_FULL: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'This cohort is full. Choose another start date.',
  },
  COHORT_ENROLLMENT_CLOSED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Enrollment for this cohort has closed.',
  },
  PAYMENT_NOT_CONFIRMED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "Your payment wasn't completed. You haven't been charged.",
  },
  PAYMENT_AMOUNT_MISMATCH: {
    status: 'UNPROCESSABLE_CONTENT',
    message:
      "We couldn't confirm your payment. Our team has been notified; contact support with reference {ref}.",
  },
  PAYMENT_PROVIDER_UNAVAILABLE: {
    status: 'SERVICE_UNAVAILABLE',
    message:
      'Payments are temporarily unavailable. Your cart is saved; try again in a few minutes.',
  },
  ORDER_ALREADY_PAID: { status: 'CONFLICT', message: 'This order has already been paid.' },

  // Learning
  LESSON_LOCKED: { status: 'UNPROCESSABLE_CONTENT', message: 'This lesson opens on {date}.' },
  PREREQUISITE_INCOMPLETE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Complete {lesson} first.',
  },
  DOWNLOAD_CONFIRM_REQUIRED: {
    status: 'PRECONDITION_FAILED',
    message:
      'Downloading this file ends your right to a refund for this course. Confirm to continue.',
  },
  PLAYBACK_TOKEN_EXPIRED: {
    status: 'UNAUTHORIZED',
    message: 'Reload the lesson to continue watching.',
  },
  CONFIRMATION_REQUIRED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Confirm this action to continue.',
  },

  // Assessments
  ATTEMPT_IN_PROGRESS: {
    status: 'CONFLICT',
    message: 'You have an attempt in progress. Continue it.',
  },
  NO_ATTEMPTS_LEFT: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "You've used all attempts for this quiz.",
  },
  COOLDOWN_ACTIVE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'You can try again on {date}.',
  },
  EXAM_NOT_ELIGIBLE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Complete all lessons before taking the exam.',
  },
  ATTEMPT_EXPIRED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Time is up. Your answers were submitted automatically.',
  },
  ATTEMPT_ALREADY_SUBMITTED: {
    status: 'CONFLICT',
    message: 'This attempt has already been submitted.',
  },
  SUBMISSION_PAST_DUE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'The deadline for this assignment has passed.',
  },
  RESUBMISSION_NOT_ALLOWED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "This assignment doesn't allow resubmissions.",
  },
  QUIZ_EMPTY: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'This quiz has no questions yet. Check back later.',
  },
  SUBMISSION_ALREADY_GRADED: {
    status: 'CONFLICT',
    message: 'This submission has already been graded.',
  },

  // Certificates
  CERTIFICATE_CRITERIA_NOT_MET: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "You haven't met the requirements for this certificate yet.",
  },
  CERTIFICATE_REVOKED: { status: 'CONFLICT', message: 'This certificate has been revoked.' },
  NAME_CORRECTION_USED: {
    status: 'UNPROCESSABLE_CONTENT',
    message:
      "You've already corrected the name on this certificate. Contact support for further changes.",
  },

  // Community, reviews
  THREAD_LOCKED: { status: 'UNPROCESSABLE_CONTENT', message: 'This discussion is closed.' },
  REVIEW_NOT_ELIGIBLE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'You can review this course after completing 20% of it.',
  },
  CONTENT_REJECTED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "Your post couldn't be published. Remove links or flagged words and try again.",
  },

  // Live
  LIVE_NOT_OPEN: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'The session opens 15 minutes before it starts.',
  },
  LIVE_ENDED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "This session has ended. The recording will appear here when it's ready.",
  },
  LIVE_PROVIDER_UNAVAILABLE: {
    status: 'SERVICE_UNAVAILABLE',
    message: "We can't connect to the live class right now. Try again in a minute.",
  },

  // Refunds and money
  NO_REFUND_POLICY: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "This course doesn't offer refunds.",
  },
  REFUND_WINDOW_CLOSED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'The {n}-day refund window ended on {date}.',
  },
  CONTENT_CONSUMED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "Refunds aren't available after watching 30% of a course. You've watched {pct}%.",
  },
  IMPORTANT_RESOURCE_DOWNLOADED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "Refunds aren't available after downloading {resource}.",
  },
  CERTIFICATE_ISSUED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "Refunds aren't available after a certificate is issued.",
  },
  EXAM_STARTED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "Refunds aren't available after starting the certification exam.",
  },
  REFUND_ALREADY_REQUESTED: {
    status: 'CONFLICT',
    message: "You've already requested a refund for this course.",
  },
  APPEAL_USED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: "You've already appealed this decision.",
  },
  PAYOUT_ACCOUNT_REQUIRED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Add a bank account to receive payouts.',
  },
  PAYOUT_HOLD_ACTIVE: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Payouts to a new bank account start 72 hours after the change.',
  },
  COMMISSION_DEFAULT_REQUIRED: {
    status: 'UNPROCESSABLE_CONTENT',
    message: 'Every source needs a default rate. Set a new one instead of ending it.',
  },
  LEDGER_UNBALANCED: {
    status: 'INTERNAL_SERVER_ERROR',
    message:
      'Something went wrong on our side. Try again; if it keeps happening, contact support with code {requestId}.',
  },

  // Platform
  IDEMPOTENCY_CONFLICT: {
    status: 'CONFLICT',
    message: 'This request was already sent with different details. Refresh and try again.',
  },
  CLIENT_OUTDATED: {
    status: 'PRECONDITION_FAILED',
    message: 'Update the Tokslearn app to continue.',
  },
  MAINTENANCE: {
    status: 'SERVICE_UNAVAILABLE',
    message: "Tokslearn is being updated. We'll be back shortly.",
  },
  VALIDATION_FAILED: {
    status: 'BAD_REQUEST',
    message: 'Some details are missing or wrong. Check the highlighted fields.',
  },
  INTERNAL: {
    status: 'INTERNAL_SERVER_ERROR',
    message:
      'Something went wrong on our side. Try again; if it keeps happening, contact support with code {requestId}.',
  },
} as const satisfies Record<string, ErrorEntry>

export type ErrorCode = keyof typeof errorCatalog

export const errorStatusOf = (code: ErrorCode): ErrorStatus => errorCatalog[code].status

/** User-facing message with `{placeholders}` filled from `params`. Unknown keys stay visible. */
export function errorMessage(
  code: ErrorCode,
  params: Readonly<Record<string, unknown>> = {},
): string {
  return fillMessage(errorCatalog[code].message, params)
}

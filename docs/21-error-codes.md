# 21 — Error Code Catalog

Source of truth for `packages/contract/src/errors.ts` (a Zod enum + message map). Clients (web and
mobile) switch on `error.data.code` and show the **user message** below (or a context-specific
variant). Never show raw server messages to users. Add new codes here first.

Format: `CODE` — oRPC status — when — user message.

## Auth and account
- `SESSION_EXPIRED` — UNAUTHORIZED — session missing/expired — "Your session ended. Sign in again."
- `EMAIL_NOT_VERIFIED` — FORBIDDEN — action needs verified email (purchase, post) — "Verify your email to continue. We sent a link to {email}."
- `INVALID_CREDENTIALS` — UNAUTHORIZED — wrong email/password — "Email or password is incorrect."
- `ACCOUNT_LOCKED` — FORBIDDEN — too many failed attempts — "Too many attempts. Try again in {minutes} minutes."
- `ACCOUNT_BANNED` — FORBIDDEN — banned user — "This account has been suspended. Contact support."
- `OTP_INVALID` — BAD_REQUEST — wrong/expired code — "That code is wrong or has expired."
- `TWO_FACTOR_REQUIRED` — FORBIDDEN — staff/instructor without 2FA — "Turn on two-factor authentication to continue."
- `STEP_UP_REQUIRED` — FORBIDDEN — 2FA not verified in last 12 h — "Confirm it's you with your authenticator code."
- `USERNAME_TAKEN` — CONFLICT — "That username is taken."
- `EMAIL_TAKEN` — CONFLICT — "An account with this email already exists."
- `DELETION_PENDING` — CONFLICT — action on account scheduled for deletion — "Your account is scheduled for deletion. Cancel the request to continue."

## Permissions and lookup
- `FORBIDDEN` — FORBIDDEN — generic rule failure — "You don't have access to this."
- `NOT_COURSE_OWNER` — FORBIDDEN — "Only the course instructor can do this."
- `NOT_ENROLLED` — FORBIDDEN — "Enroll in this course to open this lesson."
- `ENROLLMENT_REVOKED` — FORBIDDEN — "Your access to this course has ended."
- `INSTRUCTOR_REQUIRED` — FORBIDDEN — "Apply to teach to use the studio."
- `KYC_REQUIRED` — FORBIDDEN — "Complete identity verification to continue."
- `STAFF_ONLY` — FORBIDDEN — "This area is for Tokslearn staff."
- `*_NOT_FOUND` — NOT_FOUND — one per resource: `COURSE_NOT_FOUND`, `LESSON_NOT_FOUND`, `ORDER_NOT_FOUND`, `USER_NOT_FOUND`, `CERTIFICATE_NOT_FOUND`, `THREAD_NOT_FOUND`, `COUPON_NOT_FOUND`, `FILE_NOT_FOUND`, `SESSION_NOT_FOUND`, `FEATURE_FLAG_NOT_FOUND` — "We couldn't find that {thing}."

## Instructor onboarding
- `APPLICATION_EXISTS` — CONFLICT — "You already have an application in progress."
- `REAPPLY_TOO_SOON` — UNPROCESSABLE_CONTENT — "You can apply again on {date}."
- `KYC_FAILED` — UNPROCESSABLE_CONTENT — "We couldn't verify your identity. Check the number and try again, or contact support."
- `KYC_PROVIDER_UNAVAILABLE` — SERVICE_UNAVAILABLE — "Identity verification is temporarily unavailable. Try again shortly."
- `BANK_ACCOUNT_UNRESOLVED` — UNPROCESSABLE_CONTENT — "We couldn't find that account number at this bank."
- `BANK_NAME_MISMATCH` — UNPROCESSABLE_CONTENT — "The account name doesn't match your verified name. We've sent it for manual review."

## Authoring and media
- `COURSE_NOT_EDITABLE` — CONFLICT — in review/archived — "This course is in review. You can edit it after the review."
- `VERSION_CONFLICT` — CONFLICT — autosave stale — "This was changed in another tab. Reload to see the latest version."
- `PUBLISH_CHECKLIST_INCOMPLETE` — UNPROCESSABLE_CONTENT — (data: missing items) — "Finish the checklist before submitting."
- `SLUG_TAKEN` — CONFLICT — "That URL is taken. Try another."
- `UPLOAD_TOO_LARGE` — BAD_REQUEST — "Files must be under {limit}."
- `UNSUPPORTED_FILE_TYPE` — BAD_REQUEST — "This file type isn't supported. Use {types}."
- `VIDEO_NOT_READY` — CONFLICT — "This video is still processing."
- `VIDEO_PROCESSING_FAILED` — UNPROCESSABLE_CONTENT — "Processing failed. Upload the video again."

## Catalog, cart, checkout
- `COURSE_UNAVAILABLE` — UNPROCESSABLE_CONTENT — unpublished/archived — "This course isn't available for purchase."
- `ALREADY_ENROLLED` — CONFLICT — "You're already enrolled in this course."
- `OWN_COURSE` — UNPROCESSABLE_CONTENT — "You can't buy your own course."
- `CART_EMPTY` — UNPROCESSABLE_CONTENT — "Your cart is empty."
- `CART_CHANGED` — CONFLICT — prices/items changed since view — "Your cart changed. Review it before paying."
- `COUPON_INVALID` — UNPROCESSABLE_CONTENT — "This coupon code isn't valid."
- `COUPON_EXPIRED` — UNPROCESSABLE_CONTENT — "This coupon has expired."
- `COUPON_LIMIT_REACHED` — UNPROCESSABLE_CONTENT — "This coupon has been fully used."
- `COUPON_NOT_APPLICABLE` — UNPROCESSABLE_CONTENT — "This coupon doesn't apply to the items in your cart."
- `COHORT_FULL` — UNPROCESSABLE_CONTENT — "This cohort is full. Choose another start date."
- `COHORT_ENROLLMENT_CLOSED` — UNPROCESSABLE_CONTENT — "Enrollment for this cohort has closed."
- `PAYMENT_NOT_CONFIRMED` — UNPROCESSABLE_CONTENT — verify says not successful — "Your payment wasn't completed. You haven't been charged."
- `PAYMENT_AMOUNT_MISMATCH` — UNPROCESSABLE_CONTENT — internal alert, user sees — "We couldn't confirm your payment. Our team has been notified; contact support with reference {ref}."
- `PAYMENT_PROVIDER_UNAVAILABLE` — SERVICE_UNAVAILABLE — "Payments are temporarily unavailable. Your cart is saved; try again in a few minutes."
- `ORDER_ALREADY_PAID` — CONFLICT — (idempotent confirm returns success instead; used only for retries on other actions)

## Learning
- `LESSON_LOCKED` — UNPROCESSABLE_CONTENT — drip (data: `unlocksAt`) — "This lesson opens on {date}."
- `PREREQUISITE_INCOMPLETE` — UNPROCESSABLE_CONTENT — "Complete {lesson} first."
- `PLAYBACK_TOKEN_EXPIRED` — UNAUTHORIZED — client refreshes silently; user sees nothing unless refresh fails — "Reload the lesson to continue watching."
- `CONFIRMATION_REQUIRED` — UNPROCESSABLE_CONTENT — important download/exam start without confirm flag — (client shows confirm dialog)

## Assessments
- `ATTEMPT_IN_PROGRESS` — CONFLICT — (data: attemptId) — "You have an attempt in progress. Continue it."
- `NO_ATTEMPTS_LEFT` — UNPROCESSABLE_CONTENT — "You've used all attempts for this quiz."
- `COOLDOWN_ACTIVE` — UNPROCESSABLE_CONTENT — (data: `availableAt`) — "You can try again on {date, time}."
- `EXAM_NOT_ELIGIBLE` — UNPROCESSABLE_CONTENT — "Complete all lessons before taking the exam."
- `ATTEMPT_EXPIRED` — UNPROCESSABLE_CONTENT — "Time is up. Your answers were submitted automatically."
- `ATTEMPT_ALREADY_SUBMITTED` — CONFLICT — "This attempt has already been submitted."
- `SUBMISSION_PAST_DUE` — UNPROCESSABLE_CONTENT — "The deadline for this assignment has passed."
- `RESUBMISSION_NOT_ALLOWED` — UNPROCESSABLE_CONTENT — "This assignment doesn't allow resubmissions."

## Certificates
- `CERTIFICATE_CRITERIA_NOT_MET` — UNPROCESSABLE_CONTENT — "You haven't met the requirements for this certificate yet."
- `CERTIFICATE_REVOKED` — CONFLICT — "This certificate has been revoked."
- `NAME_CORRECTION_USED` — UNPROCESSABLE_CONTENT — "You've already corrected the name on this certificate. Contact support for further changes."

## Community, reviews
- `THREAD_LOCKED` — UNPROCESSABLE_CONTENT — "This discussion is closed."
- `REVIEW_NOT_ELIGIBLE` — UNPROCESSABLE_CONTENT — "You can review this course after completing 20% of it."
- `CONTENT_REJECTED` — UNPROCESSABLE_CONTENT — spam/profanity filter — "Your post couldn't be published. Remove links or flagged words and try again."

## Live
- `LIVE_NOT_OPEN` — UNPROCESSABLE_CONTENT — (data: `opensAt`) — "The session opens 15 minutes before it starts."
- `LIVE_ENDED` — UNPROCESSABLE_CONTENT — "This session has ended. The recording will appear here when it's ready."
- `LIVE_PROVIDER_UNAVAILABLE` — SERVICE_UNAVAILABLE — "We can't connect to the live class right now. Try again in a minute."

## Refunds and money
- `NO_REFUND_POLICY` — UNPROCESSABLE_CONTENT — "This course doesn't offer refunds."
- `REFUND_WINDOW_CLOSED` — UNPROCESSABLE_CONTENT — "The {n}-day refund window ended on {date}."
- `CONTENT_CONSUMED` — UNPROCESSABLE_CONTENT — "Refunds aren't available after watching 30% of a course. You've watched {pct}%."
- `IMPORTANT_RESOURCE_DOWNLOADED` — UNPROCESSABLE_CONTENT — "Refunds aren't available after downloading {resource}."
- `CERTIFICATE_ISSUED` — UNPROCESSABLE_CONTENT — "Refunds aren't available after a certificate is issued."
- `EXAM_STARTED` — UNPROCESSABLE_CONTENT — "Refunds aren't available after starting the certification exam."
- `REFUND_ALREADY_REQUESTED` — CONFLICT — "You've already requested a refund for this course."
- `APPEAL_USED` — UNPROCESSABLE_CONTENT — "You've already appealed this decision."
- `PAYOUT_ACCOUNT_REQUIRED` — UNPROCESSABLE_CONTENT — "Add a bank account to receive payouts."
- `PAYOUT_HOLD_ACTIVE` — UNPROCESSABLE_CONTENT — "Payouts to a new bank account start 72 hours after the change."
- `LEDGER_UNBALANCED` — INTERNAL (never user-facing) — Sentry alert.

## Platform
- `RATE_LIMITED` — TOO_MANY_REQUESTS — (data: `retryAfterSec`) — "You're doing that too often. Try again in {sec} seconds."
- `IDEMPOTENCY_CONFLICT` — CONFLICT — same key, different payload — "This request was already sent with different details. Refresh and try again."
- `CLIENT_OUTDATED` — UPGRADE_REQUIRED-style (use PRECONDITION_FAILED) — mobile below `minSupportedVersion` — "Update the Tokslearn app to continue."
- `VALIDATION_FAILED` — BAD_REQUEST — input failed schema validation (Zod issues in `data.issues`) — "Some details are missing or wrong. Check the highlighted fields."
- `MAINTENANCE` — SERVICE_UNAVAILABLE — "Tokslearn is being updated. We'll be back shortly."
- `INTERNAL` — INTERNAL_SERVER_ERROR — anything unexpected — "Something went wrong on our side. Try again; if it keeps happening, contact support with code {requestId}."

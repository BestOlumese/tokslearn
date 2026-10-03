# 23 — Email Catalog

All emails live in `packages/emails/src/<id>.tsx` (React Email) with a plain-text version.
Voice rules from `11 §7` apply. Layout: white card on canvas, wordmark top-left, one primary button
(brand green), footer with address, "Why am I getting this?" line, and unsubscribe for non-essential mail.
Subject lines: sentence case, specific, ≤ 60 characters, no emoji, no "!".

Every email has: `id`, trigger, recipient, subject, content outline, category
(`security` = always sent, `transactional` = always sent, `activity` = can be turned off,
`marketing` = opt-in only).

## Account and security

| id | Trigger | Subject | Content | Category |
|----|---------|---------|---------|----------|
| `verify-email` | sign-up, email change | Confirm your email for Tokslearn | Button "Confirm email" (link expires in 24 h), ignore-if-not-you line | security |
| `sign-in-code` | OTP request | Your Tokslearn sign-in code: {code} | Code large, expires in 10 min, device/location approx. | security |
| `reset-password` | forgot password | Reset your Tokslearn password | Button (expires 1 h), note all sessions end after reset | security |
| `password-changed` | password change | Your password was changed | When, device; "If this wasn't you" → reset link + support | security |
| `new-sign-in` | sign-in from new device | New sign-in to your account | Device, approx. location, time; secure-account link | security |
| `two-factor-changed` | 2FA on/off, backup codes regenerated | Two-factor authentication was {turned on/off} | | security |
| `email-changed-old` | email change | Your email address is being changed | Sent to old address; cancel link | security |
| `deletion-requested` | deletion request | Your account will be deleted on {date} | What's deleted, what's kept (receipts), cancel button | security |
| `data-export-ready` | export job done | Your Tokslearn data export is ready | Download link (expires 7 days) | transactional |

## Purchases and learning

| id | Trigger | Subject | Content | Category |
|----|---------|---------|---------|----------|
| `order-receipt` | `order.paid` | Receipt for order {publicId} | Items, prices, discount, total, payment method, refund policy per item with last date, "Start learning" button, PDF receipt link | transactional |
| `enrollment-free` | free enrollment | You're enrolled in {course} | Start button, what's inside (lessons, duration), certificate info | transactional |
| `payment-failed` | verify failed after attempt | Your payment for {course} didn't go through | You weren't charged; retry link to cart | transactional |
| `lesson-unlocked` | drip job (07:00 Lagos, one per learner per course per day) | New lesson available in {course} | Lesson title (plus any others that opened the same day), button to the first | activity |
| `live-reminder-24h` / `-15m` | `live-reminders` job, 24 h and 15 min before | {session} starts tomorrow at {7:00 pm} / {session} starts in 15 minutes | Host, course (and cohort), time in Lagos, button to the class page; 24 h: Google Calendar link (no .ics: the pipeline has no attachments, ADR-039). Not sent for a cancelled or moved class (the move sends its own). | activity |
| `assignment-graded` | `assignment.graded` | Your assignment in {course} has been graded | Score, pass/fail (or "sent back for changes"), feedback excerpt, view button | activity |
| `attempt-voided` | `attempt.voided` | Your exam attempt in {course} was cancelled | The instructor's reason, that the attempt no longer counts and can be taken again, button to the exam | transactional |
| `certificate-issued` | `certificate.issued` | Your certificate for {course} | Congratulate plainly, download PDF (links to My certificates), verification link, LinkedIn add. Sent once, when first issued; not on name corrections. | transactional |
| `qa-answered` | answer to my question | {instructor} answered your question | Question title, answer excerpt, view | activity |
| `thread-reply` / `mention` | a reply to my thread or question ("has an answer" when a teacher answers), or `@username` | New reply in {course} / {name} mentioned you in {course} | Who, the thread, an excerpt, a link. At most one per person per thread per hour (ADR-038); the digest comes with Phase 9 preferences. | activity |
| `announcement` | instructor announcement (course or cohort) | {course}: {announcement title} | Body (plain, up to 2,000 characters), instructor's name, link to the discussion. Sent by the `announcement-send` job, once per learner. | activity |
| `refund-update` | refund status change | Your refund request for {course}: {approved/denied/processed} | Decision, reason in plain words, amount and timing ("banks usually take 5–10 working days"), appeal link if denied | transactional |
| `streak-at-risk` | optional, 20:00 if no activity and streak ≥ 3 | Keep your {n}-day streak | One lesson suggestion | activity (off by default) |
| `wishlist-price-drop` | price drop/coupon on wishlisted | {course} is now {price} | Old vs new price, end date if coupon | marketing (opt-in) |

## Instructors

| id | Trigger | Subject | Content | Category |
|----|---------|---------|---------|----------|
| `application-received` | submit | We received your application to teach | What happens next, typical review time | transactional |
| `application-decision` | approve/reject | Your Tokslearn instructor application: {approved/not approved} | Approved: next steps (create course, payout setup). Rejected: reason, reapply date | transactional |
| `kyc-result` | KYC complete | Identity verification {complete/needs attention} | What to do if manual review | transactional |
| `course-review-decision` | review done | {course} is {live / needs changes} | Live: link + share referral link. Changes: reviewer notes, edit button | transactional |
| `new-sale` | sale (digest daily by default, instant optional) | You made {n} sales today | Totals, pending release dates | activity |
| `new-review` | a learner's first review of a course (not edits) | New {rating}-star review on {course} | Stars, excerpt (280 characters) or "without writing a review", button to `/teach/reviews?course=` | activity |
| `grading-backlog` | weekly if queue > 0 | {n} submissions waiting for grading | Oldest age, queue link | activity |
| `payout-sent` | transfer success | Your payout of {amount} is on its way | Amount, bank (last 4), period, statement link | transactional |
| `payout-failed` | transfer failed | We couldn't send your payout | Reason, fix bank details button, will retry next run | transactional |
| `payout-account-changed` | bank change | Your payout bank account was changed | New bank last 4, 72-hour hold, "not you?" | security |
| `monthly-statement` | statement generated | Your {month} statement | Summary numbers, PDF link | transactional |

## Staff

| id | Trigger | Subject | Recipient |
|----|---------|---------|-----------|
| `staff-ledger-alert` | integrity job failure | [Alert] Ledger integrity check failed | finance + admins |
| `staff-payout-run-ready` | draft created | Payout run for {month} ready for review | finance |
| `staff-amount-mismatch` | payment verify mismatch | [Alert] Payment amount mismatch on {ref} | finance |
| `staff-review-queue` | daily if queue > 0 | {n} applications, {m} courses waiting for review | reviewers |

## Rules

- Send through `notifications.notify` → `email-send` job (never call Resend from request handlers).
- Idempotency key per email = `{id}:{businessKey}` (e.g. `order-receipt:{orderId}`) so retries don't double-send.
- Test: snapshot render for each template with fixture data; link check; plain-text present.
- Preview all templates at `/styleguide/emails` (React Email preview) during development.

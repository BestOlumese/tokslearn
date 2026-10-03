# 13 — Background Jobs and Notifications

## 1. Inngest

- Client in `packages/jobs/src/client.ts` (`id: 'tokslearn'`), served from `apps/web/app/api/inngest/route.ts`.
- Event schemas typed (Zod) in `packages/jobs/src/events.ts`, same names as domain events.
- Every function: idempotent (use `event.id` or a business key), `retries` set, `concurrency` keys where contention matters (e.g. `payout:{instructorId}`, `order:{orderId}`), `throttle` for provider-rate-limited calls.
- Functions call `@tokslearn/core` with a `SystemActor`. No business logic inside the Inngest function body beyond orchestration (`step.run` wrapping core calls).
- Local dev: Inngest Dev Server (`npx inngest-cli dev`).

## 2. Function catalog (v1)

| Function | Trigger | Does |
|----------|---------|------|
| `outbox-dispatch` | after-commit call + cron every minute | Send pending outbox rows as Inngest events |
| `paystack-webhook-process` | `webhook/paystack.received` | Route charge/transfer/refund events to core |
| `order-reconcile` | cron hourly | Verify pending orders with Paystack |
| `order-abandon` | cron daily | Mark stale pending orders abandoned |
| `earnings-release` | cron daily 02:00 WAT | Pending → available |
| `payout-run-draft` | cron 1st of month 06:00 WAT | Create draft payout run |
| `payout-run-process` | cron 5th of month 09:00 WAT (next business day if needed), only runs approved runs | Bulk transfers in chunks |
| `refund-process` | `refund.approved` | Call Paystack refund |
| `ledger-integrity` | cron daily 03:00 WAT | Balance checks, alert |
| `video-status` | `webhook/bunny.received` | Update asset, durations |
| `recording-import` | `live.recording_ready` (from the Daily webhook) | Bunny fetches Daily's recording; attach the video to the session (found by title when Bunny gives no id); check every 10 min for 2 h; delete Daily's copy when ready (ADR-039) |
| `image-variants` | `file.uploaded` (image purposes) | Resize to WebP/AVIF |
| `search-reindex` | `course.published`, `course.updated` | Update `course_search` (inline, ADR-032) |
| `notification-digest` | `notification.digest_requested` (debounced 30 min per person, at most 60) | One email with the replies, answers and mentions that waited (ADR-041) |
| `notifications-prune` | cron daily 03:30 WAT | Delete read notifications older than 90 days |
| `rating-stats` | `review.changed` (debounced 10 s per course) | Recompute `course_rating_stats`, copy the rating into `course_search`, expire course/instructor/listing caches (ADR-040) |
| `certificate-issue` | `course.completed`, `exam.passed`, `external_result.recorded` (pass) | Check the live criteria, issue once per learner and course (a passing grade or quiz completes its lesson, so it arrives as `course.completed`) |
| `certificate-render` | `certificate.issued`, `certificate.name_corrected` | Make the PDF, store it in R2; email `certificate-issued` on first issue only |
| `certificate-backfill` | `course.published`, `course.updated` | Issue certificates to learners who already meet newly live rules, 200 at a time |
| `announcement-send` | `announcement.posted` | Email an announcement to the course's (or cohort's) learners, 500 per step |
| `exam-autosubmit` | cron every minute | Submit attempts past deadline |
| `badges-evaluate` | learning events | Award badges |
| `streaks-rollover` | cron daily 00:10 WAT | Apply freezes, reset broken streaks |
| `drip-unlock-notify` | cron daily 07:00 WAT | Notify unlocked lessons |
| `live-reminders` | `live.scheduled` (sleepUntil) | 24 h and 15 min reminder emails to the learners the class is for, 500 per step; nothing if it was cancelled or moved |
| `stats-aggregate` | cron hourly + nightly | Instructor/course daily stats |
| `sitemap-refresh` | `course.published` | Revalidate sitemap tags |
| `statement-generate` | `payout.run.completed` | Monthly PDF statements |
| `account-deletion` | `user.deletion_requested` (sleep 14 days) | Anonymize |
| `email-send` | `notification.email_requested` | Render React Email + Resend |

## 3. Notifications

Single entry point: `notifications.notify(ctx, { userId, type, title, body?, link?, dedupeKey?, email? })` (and `notifyMany` for batches). Implemented in Phase 9 (ADR-041).
It writes the in-app row, checks preferences, and emits `notification.email_requested` /
`notification.push_requested` (Phase 14).

Types (v1): `order.receipt`, `enrollment.welcome`, `lesson.unlocked`, `live.reminder`,
`assignment.graded`, `certificate.issued`, `qa.answered`, `thread.reply`, `mention`,
`announcement`, `refund.updated`, `review.received` (instructor), `course.review_decision`
(instructor), `payout.sent` / `payout.failed` (instructor), `application.decision`, `security.*`
(new sign-in, password changed — cannot be disabled).

Rules:
- Transactional + security emails always send. Marketing emails require opt-in (NDPA) and have one-click unsubscribe.
- Batch noisy notifications (thread replies) into a digest if > 5 in an hour.
- Email templates: plain, readable, same voice rules as `11 §7`. Include text version. From `Tokslearn <hello@mail.tokslearn.com>` (dedicated sending subdomain with SPF, DKIM, DMARC).
- In-app notification bell: unread count via `notifications.unreadCount` (cheap indexed query), refetch on window focus + every 60 s while visible.

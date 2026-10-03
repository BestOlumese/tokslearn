# 05 — Database

Postgres on Neon, Drizzle ORM. This file defines conventions, every table, and the indexes that
matter for scale. Implement schema files per module in `packages/db/src/schema/<module>.ts`.

## 1. Conventions

- Primary keys: `id uuid` generated in app with UUIDv7 (`uuidv7` package) — time-ordered, index-friendly.
- Public identifiers: `slug` (courses, instructors, categories) or `public_id` (8–10 char base32, e.g. orders `TL-7K3M9Q2A`, certificates).
- Every table: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` (updated by app).
- Soft delete (`deleted_at`) only on: users, courses, lessons, reviews, discussion posts. Everything financial is append-only (never deleted, never updated except status).
- Money: `amount_kobo bigint not null` + `currency char(3) not null default 'NGN'`.
- Enums: Postgres enums via `pgEnum` for stable sets; `text` + check constraint for sets likely to grow.
- Foreign keys: always declared, `on delete restrict` by default; `cascade` only for pure child rows (lesson → lesson_progress is NOT cascade; section → lesson cascade only while course is draft — enforce in service).
- JSON: `jsonb` only for truly schemaless data (rich text doc, provider payloads, settings). Validate with Zod on read/write.
- Every foreign key column gets an index unless it is the first column of a composite index.
- Migrations: `drizzle-kit generate` → review SQL → commit. Never `push` against production. Destructive changes use expand/contract (add new → backfill → switch reads → drop old in a later release).

## 2. Tables by module

Column lists show the important fields; add `id`, `created_at`, `updated_at` to all.

### identity (Better Auth owns `user`, `session`, `account`, `verification`, `two_factor`)
- `user` (Better Auth) + extra fields: `username` unique (lowercase), `headline`, `bio`, `avatar_key`, `badges_public` (default false, ADR-042), `timezone` default `Africa/Lagos`, `banned`, `ban_reason`, `ban_expires`, `role` (Better Auth admin plugin, mirrors the highest staff role), `two_factor_enabled`, `deletion_requested_at` (14-day grace, docs/07 §6), `deleted_at` (set when anonymized).
- `session` (Better Auth) + `two_factor_verified_at` (set by a successful TOTP/backup-code check; staff and step-up checks read it), `impersonated_by`. Sessions live in Postgres and are cached in Redis (secondary storage).
- `two_factor` (Better Auth): encrypted `secret`, `backup_codes`, `verified`, `failed_verification_count`, `locked_until`.
- `user_roles`: `user_id`, `role` enum(learner, instructor, reviewer, finance, support, admin, super_admin), unique(user_id, role).
- `user_links`: `user_id`, `kind` (website, linkedin, x, youtube, github, other), `url`, `position`. Max 5 per user.
- `user_roles` also stores `granted_by`. Every new user gets `learner` (Better Auth `user.create.after` hook → `identity.onUserCreated`).

### instructors
- `instructor_applications`: `user_id`, `status` enum(draft, submitted, in_review, approved, rejected), `expertise`, `sample_url`, `answers jsonb`, `reviewer_id`, `decision_reason`, `submitted_at`, `decided_at`.
- `kyc_checks`: `user_id`, `provider` ('dojah'), `method` enum(bvn, nin), `status` enum(pending, verified, failed, manual_review), `provider_reference`, `matched_name`, `face_match_score numeric(5,2)`, `raw_result_redacted jsonb`, `verified_at`. **Never store the BVN/NIN itself.**
- `payout_accounts`: `user_id`, `bank_code`, `bank_name`, `account_number_last4`, `account_name`, `paystack_recipient_code`, `status` enum(active, pending_review, disabled), `name_match_score`. Full account number goes to Paystack when creating the recipient; store last 4 only.
- `instructor_profiles`: `user_id` pk, `slug` unique, `display_name`, `approved_at`, `commission_override_id` nullable, `stats jsonb` (denormalized counters, refreshed by job).

### catalog
- `categories`: `slug` unique, `name`, `parent_id`, `position`.
- `tags`: `slug` unique, `name`.
- `course_tags`: `course_id`, `tag_id` pk(course_id, tag_id).
- `course_search`: `course_id` pk, `document tsvector`, `title_trgm text`, `popularity_score`, `rating_avg`, `published_at`. GIN on `document`, GIN trigram on `title_trgm`. Rebuilt by job on `course.published` / `course.updated`.

### courses
- `courses`: `instructor_id`, `slug` unique, `status` enum(draft, in_review, changes_requested, published, unlisted, archived), `live_revision_id`, `draft_revision_id`, `category_id`, `level` enum(beginner, intermediate, advanced, all), `language` default 'en', `price_kobo`, `compare_at_kobo`, `currency`, `is_free` generated, `refund_policy_days` smallint check in (0,3,7,14), `certificate_mode` enum(none, completion, exam, external), `certificate_settings` jsonb (exam: `examQuizId`, `requireCompletion`; external: `providerName`, `providerUrl`; on revisions too, copied on approval), `drip_mode` enum(none, fixed_dates, after_enrollment, cohort_relative), `completion_threshold_pct` default 90, `subscription_opt_in` bool default false (Phase 12), `drm_required` bool default false (Phase 15), `total_duration_sec`, `lesson_count`, `published_at`, `deleted_at`.
- `course_revisions`: `course_id`, `number`, `status` enum(draft, submitted, approved, rejected, superseded), `title`, `subtitle`, `description_doc jsonb`, `description_html`, `outcomes text[]`, `requirements text[]`, `cover_key`, `promo_video_id`, `snapshot jsonb` (frozen outline for review), `review_notes`, `reviewed_by`, `reviewed_at`.
- `sections`: `course_id`, `title`, `position`.
- `lessons`: `course_id`, `section_id`, `type` enum(video, article, quiz, assignment, live, resource), `title`, `position`, `is_preview` bool, `duration_sec`, `video_asset_id`, `article_doc jsonb`, `article_html`, `quiz_id`, `assignment_id`, `live_session_id`, `drip_offset_days`, `drip_date`, `deleted_at`.
- `lesson_resources`: `lesson_id`, `file_id`, `title`, `is_important` bool (downloading makes the sale non-refundable).
- `bundles`: `instructor_id`, `slug`, `title`, `price_kobo`, `status`.
- `bundle_courses`: `bundle_id`, `course_id`.
- `course_staff`: `course_id`, `user_id`, `role` enum(co_instructor, teaching_assistant). Co-instructor revenue share is Phase 12+; v1 = TA only.

Index: `lessons(course_id, section_id, position)`, `courses(instructor_id, status)`, `courses(status, published_at desc)`.

### media
- `video_assets`: `owner_id`, `provider` ('bunny'), `library_id`, `provider_video_id` unique, `status` enum(uploading, processing, ready, failed), `duration_sec`, `width`, `height`, `thumbnail_url`, `drm_enabled` bool, `captions jsonb`, `error`.
- `files`: `owner_id`, `bucket`, `key` unique, `mime`, `size_bytes`, `sha256`, `purpose` enum(resource, assignment_submission, cover, avatar, certificate, exam_evidence, other), `scan_status` enum(pending, clean, infected, skipped).

### commerce
- `carts`: `user_id` unique (one active cart), `coupon_code`.
- `cart_items`: `cart_id`, `item_type` enum(course, bundle), `item_id`, unique(cart_id, item_type, item_id).
- `wishlist_items`: `user_id`, `course_id` unique pair. Price-drop notices go to these people (ADR-042).
- `coupons`: `instructor_id` nullable (null = platform coupon), `code` unique (case-insensitive, store upper), `kind` enum(percent, fixed), `value`, `applies_to` enum(course, bundle, instructor_all), `target_id`, `max_redemptions`, `per_user_limit`, `starts_at`, `ends_at`, `active`, `announced_at` (shared with wishlisters, once; ADR-042).
- `referral_links`: `instructor_id`, `code` unique, `target_type`, `target_id` nullable, `clicks` (counter updated via Redis flush).
- `attributions`: `user_id` nullable, `anonymous_id`, `source` enum(instructor_referral, instructor_coupon, platform_organic, platform_paid), `referral_link_id`, `utm jsonb`, `expires_at` (30-day window). Resolved at checkout.
- `orders`: `public_id` unique, `user_id`, `status` enum(pending, paid, failed, abandoned, refunded, partially_refunded), `subtotal_kobo`, `discount_kobo`, `total_kobo`, `currency`, `provider` ('paystack'), `provider_reference` unique, `paid_at`, `idempotency_key` unique.
- `order_items`: `order_id`, `item_type`, `item_id`, `course_id` (for bundles: one row per course with allocated price), `instructor_id`, `list_price_kobo`, `discount_kobo`, `net_price_kobo`, `attribution_source`, `commission_rule_id`, `platform_rate_bps` (basis points snapshot), `instructor_share_kobo`, `platform_share_kobo`, `gateway_fee_share_kobo`, `refund_policy_days_snapshot`, `refundable_until`, `vat_kobo`, `status` enum(active, refunded, non_refundable, refund_pending), `non_refundable_reason` enum(no_refund_policy, important_download, content_consumed, exam_started, certificate_issued), `earning_status` enum(pending, available, paid, reversed).
- `coupon_redemptions`: `coupon_id`, `order_id`, `user_id`.
- `payment_events`: `provider`, `event_id` unique, `type`, `payload jsonb`, `processed_at`, `error`. (Idempotency for webhooks.)

Index: `order_items(instructor_id, earning_status)`, `order_items(refundable_until) where earning_status='pending'`, `orders(user_id, created_at desc)`.

### ledger (double-entry, append-only)
- `ledger_accounts`: `code` unique (e.g. `platform:revenue`, `platform:cash:paystack`, `platform:gateway_fees`, `platform:refunds_payable`, `instructor:{userId}:pending`, `instructor:{userId}:available`, `instructor:{userId}:paid_out`, `tax:vat_payable`), `type` enum(asset, liability, revenue, expense, equity), `owner_id` nullable, `currency`.
- `journal_entries`: `public_id`, `kind` (sale, refund, release, payout, payout_reversal, adjustment, fee), `ref_type`, `ref_id`, `description`, `posted_at`, `posted_by` (actor), `idempotency_key` unique.
- `journal_lines`: `entry_id`, `account_id`, `direction` enum(debit, credit), `amount_kobo` > 0. Constraint (checked in service + nightly job): sum(debits) = sum(credits) per entry.
- `account_balances`: `account_id` pk, `balance_kobo`, `version` — updated in the same transaction as lines (with `SELECT … FOR UPDATE`), source of truth remains the lines.
- `commission_rules`: `scope` enum(default, instructor, promo), `instructor_id` nullable, `source` (attribution source), `platform_rate_bps`, `starts_at`, `ends_at`, `created_by`.

### payouts
- `payout_runs`: `period_start`, `period_end`, `status` enum(draft, approved, processing, completed, partially_failed), `approved_by`, `provider_batch_ref`, `total_kobo`.
- `payout_items`: `run_id`, `instructor_id`, `amount_kobo`, `payout_account_id`, `status` enum(queued, sent, success, failed, reversed), `provider_transfer_code` unique, `failure_reason`, `journal_entry_id`.
- `statements`: `instructor_id`, `period`, `file_id` (PDF), `totals jsonb`.

### refunds
- `refund_requests`: `public_id` (RF-…), `order_item_id` unique, `order_id`, `user_id`, `course_id`, `instructor_id`, `amount_kobo`, `reason_code` enum(not_as_described, quality, technical, duplicate, changed_mind, other), `reason_text`, `status` enum(under_review, approved, denied, processing, processed, failed), `decided_by`, `decided_at`, `decision_reason` (a rule's code or finance's words), `eligibility_snapshot jsonb`, `appeal_text`, `appealed_at`, `provider_refund_id`, `sent_at`, `processed_at`, `failure_reason` (ADR-043).
- `consumption_events`: `user_id`, `course_id`, `order_item_id` nullable, `kind` enum(video_progress, resource_download, certificate_issued, exam_started, assignment_submitted), `ref_id`, `value numeric`, `occurred_at`, `ip_hash`, `user_agent_hash`. Append-only evidence. Partition by month when > 50M rows.

### enrollments
- `enrollments`: `user_id`, `course_id`, `source` enum(purchase, free, bundle, coupon_100, admin_grant, subscription, organization), `order_item_id`, `cohort_id`, `status` enum(active, revoked, expired, completed), `access_expires_at` nullable, `completed_at`, `last_accessed_at`, `progress_pct smallint`. unique(user_id, course_id).

Index: `enrollments(course_id, status)`, `enrollments(user_id, last_accessed_at desc)`.

### progress
- `lesson_progress`: pk(user_id, lesson_id), `course_id`, `status` enum(not_started, in_progress, completed), `position_sec`, `watched_sec`, `max_position_sec`, `completed_at`, `updated_at`.
- `activity_days`: pk(user_id, day date) — one row per active learning day (streaks).
- `streaks`: `user_id` pk, `current`, `longest`, `last_day`, `freeze_tokens`.

Write pattern: clients send heartbeats every 20 s (or on pause/end/leave); server upserts
`lesson_progress` with `GREATEST()` for max position; completion is computed server-side.
Rate-limit heartbeats per user (1 per 10 s per lesson).

### assessments
- `question_banks`: `owner_id`, `course_id`, `title`, `archived_at`.
- `questions`: `bank_id`, `type` enum(single, multiple, true_false, short_text, ordering, matching), `prompt_doc jsonb`, `prompt_html`, `options jsonb`, `answer jsonb` (**never sent to clients**), `explanation_html`, `points`, `difficulty`, `tags text[]`, `position`, `archived_at` (questions that attempts point at are archived, never deleted).
- `quizzes`: `course_id`, `kind` enum(practice, graded, exam), `title`, `settings jsonb` (time_limit_sec, attempts_allowed, cooldown_hours, pass_pct, shuffle_questions, shuffle_options, questions_per_attempt, show_answers enum(never, after_submit, after_pass, after_close), lockdown flags).
- `quiz_questions`: pk(`quiz_id`, `question_id`), `position` (fixed quizzes).
- `quiz_sources`: `quiz_id`, `bank_id`, `question_count`, `tag_filter` (draw N questions from bank).
- A quiz or exam is a lesson of type `quiz` (`lessons.quiz_id`, unique); an exam is a quiz with `kind = exam`.
- `quiz_attempts`: `quiz_id`, `user_id`, `attempt_no`, `status` enum(in_progress, submitted, auto_submitted, graded, void), `started_at`, `deadline_at` (server), `submitted_at`, `question_ids uuid[]` (frozen selection), `option_orders jsonb`, `score`, `max_score`, `passed`, `integrity jsonb` (focus-loss count, paste attempts, IP changes), `flagged` bool, `void_reason`, `voided_by`, `voided_at`. Scores are `numeric(10,2)` (partial credit).
- `attempt_answers`: pk(attempt_id, question_id), `answer jsonb`, `is_correct`, `points_awarded`, `answered_at`.
- Constraint: one `in_progress` attempt per (quiz, user) — partial unique index.

### assignments
- `assignments`: `course_id`, `instructions_doc`, `instructions_html`, `submission_types` (text, file, link), `max_files`, `max_file_mb`, `rubric jsonb`, `max_score`, `pass_pct`, `due_mode` (none, days_after_enrollment, cohort_date), `due_days`, `late_policy jsonb`, `resubmissions_allowed` (count). The lesson points at it (`lessons.assignment_id`, unique).
- `submissions`: `assignment_id`, `user_id`, `attempt_no`, `text_html`, `file_ids uuid[]`, `link`, `status` enum(draft, submitted, grading, graded, returned), `submitted_at`, `is_late`, `late_penalty_pct`. One draft per (assignment, user) — partial unique index; the grading queue reads a partial index on submitted/grading.
- `grades`: `submission_id` unique, `grader_id`, `decision` enum(graded, returned), `rubric_scores jsonb`, `score`, `max_score`, `passed`, `feedback_doc`, `feedback_html`, `graded_at`.

### certificates
- `certificate_templates`: `instructor_id` nullable (platform default), `layout jsonb`.
- `certificates`: `public_code` unique (e.g. `TL-C-8Q2M-4K7P`), `user_id`, `course_id`, `enrollment_id`, `basis` enum(completion, exam, external), `quiz_attempt_id`, `external_result_id`, `recipient_name_snapshot`, `course_title_snapshot`, `instructor_name_snapshot`, `provider_name_snapshot`, `issued_at`, `file_id` (null until rendered), `status` enum(active, revoked), `revoked_reason`, `revoked_at`, `revoked_by`, `name_corrected_at`. Unique (`user_id`, `course_id`): issuance is insert-if-absent. Check: revoked rows have a reason and time.
- `external_exam_results`: `course_id`, `user_id`, `provider_name`, `exam_url`, `result` enum(pass, fail), `score`, `evidence_file_id`, `recorded_by`, `recorded_at`.

### cohorts
- `cohorts`: `course_id`, `name`, `starts_at`, `ends_at`, `enroll_opens_at` (null: when published), `enroll_closes_at` (null: at the start), `capacity` (null: no limit), `status` enum(draft, open, cancelled), `timezone`. Checks: capacity > 0, ends after starts.
- `cohort_holds`: `cohort_id`, `order_id` (no FK: commerce owns orders), `user_id`, `expires_at` (30 min). unique(order_id, cohort_id). Seats taken = active/completed enrolments in the run + holds not expired (ADR-037).
- Learners belong to a run through `enrollments.cohort_id`; `cart_items.cohort_id` and `order_items.cohort_id` carry the pick. `courses.cohort_based`; `course_search.cohort_based`, `next_cohort_starts_at`. `cohort_members` is not created (ADR-037).

### community
- `threads`: `course_id` (every scope belongs to one course), `scope_type` enum(course, cohort, lesson), `scope_id`, `kind` enum(discussion, question, announcement), `author_id`, `title`, `body_doc`, `body_html` (rendered server-side), `is_pinned`, `is_locked`, `accepted_post_id`, `answered_at` (questions: first teacher answer or accepted answer), `reply_count`, `last_activity_at`, `hidden_at`, `hidden_by`, `deleted_at`.
- `posts`: `thread_id`, `author_id`, `parent_id`, `body_doc`, `body_html`, `is_instructor_answer`, `edited_at`, `hidden_at`, `hidden_by`, `deleted_at`.
- `reactions`: pk(post_id, user_id, kind), kind enum(like).
- `reports`: `target_type` enum(thread, post), `target_id`, `course_id`, `reporter_id`, `reason`, `status` enum(open, resolved, dismissed), `handled_by`, `handled_at`; unique(target_type, target_id, reporter_id).
- `thread_reads`: pk(user_id, thread_id), `last_read_at` (unread dots).

Index: `threads(scope_type, scope_id, last_activity_at desc)`, `posts(thread_id, created_at)`.

### live
- `live_sessions`: `course_id`, `cohort_id` (null: every learner), `lesson_id` (the Live class lesson that shows it), `created_by`, `title`, `starts_at`, `ends_at` (check: after start), `status` enum(scheduled, live, ended, cancelled), `recording_enabled`, `daily_room_name` unique, `daily_room_url`, `room_expires_at`, `started_at`, `ended_at`, `cancelled_at`, `recording_status` enum(none, importing, ready, failed), `daily_recording_id`, `recording_duration_sec`, `recording_title`, `recording_video_asset_id`. `lessons.live_session_id` is unused (ADR-039).
- `live_attendance`: pk(session_id, user_id), `joined_at` (first join), `left_at`, `total_sec` (from Daily's participant.left), `is_host`.

### reviews
- `reviews`: `course_id`, `user_id`, `enrollment_id`, `rating smallint 1–5` (check), `body` (plain, nullable), `status` enum(visible, hidden), `helpful_count`, `instructor_reply`, `replied_at`, `replied_by`, `edited_at`, `hidden_at`, `hidden_by`, `deleted_at`. unique(course_id, user_id); partial index on visible reviews by course and date. Eligible only after ≥ 20% progress or 30 minutes of learning (settings `review_min_progress_pct`, `review_min_learning_min`).
- `review_votes`: pk(review_id, user_id) ("helpful").
- `review_reports`: `review_id`, `reporter_id`, `reason`, `status` enum(open, resolved, dismissed), `handled_by`, `handled_at`; unique(review_id, reporter_id).
- `course_rating_stats`: `course_id` pk, `stars1`…`stars5`, `avg`, `count` (visible reviews; `rating-stats` job).

### engagement
- `notes`: `user_id`, `lesson_id`, `course_id`, `position_sec` nullable, `body`.
- `bookmarks`: `user_id`, `lesson_id`, `position_sec` nullable, unique(user_id, lesson_id, position_sec).
- `badges`: `code` unique, `name`, `description`, `criteria jsonb`, `icon_key`.
- `user_badges`: pk(user_id, badge_id), `awarded_at`.

### notifications
- `notifications`: `user_id`, `type` (core registry key), `title`, `body`, `link` (path), `data jsonb`, `in_app`, `email` enum(none, sent, digest_pending, digested), `read_at`, `dedupe_key`. Partial indexes: list `(user_id, created_at desc) where in_app`; unread `(user_id) where in_app and read_at is null`; digest `(user_id, created_at) where email in (sent, digest_pending)`; unique `(user_id, dedupe_key) where dedupe_key is not null`.
- `notification_preferences`: pk(`user_id`, `type`, `channel` enum(email, in_app, push)), `enabled`; only choices that differ from the type's default.
- `push_tokens` (Phase 14): `user_id`, `expo_token` unique, `platform`, `last_seen_at`.

### admin / platform
- `audit_log`: `actor_id`, `actor_kind`, `action`, `target_type`, `target_id`, `before jsonb`, `after jsonb`, `ip_hash`, `request_id`. Append-only. Written for every staff action and every money-affecting action.
- `settings`: `key` pk, `value jsonb`, `updated_by`.
- Tables keyed by a natural `key` (`settings`, `feature_flags`, `idempotency_keys`) use it as the primary key instead of a UUID `id`; they still have `created_at`/`updated_at`.
- `actor_id`/`updated_by` columns get their foreign key to `user` in Phase 1, when the table exists.
- `feature_flags`: `key` pk, `enabled`, `rules jsonb`, `description` (shown on `/admin/settings/flags`), `updated_by`.
- `outbox`: `event_name`, `payload jsonb`, `status` enum(pending, sent, failed), `attempts`, `available_at`, `sent_at`, `last_error`. Index `(status, available_at)`.
- `idempotency_keys`: `key` pk, `scope`, `request_hash` (SHA-256 of scope + input; a mismatch returns `IDEMPOTENCY_CONFLICT`), `response jsonb`, `expires_at` (for client-supplied idempotency on POST mutations like checkout).

### Phase 12–13 placeholders (create when the phase starts, not before)
- `subscriptions`, `subscription_plans`, `pool_periods`, `pool_allocations`.
- Better Auth `organization`, `member`, `invitation` + `seat_licenses`, `org_course_assignments`.

## 3. Performance rules

1. Every list endpoint is **cursor-paginated** (`(created_at, id)` or `(position, id)`), max 50 per page. No `OFFSET` on large tables.
2. Denormalize counters that power listings (`lesson_count`, `total_duration_sec`, `reply_count`, rating stats) and update them via events, not on read.
3. Heavy aggregates (instructor analytics) are pre-computed nightly/hourly into `*_daily_stats` tables by Inngest; dashboards read those.
4. Hot reads (course outline, published course by slug, category tree) go through `'use cache'` + tags; Redis only for non-Next consumers (mobile via API) where needed.
5. Check `EXPLAIN ANALYZE` for any query touching `enrollments`, `lesson_progress`, `consumption_events`, `journal_lines` before merging. Add the index in the same PR.
6. Use `SELECT … FOR UPDATE` only in ledger/payout/checkout transactions; keep those transactions short (no network calls inside them — call Paystack before or after, never during).
7. Plan for partitioning (by month) of `consumption_events`, `journal_lines`, `audit_log` once they pass ~50M rows. Primary keys are UUIDv7 so time-ordering helps.

## 4. Seed data

`packages/db/seed/` creates: 1 super admin, 2 instructors (one pending KYC), 10 learners,
6 categories, 8 courses in different states (free, paid, with exam, cohort-based, external cert),
coupons, one completed order per paid course, sample progress. Seeds must be deterministic
(fixed UUIDs) so tests can reference them.

## 5. Nightly integrity checks (Inngest cron)

- Ledger: every entry balanced; account_balances equals sum of lines per account.
- Orders: every `paid` order has a matching `sale` journal entry and enrollments for each item.
- Payouts: every `success` payout item has a Paystack transfer confirmation.
- Report failures to Sentry + email to finance.

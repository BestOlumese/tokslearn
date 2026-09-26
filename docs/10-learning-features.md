# 10 — Learning Features

Covers: course authoring workflow, access & drip, player, notes/bookmarks, streaks/badges,
quizzes, certification exams, assignments, certificates, cohorts, community, live classes, reviews.

## 1. Course authoring and review workflow

States: `draft → in_review → published | changes_requested`. `unlisted` (link-only), `archived`
(no new sales; existing learners keep access).

- The studio edits a **draft revision**. Structural data (sections, lessons) is edited in place while
  the course is unpublished. After first publish, structural edits are made on the draft revision's
  snapshot and applied on approval.
- **Auto-approved changes** (no review): typo-level edits to title/subtitle/description (< 20%
  diff), lesson titles, adding lessons to an already-approved section when the instructor has ≥ 3
  approved courses and no strikes. Everything else (price increase > 50%, new certificate mode,
  new sections, category change) goes to review. Rules in `core/courses/review-rules.ts`.
- Reviewer checklist (shown in admin UI): content matches description, audio/video quality, no
  prohibited content, certificate claims valid, price reasonable, no external payment links.
- On publish/update: emit `course.published` → search reindex, cache tags invalidated
  (`course:{id}`, `catalog`, `instructor:{id}`), sitemap regenerated.

Studio UX (desktop-first but responsive): outline tree with drag-and-drop (dnd-kit), autosave
(debounced 1 s, optimistic with conflict detection via `updated_at` version), upload queue panel,
publish checklist ("Add a cover image", "At least 1 preview lesson", "Set refund policy").

## 2. Access and drip

`enrollments.canAccessLesson(actor, lessonId)` returns `{ allowed, reason, unlocksAt? }`:
1. Preview lesson → allowed for everyone.
2. Active enrollment (not revoked/expired) required.
3. Drip:
   - `after_enrollment`: `enrolled_at + drip_offset_days`
   - `fixed_dates`: `drip_date`
   - `cohort_relative`: `cohort.starts_at + drip_offset_days`
4. Prerequisite lessons (optional per lesson: "complete previous quiz first").

Locked lessons show the unlock date in the outline. A daily Inngest job sends "New lesson unlocked"
notifications.

## 3. Course player (`/learn/[courseSlug]/[lessonId]`)

- Layout: main content (video facade/article/quiz/assignment/live), right (desktop) or bottom sheet
  (mobile) outline with progress ticks, top bar with course title, progress %, next button.
- Server-render: lesson metadata, outline with access state, article HTML. Client: player controls,
  notes panel, Q&A panel (lazy-loaded on tab open).
- "Continue learning" goes to the first incomplete accessible lesson.
- Keyboard: `N` next, `P` previous, `B` bookmark, `M` add note at current time (web).
- Resume position per video lesson.

## 4. Notes, bookmarks, streaks, badges

- Notes: plain text (max 2,000 chars), optional `position_sec`. List per course, export as Markdown.
- Bookmarks: lesson or lesson+timestamp.
- Streaks: a day counts when the learner completes ≥ 1 lesson or accumulates ≥ 10 min of learning
  (Africa/Lagos day boundary, user timezone later). Streak freeze: 1 token earned per 7-day streak,
  max 2 held, auto-used on a missed day.
- Badges (v1 set, criteria as data): First lesson, First course completed, 7-day streak, 30-day
  streak, 5 courses completed, First certificate, Quiz ace (100% on a graded quiz), Helpful (answer
  accepted in Q&A). Evaluated by Inngest functions listening to events; idempotent awarding.
- Keep gamification quiet in the UI (small, tasteful; no confetti explosions on every action).

## 5. Quizzes (practice and graded)

- Built from question banks; either fixed questions or "draw N from bank(s) with tag filters".
- On `quizzes.start`: server freezes selected question ids + option order into the attempt; returns
  questions **without answers**.
- Autosave answers (`quizzes.saveAnswer`) — debounced; resume after reconnect.
- `quizzes.submit` → server grades (exact matching; short text with normalized comparison + optional
  regex/alternatives; ordering/matching partial credit configurable) → score, pass/fail, feedback per
  `show_answers` setting.
- Attempts and cooldowns enforced server-side.

## 6. Certification exams (kind = `exam`)

Server-authoritative rules:
- `exams.start` requires eligibility (e.g. all lessons completed if configured), no other attempt in
  progress, attempts remaining, cooldown passed. Warns that starting the exam makes the purchase
  non-refundable (logs `consumption_events(exam_started)`), requires explicit confirmation.
- `deadline_at = started_at + time_limit`. The client timer is display only; answers after
  `deadline_at + 5 s grace` are rejected, and a job auto-submits expired attempts.
- One question per screen or full paper (setting). Questions and options shuffled per attempt.
- Integrity signals recorded (not blocking): tab/window blur count and durations, fullscreen exits,
  paste attempts (paste is blocked in answer fields), IP/user-agent changes, very fast answer
  patterns. Attempts over thresholds are `flagged` for instructor review; the instructor can void an
  attempt with a reason (learner notified, attempt counts restored).
- Results screen: score + pass/fail; detailed answers per setting (default never for exams).
- Tell learners exactly which signals are recorded before they start (fairness + NDPA transparency).

## 7. Assignments and grading

- Submission types: rich text, files (R2, per-assignment limits), link. Autosave draft.
- Due dates relative to enrollment or cohort; late policy (accept, accept with penalty %, reject).
- Grading queue for instructor/TAs: filter by course/assignment/status, oldest first, SLA badge
  (e.g. > 5 days). Rubric scoring UI with criteria × levels, feedback, return for resubmission.
- Learner notified on grade. Grade contributes to certificate eligibility if configured.

## 8. Certificates

Criteria by `certificate_mode`:
- `completion`: course progress 100% (+ required assignments passed if configured).
- `exam`: passed certification exam (and optional completion requirement).
- `external`: instructor recorded an external `pass` result (`certificates.recordExternalResult` with provider name, exam URL, optional evidence file).

Issuance (Inngest, triggered by events): check criteria → create `certificates` row with snapshot of
names/titles → render PDF (`@react-pdf/renderer`, A4 landscape, platform template, instructor
signature image optional, QR code linking to `/verify/{code}`) → store in R2 → email learner →
emit `certificate.issued` (makes order item non-refundable).

Verification page `/verify/{code}`: static per code (cached, tag `certificate:{id}`), shows name,
course, instructor, date, basis ("Passed a timed exam" / "Completed all lessons" / "Externally
assessed via {provider}"), status (revoked shows reason). Includes JSON-LD
`EducationalOccupationalCredential`. Also "Add to LinkedIn" link with prefilled parameters.

Name changes: learner can request name correction on a certificate once (re-issues with same code,
audit logged).

## 9. Cohorts

- A course can have cohort runs. Cohort-based courses sell per cohort (enrollment tied to `cohort_id`), with capacity and enrollment window (checked at checkout; capacity reserved at `checkout.start` for 30 min using Redis to avoid oversell).
- Cohort home: schedule (live sessions + drip dates), announcements, discussion, members list (display names).
- Instructor can message the whole cohort (announcement → in-app + email).

## 10. Community (discussions, Q&A, announcements)

- Scopes: course, cohort, lesson (lesson Q&A shows in the player).
- Q&A: learner asks; instructor/TA answers marked as instructor answer; asker can accept an answer.
- Moderation: report → queue; instructor/TA can hide/lock in their course; staff everywhere.
  Profanity/spam filter on post (simple wordlist + link limits for new accounts + rate limits).
- Rich text via Tiptap (limited extensions: bold, italic, code, code block, link, lists); sanitize HTML server-side (allowlist).
- Notifications: reply to my thread, answer on my question, mention (`@username`), announcement.
- Unread tracking per thread (`thread_reads(user_id, thread_id, last_read_at)`).

## 11. Live classes (Daily)

- Instructor schedules a live session (lesson type `live` or cohort schedule item): title, time, duration, recording on/off.
- Server creates a Daily room via REST (`privacy: private`, `exp` = end + 30 min, `max_participants`, `enable_recording: cloud` if on, `eject_at_room_exp`).
- `live.join({ sessionId })` → access check (enrolled/cohort member) → Daily **meeting token** (`is_owner` for instructor/TAs, `user_name` = display name, `user_id`, `exp`). Join window: 15 min before start until end.
- Web: Daily Prebuilt embedded (`@daily-co/daily-js`, loaded only on the live page). Custom UI later if needed.
- Attendance: Daily webhooks (`participant.joined/left`) or meeting events API after the session → `live_attendance`.
- Reminders: 24 h and 15 min before (email + in-app; push in Phase 14).
- Recording import to Bunny (see `09 §6`).
- Cost guard: sessions have a max duration (setting, 3 h) and max participants per plan; usage dashboard in admin from Daily's usage API.

## 12. Reviews and ratings

- Eligible after ≥ 20% progress or 30 min learning. One review per learner per course; editable.
- Instructor can reply once (editable). Reviews can be reported; staff hide.
- Display: average, distribution, "verified learner" label, sort by most helpful/recent.
- Rating stats recomputed by job on `review.*` events; course cards read `course_rating_stats`.
- Do not show a rating until a course has ≥ 3 reviews (avoid misleading 5.0 from one review).

## 13. Instructor analytics

Pre-aggregated daily tables (`course_daily_stats`, `lesson_daily_stats`, `instructor_daily_stats`):
revenue (gross, net), orders, refunds, enrollments, active learners, completions, lesson drop-off
(% of learners who started vs completed each lesson), quiz pass rates, avg rating, traffic sources
(referral/coupon/organic/paid). Charts with a small charting lib loaded only on `/teach/analytics`.

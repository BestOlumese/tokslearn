# 01 — Product Specification

## 1. What Tokslearn is

An **instructor marketplace** where independent instructors publish and sell courses, and anyone
(general public, professionals preparing for certifications, company employees, school and
university students) can learn. Instructors decide whether a course is paid or free, whether it
issues a certificate, and whether that certificate requires an exam.

Launch market: **Nigeria, NGN, Paystack**. International currencies come later; the data model
supports multiple currencies from day one.

## 2. Roles

| Role | Who | Can do |
|------|-----|--------|
| Visitor | Not signed in | Browse catalog, view course pages, verify certificates |
| Learner | Any signed-in user | Buy/enroll, learn, take quizzes/exams, submit assignments, review, join cohorts and live classes |
| Instructor | Learner who passed application + KYC | Create courses, set prices/refund policy, grade, run cohorts and live classes, see analytics and earnings |
| Teaching assistant | Invited by an instructor, per course | Grade, answer Q&A, moderate discussions for that course |
| Reviewer | Staff | Review instructor applications and course submissions |
| Finance | Staff | Refund disputes, payout runs, ledger reports |
| Support | Staff | Look up users, orders, enrollments; limited actions |
| Admin | Staff | Everything except super-admin settings |
| Super admin | Founder(s) | Commission defaults, platform settings, staff roles |
| Org admin (Phase 13) | Customer company | Buy seats, assign courses, see team progress |

A user can hold several roles. Roles are additive.

## 3. V1 feature scope

### 3.1 Accounts
- Email + password, email OTP / magic link, Google sign-in. Email verification required before purchase.
- Profile: name, photo, headline, bio, links. Public instructor profile page.
- Sessions: cookie on web, bearer token on mobile (same Better Auth instance).
- Two-factor auth: required for instructors and staff, optional for learners.

### 3.2 Instructor onboarding
- Application form: expertise, sample content link, intended courses.
- KYC: BVN or NIN verification + selfie match via Dojah (store result + reference only).
- Bank account: resolved through Paystack (account name must match KYC name, fuzzy match + manual review on mismatch).
- Reviewer approves or rejects with reason. Approved users get the instructor role.

### 3.3 Course authoring
- Course → sections → lessons. Lesson types: video, article (rich text), quiz, assignment, live session, downloadable resource.
- Video upload direct to Bunny from the browser (resumable). Processing status shown live.
- Resources: files to R2, each flagged `important` or not (affects refunds — see `08`).
- Pricing: free or paid (NGN). Optional compare-at price.
- Refund policy per course: none, 3, 7 or 14 days (platform max 14).
- Certificate settings: none / on completion / on passing exam / external exam.
- Drip: none / fixed dates / days after enrollment / cohort-relative.
- Draft → submitted → in review → published / changes requested. Edits to a published course create a new draft revision; the live version stays up until the revision is approved (minor text edits auto-approve, see `10`).
- Bundles: several courses at one price.
- Coupons: percentage or fixed, limits, expiry, per-course or instructor-wide.
- Referral links: instructor's own tracked link (drives commission tier).

### 3.4 Discovery
- Home, categories, search (title, instructor, tags; typo tolerant), filters (price, level, rating, duration, has certificate, language).
- Course landing page: fully static shell, SEO structured data, preview lessons.
- Instructor profile pages.

### 3.5 Commerce
- Cart (multiple courses/bundles), wishlist, coupon at checkout.
- Checkout with Paystack (card, bank transfer, USSD). Free courses enroll directly.
- Order + receipt email. Enrollment is created only after verified payment.
- Refund requests within policy, auto-decided by consumption rules (see `08`).

### 3.6 Learning
- Course player: video, article, resources, next/previous, sidebar outline, resume where you stopped.
- Progress per lesson and course. Completion rules configurable (e.g. watch 90%).
- Notes (timestamped on video), bookmarks.
- Streaks (days with learning activity) and badges.
- Q&A per lesson, discussions per course/cohort, announcements.

### 3.7 Assessments
- Quizzes: MCQ single/multiple, true/false, short answer (exact/regex), ordering, matching. Question banks, randomization, pass mark, attempt limits, feedback modes.
- Certification exams: timed (server-enforced), randomized from banks, attempt limits + cooldowns, focus/tab-switch logging, copy/paste blocked, one active attempt per user, results reviewable by instructor.
- Assignments: text and/or file submission, rubric grading by instructor or TA, resubmission rules, late policy.

### 3.8 Certificates
- Auto-issued PDF when criteria met. Unique code + QR. Public verification page `/verify/{code}`.
- External exams: instructor links to a proctored exam elsewhere; instructor records result; certificate shows "Externally assessed via {provider}".
- Revocation by instructor/admin with reason (verification page shows revoked).

### 3.9 Cohorts and live classes
- Cohort-based course runs: start/end dates, capacity, enrollment window, schedule.
- Live sessions via Daily: scheduled in the course, join from the app, attendance tracked, cloud recording attached to the course afterwards.

### 3.10 Instructor analytics and earnings
- Revenue, enrollments, completion and drop-off per lesson, quiz stats, ratings.
- Earnings: pending, available, paid. Monthly statements. Payout history.

### 3.11 Admin back office
- Users, instructors, applications, course review queue, orders, refunds, disputes, payouts, ledger explorer, coupons, commission settings, featured courses, reports/moderation, audit log.

### 3.12 Notifications
- Email for transactional events. In-app notification centre. Push (Phase 14).

## 4. Explicitly later (not v1)

| Feature | Phase |
|---------|-------|
| Subscription (all-access) with watch-time revenue pool; instructors opt courses in | 12 |
| B2B seats/licences, organizations, team dashboards | 13 |
| Mobile app (Expo), learner-only, push notifications | 14 |
| DRM (Bunny MediaCage) + offline downloads on mobile | 15 |
| Multi-currency pricing, international gateways | 16 |
| AI features (tutor, quiz generation), auto captions | later |
| Nigerian language UI | later |
| Online webcam proctoring | not planned (external exams cover it) |

The schema and API must not block any of these. Each guide notes what to leave room for.

## 5. Success criteria for v1

- Lighthouse ≥ 95 mobile on home, catalog, course page, instructor page, verify page.
- p95 API latency < 300 ms for reads, < 600 ms for writes (excluding third-party calls).
- Checkout success rate tracked; zero ledger imbalance (automated nightly check).
- Survives 5,000 concurrent active learners in a load test with no errors > 0.1%.
- Every learner action available through the documented API (mobile parity test passes).

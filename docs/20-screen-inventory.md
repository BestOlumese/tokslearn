# 20 — Screen Inventory

Every screen in v1, what it shows, which states it must handle, and which procedures/services feed it.
Claude Code must not invent screens or drop elements listed here. If a screen needs something not
listed, add it here first.

Legend — **R** (rendering): `S` static shell + cached data, `S+` static shell + streamed user bits,
`D` dynamic (user-specific), `C` client-heavy. **Ph** = phase that builds it.

## 0. States every screen must handle

| State | Rule |
|-------|------|
| Loading | Skeleton matching the final layout (no spinners for page content, no layout shift). Spinners only inside buttons. |
| Empty | One sentence saying what will appear here + one action (e.g. "No courses yet. Browse courses"). |
| Error | Plain message + retry button; error boundary per route segment (`error.tsx`); Sentry captures. |
| Not found | `not-found.tsx` with search field and links to catalog. |
| Forbidden | "You don't have access to this" + the action that grants access (buy, enroll, sign in). |
| Offline / slow | Mutations show pending state; failed mutations show inline error with retry, never silent. |
| Mobile (360px) | Every screen works at 360px wide; tables become stacked rows or horizontal scroll inside a container. |

Global chrome: header (logo, search, Categories, "Teach on Tokslearn", cart, notifications bell,
avatar menu or Sign in/Sign up), footer (About, Teach, Verify a certificate, Help, Terms, Privacy,
Refund policy, contact), cookie/analytics consent banner (first visit), toast region, skip link.

## 1. Public (marketing and catalog)

| Route | R | Purpose / content | States & notes | Data | Ph |
|-------|---|-------------------|---------------|------|----|
| `/` | S+ | Left-aligned hero (promise + search), category links with course counts, course rows (Popular, Cohorts starting soon, Free to start, New), "Teach on Tokslearn" band, footer. Signed-in: "Continue learning" row at top (streamed). | No courses yet → hide empty rows; show instructor CTA | `catalog.home` | 3 |
| `/courses` | S+ | All courses: filters (category, price free/paid, level, rating ≥ 4, duration buckets, has certificate, cohort-based), sort (popular, newest, rating, price), grid, load more (cursor). Filters in URL. | No results → suggestions + clear filters | `courses.list` | 3 |
| `/search?q=` | S+ | Same grid as `/courses` + "Results for …", instructor matches row. | Typo → "Showing results for …" | `courses.search` | 3 |
| `/categories` | S | All categories with subcategories and counts. | | `catalog.categories` | 3 |
| `/categories/[slug]` | S+ | Title, description, subcategory chips, filters + grid, popular instructors in category. | Empty category → 404 unless it has children | `courses.list` | 3 |
| `/courses/[slug]` | S+ | Title, subtitle, rating (≥ 3 reviews), learners count, instructor, last updated, language, level. Promo video facade. What you'll learn, requirements, description. Curriculum (sections collapsible, duration, preview lessons playable). Certificate block (type explained in plain words). Cohort picker (if cohort course). Instructor block. Reviews (distribution + list). FAQ incl. refund rules. **Purchase panel** (sticky desktop / bottom bar mobile): price, compare-at, coupon field, Add to cart, Buy now / Enroll free / Continue learning (if enrolled), wishlist heart, refund policy line, includes list. | Unpublished → 404 (owner/staff see preview banner). Archived → "No longer available for new learners". Cohort full → waitlist disabled in v1, show next cohort. | `courses.getBySlug`, `courses.getCurriculum`, `reviews.list`, streamed `enrollments.status`, `wishlist.has` | 3 (reviews 9, cohorts 8; cart, coupon, buy and wishlist 4; enrollment status 5) |
| `/courses/[slug]/preview/[lessonId]` | S+ | Preview lesson player (video/article) with sign-up prompt. | Non-preview lesson → redirect to course page | `learn.previewPlayback` | 3 |
| `/bundles/[slug]` | S+ | Bundle title, included courses (cards), total value vs bundle price, purchase panel. | | `bundles.getBySlug` | 4 |
| `/instructors/[slug]` | S | Photo, name, headline, bio, links, stats (courses, learners, rating), courses grid, reviews summary. | | `instructors.getBySlug` | 3 (reviews summary 9) |
| `/teach` | S | Instructor landing: how it works (apply → KYC → publish), commission table in plain numbers, refund rules, payout schedule (monthly on the 5th, ₦5,000 minimum), requirements, "Apply to teach" button, FAQ. | Signed-in instructor → "Go to studio" (Phase 2: "Apply to teach" sends instructors straight to the studio, and the account menu links to it; the page stays static) | static + `settings` | 2 |
| `/verify` | S | Certificate code input + explanation. | Invalid format → inline error | — | 7 |
| `/verify/[code]` | S | Certificate details: recipient, course, instructor, issue date, basis, status (valid/revoked + reason), QR (server-rendered SVG). Cached per code, tag `certificate:{code}`; JSON-LD `EducationalOccupationalCredential` while valid; share image. Codes typed in any case, with spaces or O/I/L for 0/1, redirect to the canonical address. Noindex (ADR-036). | Unknown code → "No certificate found with this code" (200 page, noindex); revoked → says so with reason and date | `certificates.verify` | 7 |
| `/r/[code]` | — | Referral redirect: sets `tl_ref`, logs click, 302 to target. | Invalid → home | route handler | 4 |
| `/help`, `/help/[slug]` | S | Help articles (MDX in repo v1): buying, refunds, certificates, exams, teaching, payouts. | | MDX | 11 |
| `/legal/terms`, `/legal/privacy`, `/legal/refunds`, `/legal/instructor-agreement`, `/legal/content-policy` | S | Legal pages (MDX). Until then, plain-language drafts live at `/terms`, `/privacy`, `/refund-policy` and `/content-policy` (docs/25 part A, Phase 2). | | MDX | 11 |
| `/about`, `/contact` | S | Plain company info, contact form (rate-limited, emails support). | | `support.contact` | 11 |

## 2. Auth

| Route | R | Content | States | Ph |
|-------|---|---------|--------|----|
| `/sign-up` | S | Name, email, password (strength hint), Google button, terms consent line, link to sign in. | Email taken → "An account with this email exists. Sign in" | 1 |
| `/sign-in` | S | Email + password, "Email me a code instead", Google, forgot password. `?next=` preserved. | Wrong credentials (generic message), locked (retry time), unverified email (resend) | 1 |
| `/sign-in/code` | S | 6-digit OTP input (auto-advance, paste support), resend timer. | Expired/invalid code | 1 |
| `/verify-email` | S | "Check your inbox" + resend; landing from email link confirms. | Expired link | 1 |
| `/forgot-password`, `/reset-password` | S | Email form; new password form. | Same response whether email exists or not | 1 |
| `/two-factor` | S | TOTP code or backup code challenge. | | 1 |

## 3. Learner account

| Route | R | Content | States | Data | Ph |
|-------|---|---------|--------|------|----|
| `/account` (My learning) | D | Continue learning card (last lesson), streak, tabs: In progress / Completed / Wishlist / Archived. Course cards with progress bar. | No enrollments → browse CTA | `enrollments.listMine`, `learn.continue`, `engagement.getStreak` | 4 (continue card and streak 5) |
| `/account/certificates` | D | List with download, share to LinkedIn, copy check link, name correction (once, dialog). My learning links here (tab row, and "Your certificate" on course cards). | None yet → explain how to earn; revoked → reason and support contact, no download | `certificates.listMine`, `certificates.download`, `certificates.requestNameCorrection` | 7 |
| `/account/orders` | D | Orders table (date, id, items, total, status). | | `orders.list` | 4 |
| `/account/orders/[publicId]` | D | Receipt: items, prices, discount, payment method, refund policy per item with deadline, "Request refund" per eligible item (shows eligibility reason). Download PDF receipt. | Pending payment → "Confirming payment…" with auto-refresh | `orders.get`, `refunds.checkEligibility` | 4 (refund requests and PDF 10) |
| `/account/refunds` | D | Refund requests and statuses, appeal button (once). | | `refunds.listMine` | 10 |
| `/account/notes` | D | All notes grouped by course, search, export Markdown. | No notes; no search matches | `notes.list`, `notes.export` | 5 |
| `/account/badges` | D | Earned and locked badges with criteria. | | `engagement.listBadges` | 5 |
| `/account/notifications` | D | Full notification list, mark all read. | | `notifications.list` | 9 |
| `/account/settings/profile` | D | Name, username, headline, bio, avatar, links, public badges toggle. | Username taken | `me.update` | 1 |
| `/account/settings/security` | D | Password change, 2FA setup (QR + backup codes), active sessions (device, location approx., last active, revoke). | | `me.sessions.*` | 1 |
| `/account/settings/notifications` | D | Matrix type × channel (email/in-app), marketing opt-in. | Security types locked on | `notifications.preferences.*` | 9 |
| `/account/settings/privacy` | D | Export my data, delete account (explains 14-day grace, what's kept). | Pending deletion banner + cancel | `me.exportData`, `me.requestDeletion` | 1 |
| `/cart` | D | Items (course/bundle), price, remove, move to wishlist, coupon field, totals, refund summary, "Checkout" button. Mobile: summary sticky bottom. | Empty cart; item became unavailable; already enrolled item auto-removed with notice | `cart.*` | 4 |
| `/checkout` | D | Order summary, email confirmation, pay button → Paystack popup. After success → `/checkout/success?ref=`. | Paystack closed → "Payment not completed", retry. Provider down → error with retry. | `checkout.start/confirm` | 4 |
| `/checkout/success` | D | Confirmation, enrolled courses with "Start learning", receipt link. | Still verifying → polling state (max 60 s) then "We'll email you when confirmed" | `checkout.confirm` | 4 |

## 4. Learning

| Route | R | Content | States | Data | Ph |
|-------|---|---------|--------|------|----|
| `/learn/[courseSlug]` | D | Redirect to first incomplete accessible lesson. | Not enrolled → course page | `learn.getCourseOutline` | 5 |
| `/learn/[courseSlug]/[lessonId]` | D/C | Top bar (course title, progress %, exit), main area by lesson type, outline panel (sections, lesson ticks, locks with unlock dates, current highlighted), files attached to the lesson listed right under its content ("Main file" label, refund-window line), tabs under that: Overview, Notes, Q&A, Announcements. Next/previous + "Mark complete" (articles/resources). | Locked lesson → unlock date + what to do. Video processing → message. Drip locked. Revoked enrollment → forbidden state. | `learn.getLesson`, `learn.playback`, `progress.*`, `notes.*`, `community.*` | 5 (Q&A 8) |
| — video lesson | C | Facade → Bunny iframe, watermark, resume toast "Resuming at 12:40". | | | 5 |
| — article lesson | S within D | Server HTML prose, reading time. | | | 5 |
| — resource lesson | D | File list with size/type, download buttons; important files are labelled "Main file" and show the non-refundable confirm dialog while the purchase is refundable; a line says until when refunds are open, or that the window has ended. Downloading a file completes the lesson. | | `learn.resourceDownload` | 5 |
| — certificate notice | C | Top of the player for learners: "Your certificate is ready" with code and View certificate; "being prepared" while the job issues it (checks every 3 s for a minute, then says it will be emailed). | Revoked or no certificate mode → nothing | `certificates.forCourse` | 8 |
| — quiz lesson | C | Intro (questions, time, attempts left, pass mark) → question UI → results. | Attempts exhausted; cooldown active (time left) | `quizzes.*` | 6 |
| — exam lesson | C | Rules screen (time limit, recorded signals, non-refundable warning, confirm checkbox) → exam (timer, question navigator, flag for review, autosave indicator) → submit confirm → results. | Time up → auto-submit notice; connection lost → "Answers saved locally, reconnecting" + retry; ineligible (lessons incomplete) | `exams.*` | 6 |
| — assignment lesson | C | Instructions, rubric preview, due date (late policy), editor/file upload, draft autosave, submit; after submit: status, grade, feedback, resubmit if allowed. | Past due + reject policy | `assignments.*` | 6 |
| — live lesson | D | Session time (local), countdown, "Join" (active 15 min before), recording after session. | Cancelled; ended without recording | `live.*` | 8 |
| `/learn/[courseSlug]/live/[sessionId]` | C | Daily Prebuilt full-width, leave button returns to lesson. | Outside join window; not member | `live.join` | 8 |
| `/learn/[courseSlug]/community` | D | Threads list (filters: all, questions, unanswered, announcements), new thread, thread view with replies, accept answer, report. | Locked thread | `community.*` | 8 |
| `/learn/[courseSlug]/cohort` | D | Cohort home: dates, schedule, members, announcements. | Non-cohort course → 404 | `cohorts.*` | 8 |
| `/learn/[courseSlug]/review` | D | Rating + review form (edit if exists). | Not eligible yet → progress needed | `reviews.*` | 9 |

## 5. Instructor studio (`/teach/*`)

Left nav: Dashboard, Courses, Bundles, Coupons, Referral links, Learners, Grading, Q&A, Live, Analytics, Earnings, Settings.

| Route | R | Content | States | Data | Ph |
|-------|---|---------|--------|------|----|
| `/teach/apply` | D | Multi-step: About you → Expertise & sample → KYC (BVN/NIN + selfie) → Bank account → Review & submit. Progress saved per step. | Submitted/in review/rejected (reason + reapply after 30 days) | `instructors.*`, `kyc.*`, `payoutAccounts.*` | 2 |
| `/teach` (dashboard) | D | This month: revenue, enrollments, avg rating; to-do list (grading queue count, unanswered questions, courses with changes requested, upcoming live sessions); recent sales. | New instructor → checklist to first course | `analytics.instructorSummary` | 10 (Phase 2: `/teach` stays the public landing; the studio opens at `/teach/courses`, whose empty state leads to the first course. The dashboard moves to `/teach/dashboard` when there are sales to show, ADR-031) |
| `/teach/courses` | D | Table: title, status badge, learners, rating, revenue, last updated; "New course". | | `studio.courses.list` | 2 |
| `/teach/courses/new` | D | Title + category → creates draft → redirects to editor. | | | 2 |
| `/teach/courses/[id]/details` | D | Title, subtitle, description (Tiptap), outcomes, requirements, level, language, category, tags, cover upload (16:9 frame; cropping later), promo video (Phase 3, with the course page that plays it). | Autosave indicator; conflict banner | `studio.courses.*` | 2 |
| `/teach/courses/[id]/curriculum` | D/C | Sections/lessons tree, add lesson by type, drag-and-drop + keyboard move, preview toggle, per-lesson editor drawer, upload queue panel. | Video processing/failed per lesson | `studio.sections/lessons.*`, `media.*` | 2 |
| `/teach/courses/[id]/pricing` | D | Free/paid, price, compare-at, refund policy (none/3/7/14 with explanation of consumption rules), subscription opt-in (hidden until Phase 12). | Price increase > 50% → "requires review" note | | 2 |
| `/teach/courses/[id]/certificate` | D | Mode (none/completion/exam/external), exam picker, "also finish every lesson" (exam), external provider name + URL, preview certificate PDF (sample). External mode: record pass/fail per learner with score, results link and evidence file; list of recorded results. Issued certificates with search and revoke (reason). Rule changes on a published course go live after review. | No exam lesson yet (exam mode) → link to Curriculum; none issued yet | `studio.certificates.*` | 7 |
| `/teach/courses/[id]/drip` | D | Drip mode, per-lesson offsets/dates table. | Applies live without review; TAs see it read-only | `studio.drip.*` | 5 |
| `/teach/courses/[id]/cohorts` | D | Cohort runs list, create/edit (dates, capacity, windows, schedule). | | `studio.cohorts.*` | 8 |
| `/teach/courses/[id]/assessments` | D | Three views: quizzes and exams (builder: kind, time limit, attempts, cooldown, pass mark, shuffling, when answers show, exam options, fixed questions or bank draws by tag), assignments (builder: brief, hand-in types, file limits, rubric or plain score, pass mark, due days, late policy, resubmissions), question banks (questions of all six types with answer keys). `?quiz=`, `?assignment=`, `?bank=` open one item; the lesson drawer links there. | No quizzes/assignments/banks yet → how to add one; quiz with no questions flagged | `studio.questionBanks/questions/quizzes/assignments.*` | 6 |
| `/teach/courses/[id]/staff` | D | TAs list, invite, remove. | | | 2 |
| `/teach/courses/[id]/publish` | D | Checklist (cover, ≥ 1 preview, description length, all videos ready, pricing, refund policy), submit for review, review history with reviewer notes. | Changes requested → notes highlighted | `studio.courses.submit` | 2 |
| `/teach/courses/[id]/learners` | D | Learners (display name, enrolled date, progress, last active, cohort), filter, message cohort (announcement). No emails shown. | | `studio.learners.list` | 5 |
| `/teach/bundles`, `/teach/bundles/new`, `/teach/bundles/[id]` | D | List + editor (courses, price, draft/active). | | `studio.bundles.*` | 2 |
| `/teach/coupons` | D | Coupons table + create dialog (code, type, value, scope, limits, dates), usage stats. | | `studio.coupons.*` | 4 |
| `/teach/referrals` | D | Links per course/profile with copy button, clicks, sales, revenue share explanation (you keep 97%). | | `referrals.*` | 4 |
| `/teach/grading` | D | Queue: assignment, learner, submitted, late flag, status; grading view (submission, files preview/download, rubric scoring, feedback, return/grade); flagged exam attempts tab (void with reason). Grading view at `/teach/grading/[submissionId]`, attempt review at `/teach/grading/attempts/[attemptId]`. Open to the course's TAs as well as instructors. | Empty queue; already graded (shows the grade) | `grading.*` | 6 |
| `/teach/qa` | D | Unanswered questions across courses, answer inline. | | `community.*` | 8 |
| `/teach/live` | D | Upcoming/past sessions, schedule new, start (owner token), attendance, recordings. | | `studio.live.*` | 8 |
| `/teach/analytics` | D/C | Date range; revenue, enrollments, refunds, traffic sources; per course: completion funnel, lesson drop-off chart, quiz pass rates, ratings. | Not enough data | `analytics.*` | 10 |
| `/teach/earnings` | D | Balances: pending (next release dates), available, in transit, paid this year; next payout date; line items table (sale, refund, release, payout) with filters + CSV; statements (PDF per month); payout account status. | KYC/bank/2FA missing → blocking banner explaining what to fix | `earnings.*` | 10 |
| `/teach/settings` | D | Public instructor profile (slug, display name, photo, bio), payout account (change requires 2FA; shows 72 h hold note), tax info placeholder. | | `payoutAccounts.*` | 2/10 |

## 6. Admin back office (`/admin/*`)

Left nav by role. Every destructive or money action: confirm dialog with reason field → audit log.

| Route | Roles | Content | Ph |
|-------|-------|---------|----|
| `/admin` | staff | KPIs (today/7d/30d): orders, GMV, platform revenue, refunds rate, failed payments, new instructors, active learners; alerts (ledger integrity, stuck jobs, video failures). | 10 |
| `/admin/users`, `/admin/users/[id]` | support+ | Search; detail: profile, roles (admin edits), sessions, orders, enrollments, refunds, certificates, audit trail; actions: ban/unban, revoke sessions, impersonate (read-only), grant enrollment, resend receipt. | 1/10 |
| `/admin/instructors/applications`, `/[id]` | reviewer+ | Queue with filters; detail: answers, sample, KYC result (status, score, matched name — no ID numbers), bank name match; approve/reject/request info. | 2 |
| `/admin/instructors`, `/[id]` | reviewer+ | Instructor list; detail: courses, earnings summary, strikes, commission override (super admin), suspend. | 10 (Phase 2 ships the applications queue; the instructor list needs earnings and strikes, ADR-031) |
| `/admin/reviews/courses`, `/[revisionId]` | reviewer+ | Course review queue; detail: revision diff, content preview (all lessons watchable), checklist, approve/request changes with notes. | 2 |
| `/admin/courses` | reviewer+ | All courses, status filters, feature on home, unpublish with reason. | 3 |
| `/admin/orders`, `/[id]` | finance, support | Orders search (public id, email, Paystack ref); detail with items, ledger entries, Paystack verify button (re-check). | 4 |
| `/admin/refunds`, `/[id]` | finance | Queue (under review, appeals); detail: eligibility snapshot, consumption evidence timeline, decide. | 10 |
| `/admin/payouts`, `/[runId]` | finance | Runs list; run detail: items, anomalies, approve (2FA), co-sign, retry failed, export. | 10 |
| `/admin/ledger` | finance | Accounts with balances; entries explorer (filters by kind, ref, account, date); entry detail with lines. Read-only. Integrity report. | 4/10 |
| `/admin/coupons` | admin | Platform coupons CRUD + all coupons overview. | 4 |
| `/admin/moderation` | support+ | Reports queue (threads, posts, reviews, courses), actions (hide, lock, warn, suspend). | 8/9 |
| `/admin/certificates` | support+ (revoke/restore: admin) | Search by code, email or name; revoke/restore with reason (audit-logged). | 7 |
| `/admin/settings/commission` | super admin | Default rules per source, instructor overrides, promo rules with dates; change preview ("applies to orders from now on"). | 4 |
| `/admin/settings/platform` | super admin | Refund threshold, payout min/day, co-sign threshold, fee bearer, review eligibility, limits (upload size, live max duration). | 4/10 |
| `/admin/settings/flags` | admin | Feature flags. | 0 |
| `/admin/categories` | admin | Category tree CRUD, ordering. | 3 |
| `/admin/audit` | admin | Audit log search. | 1 |
| `/admin/jobs` | admin | Links/status summary for Inngest failures, outbox backlog. | 10 |
| `/styleguide` | staff (and dev) | Tokens and components. | 0 |

## 7. System pages

`not-found.tsx` (global + per segment), `error.tsx` per segment, `global-error.tsx`, maintenance
page (feature flag `maintenance_mode` → `proxy.ts` rewrite for non-staff), `opengraph-image`
routes for course, instructor, certificate, home.

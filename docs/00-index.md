# Tokslearn Guides — Index and How to Use Them

## How to use these guides with Claude Code

1. Copy this whole folder into the root of an empty repo. `CLAUDE.md` must sit at the repo root
   (Claude Code loads it automatically). If you also use other agents, symlink `AGENTS.md → CLAUDE.md`.
2. Install the skills listed in `docs/18-skills-setup.md` (project scope, committed to the repo).
3. Start a Claude Code session and give it the prompt at the top of the current phase file,
   e.g. `docs/phases/phase-00-foundations.md`.
4. Work one phase at a time. Each phase ends with an acceptance checklist. Tick it in the file,
   commit, then move on.
5. When something changes (a decision, a price, a library version), update the guide first, then
   the code. The guides are living documents.

## Reading order for a new contributor (human or agent)

| # | File | Read when |
|---|------|-----------|
| 1 | `01-product-spec.md` | Always first. What we are building and for whom. |
| 2 | `02-decisions.md` | Before changing anything structural. |
| 3 | `03-architecture.md` | Before creating any file. |
| 4 | `04-tech-stack.md` | Before adding a dependency. |
| 5 | `05-database.md` | Before touching schema or queries. |
| 6 | `06-api-design.md` | Before adding any procedure or mutation. |
| 7 | `07-auth-and-permissions.md` | Anything with users, roles, KYC. |
| 8 | `08-payments-ledger-payouts.md` | Checkout, refunds, commission, payouts. |
| 9 | `09-video-and-media.md` | Uploads, playback, progress, DRM. |
| 10 | `10-learning-features.md` | Courses, quizzes, exams, assignments, cohorts, live, certificates. |
| 11 | `11-design-system.md` | Any UI or copy. |
| 12 | `12-performance-and-seo.md` | Any public page, any new route. |
| 13 | `13-jobs-and-notifications.md` | Async work, email, push. |
| 14 | `14-security-and-compliance.md` | Always, especially auth, payments, personal data. |
| 15 | `15-testing-and-quality.md` | Every task. |
| 16 | `16-deployment-and-ops.md` | CI/CD, environments, monitoring, costs. |
| 17 | `17-mobile-readiness.md` | Every API change; Phase 14. |
| 18 | `18-skills-setup.md` | Setup; when doing UI or reviews. |
| 19 | `19-concerns-and-risks.md` | Planning, scope decisions. |
| 20 | `20-screen-inventory.md` | Before building any page. Authoritative list of screens, contents and states. |
| 21 | `21-error-codes.md` | Before adding or handling any error. |
| 22 | `22-environment.md` + `/.env.example` | Setup; adding any env var or provider account. |
| 23 | `23-email-catalog.md` | Any email. |
| 24 | `24-analytics-events.md` | Any tracked user action. |
| 25 | `25-content-policy.md` | Course review, moderation, instructor-facing rules. |

## Phases

| Phase | File | Outcome |
|-------|------|---------|
| 0 | `phases/phase-00-foundations.md` | Monorepo, tooling, CI, DB, design tokens, empty app deployed |
| 1 | `phases/phase-01-auth-and-accounts.md` | Sign up/in, roles, profiles, sessions for web + bearer for mobile |
| 2 | `phases/phase-02-instructors-and-authoring.md` | Instructor application + KYC, course builder, video upload |
| 3 | `phases/phase-03-catalog-and-discovery.md` | Public catalog, course pages, search, SEO |
| 4 | `phases/phase-04-commerce-and-ledger.md` | Cart, checkout, enrollments, coupons, referrals, commission, ledger |
| 5 | `phases/phase-05-learning-experience.md` | Player, progress, drip, notes, bookmarks, streaks |
| 6 | `phases/phase-06-assessments.md` | Quizzes, certification exams, assignments + grading |
| 7 | `phases/phase-07-certificates.md` | Certificates, verification pages, external exams |
| 8 | `phases/phase-08-cohorts-community-live.md` | Cohorts, discussions, Q&A, announcements, Daily live classes |
| 9 | `phases/phase-09-engagement.md` | Reviews, wishlist, badges, notifications centre |
| 10 | `phases/phase-10-refunds-payouts-admin.md` | Refund engine, monthly payouts, statements, admin back office |
| 11 | `phases/phase-11-hardening-and-launch.md` | Perf, security, load tests, launch |
| 12+ | `phases/phase-12-plus-roadmap.md` | Subscriptions pool, B2B seats, mobile app, DRM + offline |

**Launch gate:** phases 0–7 + 10 + 11 are the minimum public launch. Phases 8 and 9 can ship
right after launch if time runs out. See `19-concerns-and-risks.md`.

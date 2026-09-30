# 15 — Testing and Quality

## 1. Test pyramid

| Layer | Tool | Where | What |
|-------|------|-------|------|
| Unit | Vitest | `packages/core/**/*.test.ts` | Rules, pricing, allocation, eligibility, grading, drip, streaks — pure functions, no DB |
| Integration | Vitest + real Postgres | `packages/core/**/*.int.test.ts` | Services with DB: checkout completion, ledger, refunds, payouts, access checks, IDOR |
| API contract | Vitest | `packages/api/**/*.test.ts` | Procedures return contract-valid outputs; error codes; auth levels |
| E2E | Playwright | `apps/web/e2e/` | Critical journeys on a preview deploy |
| Visual/UX | Playwright screenshots + Lighthouse CI | CI | Key pages at 360/768/1280 |
| Load | k6 | `load/` | Before launch and before big campaigns |

Integration DB: Docker Postgres locally (`docker compose up db`), a fresh schema per test file
(migrate once, wrap each test in a transaction rolled back at the end). CI uses a Postgres service container.

External providers are behind interfaces in `packages/integrations` with **fake implementations**
for tests (fake Paystack that can simulate success, failure, amount mismatch, webhook replay).

## 2. Must-have tests

- Money: see `08 §12`.
- Access: non-enrolled user cannot get playback token, resource URL, quiz questions, assignment files.
- Exams: answers never present in any client payload (snapshot-test DTOs); late submission rejected; one in-progress attempt.
- Certificates: issued exactly once; revoked shows on verify page.
- Mobile parity: a script lists every mutation used by the web app (grep `mutationOptions`) and asserts each exists in the contract's OpenAPI spec.

## 3. E2E journeys (Playwright)

1. Visitor → browse → course page → sign up → buy (Paystack test mode) → lesson plays → progress saved.
2. Free course enroll → complete → certificate → verify page.
3. Instructor apply → (admin approves with seeded KYC) → create course → upload (fake/short video) → submit → reviewer approves → course visible.
4. Refund within policy → approved → access revoked.
5. Exam: start → timer → submit → pass → certificate.
6. Assignment: submit → TA grades → learner sees grade.

## 4. Quality gates in CI (every PR)

`pnpm install --frozen-lockfile` → `turbo run typecheck lint test` → `drizzle-kit check` (migrations
consistent) → build → deploy preview → Playwright smoke on preview → Lighthouse CI on public routes →
bundle size check (`size-limit` or Next build output parser) → copy check (banned words).

Merge blocked if any gate fails.

## 5. Load testing (k6)

Scenarios (run against staging with production-like data volume — seed 50k users, 500 courses, 2M progress rows):
- Browse: 2,000 VUs hitting catalog/course pages (mostly cached).
- Learn: 5,000 VUs sending heartbeats every 20 s + lesson navigation.
- Exam spike: 3,000 VUs starting an exam within 60 s, autosaving answers, submitting within 5 min.
- Checkout: 200 concurrent checkouts with fake Paystack.
Targets: error rate < 0.1%, p95 < 500 ms for API, DB CPU < 70%, no connection exhaustion.

Scripts live in `load/`. `load/exam-spike.js` is the Phase 6 exam spike (500 learners by default): `seed:load-exam` in `packages/core` creates the learners and gives them sessions, which k6 sends as bearer tokens, since 500 sign-ins from one machine would hit the sign-in limit. Run it against a preview deployment and its database, never production.

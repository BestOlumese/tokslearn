# 02 — Decision Log (ADRs)

Every structural decision is recorded here. Format: context → decision → consequences.
Add new ADRs at the bottom with the next number. Never delete an ADR; supersede it.

---

### ADR-001 Modular monolith in a Turborepo monorepo
- **Context:** One developer, 3–4 month runway, 100k+ users target, mobile later.
- **Decision:** Single deployable Next.js app + shared packages. Domain modules with strict boundaries in `packages/core`.
- **Consequences:** One deploy, one database, simple transactions (critical for the ledger). A module can be extracted later if it needs independent scaling (candidates: grading/code execution, analytics ingestion).

### ADR-002 Business model: instructor marketplace
- Instructors apply, pass KYC (BVN/NIN via Dojah), and each course is reviewed before publishing.

### ADR-003 Payouts: internal double-entry ledger + monthly payouts
- Sale → pending earning. Pending → available when the course's refund window closes (or immediately when a consumption rule makes the sale non-refundable). Monthly payout run pays available balance via Paystack bulk transfer above a minimum (default ₦5,000).
- **Legal check required before launch:** holding third-party funds may carry regulatory obligations in Nigeria. Confirm with a lawyer / Paystack. The ledger design works either way.

### ADR-004 Refund policy set per course, bounded by platform
- Options: none, 3, 7, 14 days. Automatic blocking when learner watched > 30% (configurable), downloaded any `important` resource, received a certificate, or started the final exam. All consumption events are logged as evidence.

### ADR-005 Commission by traffic source, adjustable
- Defaults stored in DB (not code): instructor referral/coupon traffic, platform organic, platform paid ads. Per-instructor overrides and time-boxed promo rates. The rate applied is snapshotted on each order item. Changing rates never rewrites history.

### ADR-006 Subscriptions later, via watch-time pool; instructors opt in per course
- Phase 12. A configurable share of net subscription revenue forms a monthly pool, split by each opted-in course's share of engaged minutes.

### ADR-007 Exams: built-in timed exams; high-stakes via external link
- No webcam proctoring. Built-in anti-cheat basics. External exams recorded by instructor.

### ADR-008 Live classes via Daily
- 10,000 free participant-minutes/month then pay-as-you-go. Revisit LiveKit if usage passes ~500k participant-minutes/month.

### ADR-009 Video: Bunny Stream, DRM phased
- Launch with token-authenticated playback, referrer/domain lock, visible watermark (learner email/ID overlay). MediaCage Enterprise DRM (~$99/mo + per-licence) and offline downloads arrive with the mobile app (Phase 15). Schema supports DRM flags from day one.

### ADR-010 API: oRPC v1 with RPC + OpenAPI handlers
- **Context:** Web and a future Expo app need the same typed API; third parties may need REST.
- **Decision:** Contract-first oRPC in `packages/contract`. `/api/rpc` for first-party clients (web + mobile, typed client), `/api/v1` OpenAPI handler for REST + generated spec.
- **Consequences:** Mobile imports only the contract. Server Actions are not used for business mutations. oRPC v2 is in beta as of Sept 2026 — stay on v1 until v2 is stable, then upgrade with an ADR.

### ADR-011 Database: Neon Postgres + Drizzle, WebSocket pool driver
- Ledger and checkout need interactive transactions, so the app uses the `neon-serverless` Pool driver (not HTTP-only). Region: AWS eu-central-1 (Frankfurt), co-located with Vercel `fra1`.

### ADR-012 Hosting: Vercel Pro
- Hobby plan forbids commercial use. Pro ($20/seat) is the baseline. Revisit Cloudflare (OpenNext/vinext) or a container host if monthly Vercel spend exceeds ~$150 consistently.

### ADR-013 Design: light theme only, clean and professional, anti-generic
- See `11-design-system.md`. No dark mode tokens are shipped. Brand name: **Tokslearn**.

### ADR-014 Launch market: Nigeria, NGN only
- Currency column exists everywhere; UI shows NGN. Multi-currency is Phase 16.

### ADR-015 Budget: lean (< $100/month at launch)
- Prefer free tiers with clean upgrade paths. Track spend monthly (see `16-deployment-and-ops.md#costs`).

### ADR-016 Mobile scope: learner-only app with push; offline downloads with DRM phase
- Instructors and admins use the web app.

---

### ADR-017 Commission defaults confirmed (resolves Q1)
- Platform share: instructor_referral 3%, instructor_coupon 3%, platform_organic 40%, platform_paid 50%. Seeded as `default` commission rules; still editable by super admin.

### ADR-018 Refund consumption threshold 30% (resolves Q3)
- Setting `refund_consumption_threshold_pct = 30`.

### ADR-019 Payouts: minimum ₦5,000, paid on the 5th (resolves Q4)
- Draft run created on the 1st; finance reviews and approves by the 4th; transfers sent on the 5th (next business day if the 5th is a weekend or public holiday). Settings `min_payout_kobo = 500000`, `payout_day = 5`.

### ADR-020 Platform absorbs Paystack fees lost on refunds (resolves Q5)
- Instructor balance returns to ₦0 on a refunded sale, never negative (see `08 §5` refund example).

---

### ADR-021 Pinned versions (Phase 0, 2026-09-25)
- **Context:** `docs/04` asks for the latest stable release of each library, recorded here. A supply-chain rule was added at the same time: pnpm `minimumReleaseAge: 1440` refuses packages published less than 24 h ago, and Renovate waits 3 days.
- **Decision:** exact versions (no ranges) in every `package.json`:

| Area | Package | Version |
|------|---------|---------|
| Runtime | Node.js (`.nvmrc`, `engines`) | 24.x (dev: 24.18.1) |
| Monorepo | pnpm / turbo | 12.6.0 / 2.11.3 |
| Language | typescript | **6.0.3** (see below) |
| Lint/format | @biomejs/biome | 2.5.14 |
| Web | next / react / react-dom | 16.3.6 / 19.3.0 / 19.3.0 |
| Web | babel-plugin-react-compiler | 1.0.0 |
| Styling | tailwindcss / @tailwindcss/postcss | 4.3.3 / 4.3.3 |
| UI | radix-ui / lucide-react / sonner / clsx | 1.6.7 / 1.48.0 / 2.0.8 / 2.1.1 |
| API | @orpc/* (server, contract, client, openapi, zod, tanstack-query) | 1.15.4 |
| Client data | @tanstack/react-query | 5.103.2 |
| Validation | zod | 4.6.5 |
| DB | drizzle-orm / drizzle-kit | 0.45.3 / 0.31.11 (1.0 is still RC) |
| DB | @neondatabase/serverless / pg / uuidv7 | 1.1.0 / 8.23.0 / 1.2.1 |
| Cache | @upstash/redis / @upstash/ratelimit | 1.39.0 / 2.2.0 |
| Jobs | inngest | 4.21.0 (v4 API: triggers in options, `eventType()` schemas) |
| Env | @t3-oss/env-nextjs | 0.13.11 |
| Tests | vitest / vite / @playwright/test | 5.0.1 / 8.3.1 / 1.63.0 |
| Observability | @sentry/nextjs | **10.75.3** (see below) |
| Analytics | posthog-js / posthog-node | 1.434.12 / 5.53.0 |
| Build | tsup / tsx | 8.5.1 / 4.23.15 |

- **Deviations from "latest":**
  - **TypeScript 6.0.3, not 7.0.2.** TypeScript 7 (Go port, GA July 2026) ships no JavaScript compiler API. Next.js's build-time type check, tsup's `.d.ts` build and drizzle-kit still need it. Revisit when TS 7.1 ships the new API and Next's `useTypeScriptCli` is stable. Renovate blocks TS majors until then.
  - **@sentry/nextjs 10.75.3, not 11.0.0.** v11 is a new major released two days before setup. Upgrade after it settles, with a quick check of `instrumentation.ts`.
  - **React 19.3.0.** CLAUDE.md says "React 19.2"; 19.3 is the current minor of the same line, required by nothing but compatible with Next 16.3.
  - turbo, vitest and posthog-node are one patch behind latest because of the 24 h release-age rule.
- **Consequences:** upgrades go through Renovate PRs (weekly, grouped). oRPC and TypeScript majors need a new ADR.

### ADR-022 Core kernel and platform tables in `admin`
- **Context:** Phase 0 needs shared plumbing (Ctx, Actor, errors, outbox emitter, cache adapter, clock, money) that is not a domain module, and the platform tables (`settings`, `feature_flags`, `outbox`, `idempotency_keys`, `audit_log`) need an owner.
- **Decision:** `packages/core/src/kernel` holds shared plumbing and is exported as `@tokslearn/core/kernel`. Domain modules may import kernel files relatively; they reach other modules only through `@tokslearn/core/<module>` (enforced by `scripts/check-imports.mjs`). The `admin` module owns the platform tables and exposes feature flags, settings, audit writes, idempotency keys, outbox dispatch and the health check.
- **Consequences:** one place for infrastructure; the API layer never touches tables directly (idempotency middleware calls `admin.claimIdempotencyKey`).

### ADR-023 Two Postgres drivers behind one `Db` type
- **Context:** ADR-011 picks the Neon WebSocket `Pool`. Integration tests and offline dev use plain Postgres (Docker), which the Neon driver cannot talk to.
- **Decision:** `createDb(url)` uses `drizzle-orm/neon-serverless` for `*.neon.tech` hosts and `drizzle-orm/node-postgres` otherwise. Both return the same Drizzle Postgres API (`Db = PgDatabase<…>`); migrations always run over a direct TCP connection with node-postgres.
- **Consequences:** tests run against real Postgres 17 locally and in CI; production behaviour is unchanged.

### ADR-024 Outbox delivery leases rows instead of holding a transaction
- **Context:** `docs/05 §3.6` forbids network calls inside DB transactions, but outbox rows must not be sent twice by parallel sweepers.
- **Decision:** the dispatcher locks due rows with `FOR UPDATE SKIP LOCKED`, pushes their `available_at` 5 minutes ahead and increments `attempts` in a short transaction, sends outside it, then marks them `sent`. After 10 failed attempts a row becomes `failed`. The outbox row id is the Inngest event id, so a re-send after a crash is deduplicated by Inngest.
- **Consequences:** at-least-once delivery with dedupe; handlers stay idempotent per `docs/13 §1`.

### ADR-025 Lean UI primitives for the JS budget
- **Context:** public pages have a strict JS budget (`docs/12 §1`).
- **Decision:** checkbox, radio, switch and select are styled native controls (no JS). `cn()` is `clsx` only; tailwind-merge (11 KB gzipped) is not used, so components expose variant props and callers' `className` only adds layout. The toast region mounts after idle. Radix is used only where behaviour is non-trivial (dialog, sheet, popover, tooltip, tabs). The consent banner is server-rendered and hidden by CSS once a choice exists (a pre-paint script sets `<html data-consent>`), so it never delays LCP.
- **Consequences:** Lighthouse mobile 99–100 on public routes. A custom listbox can be added later where options need rich content.

---

## Open questions (resolve before the phase that needs them)

| # | Question | Needed by |
|---|----------|-----------|
| Q2 | Legal review of holding funds + terms of service + instructor agreement | Phase 10 / launch |
| Q6 | VAT handling on platform commission (7.5%) — confirm with accountant | Phase 4 |
| Q7 | First-load JS budget: 120 KB gzipped (`docs/12 §1`) is below the Next.js 16 + React 19 runtime alone (~130 KB gzipped, ~121 KB brotli as served by Vercel). Raise the gzip budget, or measure brotli? | Phase 0 sign-off |

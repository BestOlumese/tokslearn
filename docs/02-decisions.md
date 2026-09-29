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

### ADR-026 Public first-load JS budget raised to 145 KB gzipped (resolves Q7)
- **Context:** `docs/12 §1` set 120 KB gzipped for public pages. The Next.js 16 + React 19 runtime alone is ~130 KB gzipped (~121 KB brotli, which Vercel serves). The Phase 0 home page loads 140.5 KB, of which ~10 KB is our code.
- **Decision:** the budget is 145 KB gzipped per public route, measured by `scripts/check-bundle-size.mjs` on the production build with `noModule` polyfills excluded. Lighthouse (≥ 95 performance, LCP < 2.0 s) stays the user-facing check.
- **Consequences:** ~4.5 KB of headroom today. Anything new on public pages (search box, wishlist heart, cart) must stay small or load after interaction; a failing bundle check blocks merge. `CLAUDE.md §1.7` still says 120 KB and needs the same edit (the file is read-only to the agent).

### ADR-027 Browser Sentry loads on the first error only
- **Context:** On the first production deploy, loading the Sentry browser SDK on idle added a 162 KB chunk and a ~380 ms long task to every public page (Lighthouse mobile performance 87–91, TBT ~450 ms).
- **Decision:** `instrumentation-client.ts` only attaches `error` / `unhandledrejection` listeners. `lib/report-client-error.ts` downloads and initialises Sentry the first time an error is reported (also called from `error.tsx` and `global-error.tsx`). Sentry's own global handlers are disabled to avoid double reports. Browser tracing is off; page speed comes from Lighthouse CI and PostHog/Vercel.
- **Consequences:** zero Sentry cost on healthy page loads (measured: perf 99, TBT 70 ms with a DSN set). Browser errors still reach Sentry, without breadcrumbs from before the error. Server-side Sentry is unchanged.

### ADR-028 Emails carrying sign-in secrets skip the outbox
- **Context:** `docs/23` sends every email through the `email-send` job, and core queues emails through the outbox (`notifications.sendEmail`). Verification links, reset links and sign-in codes would then be stored in our `outbox` table.
- **Decision:** the auth layer sends those emails straight to Inngest (`auth/email.requested`), which triggers the same `email-send` job. Everything else (deletion notice, new sign-in, receipts later) goes through the outbox. Both paths use `{id}:{businessKey}` idempotency keys, and Resend receives the same key.
- **Consequences:** secrets never sit in our database. If Inngest is unreachable at that moment the email is lost, and the user presses "resend"; the auth response itself never fails because of email.

### ADR-029 Better Auth integration choices (Phase 1)
- **Sessions:** stored in Postgres and cached in Upstash (`storeSessionInDatabase`), so the sessions page, admin tools and IDOR checks can read them. Revocation goes through Better Auth's internal adapter (clears both).
- **Cookie cache bypassed for the actor:** API and page requests call `getSession` with `disableCookieCache`, so a revoked or suspended session stops at once instead of within 5 minutes. The lookup hits Redis; we already query Postgres for roles on each request.
- **Admin plugin endpoints disabled** (`disabledPaths`): the plugin stays for ban enforcement at sign-in and its schema fields, but all staff actions go through core services, which require 2FA verified in the session and write the audit log. Impersonation returns in Phase 10 with its own audited flow.
- **Breached-password check fails open:** our own before-hook calls Have I Been Pwned (k-anonymity) with a 3 s timeout for sign-up, password change and reset. Compromised passwords are rejected; if the service is down the check is skipped and logged. The stock plugin returned 500 and blocked sign-up during an outage.
- **Staff 2FA and step-up** read `session.two_factor_verified_at`, set by an after-hook when a TOTP or backup-code check passes. Staff who sign in with an email code must still enter an authenticator code before admin tools open.
- **Auth pages use `fetch`, not the Better Auth client SDK,** and Google sign-in is a plain link to `/api/auth-start/google`. Together with a Zod-free message module this keeps every auth page under the 145 KB budget (ADR-026).
- **Signed-in header on static pages** comes from a non-secret `tl_signed_in` cookie set at sign-in and cleared at sign-out. It only switches header links; it is never used for authorization.
- **Account lockout:** 10 failed passwords in 15 minutes locks that email for 15 minutes, doubling per further lock within a day (max 24 h). Keys store a hash of the email.

### ADR-030 Course authoring storage (Phase 2)
- **Metadata and settings in revisions, structure in place.** Title, subtitle, description, outcomes, requirements, cover, promo video and the settings the review rules look at (category, level, language, price, compare-at price, refund policy, certificate mode) live on `course_revisions`. The studio edits the draft revision; approval copies the settings onto the course row, which the catalog reads. A price increase over 50% therefore waits in the draft until a reviewer approves it. Sections and lessons are edited in place.
- **After the first publish,** new sections and lessons are created with `live_since` null and stay hidden from learners until a review approves them; removing a live one sets `removal_requested_at` and takes effect on approval. Edits to existing live lessons (title, article, video) apply at once and appear in the next revision's snapshot diff. Full snapshot-based structural editing (docs/10 §1) was judged too heavy for v1; revisit if reviewers report abuse.
- **Autosave conflicts** use an integer `courses.version` bumped on every studio write, not `updated_at`: Postgres keeps microseconds and JavaScript dates only milliseconds, so a round-tripped timestamp does not compare equal.
- **Webhooks other than payments** (Bunny, Dojah, Daily) are recorded in `webhook_events` (unique per provider + event id) for idempotency; Paystack keeps `payment_events` (Phase 4). Bunny sends no event id, so ours is `{videoGuid}:{status}`; the handler re-reads the video from Bunny before acting.

### ADR-031 Phase 2 scope choices
- **Dojah through its synchronous API, not the widget.** `POST /api/v1/kyc/{bvn|nin}/verify` with a selfie returns the result in the same request, so there is no Dojah webhook to handle. Our own camera capture sends the photo once; the response is reduced to names and the match score before it leaves the client (no ID number, phone, date of birth or photo is kept). Selfie confidence under 80, or a registered name that doesn't match the account name, goes to manual review, which the reviewer settles when deciding the application.
- **First payout account needs no step-up; replacing it does.** Onboarding shouldn't require 2FA before the applicant is even approved. Replacing an account needs 2FA verified in the last 12 hours, starts a 72-hour payout hold and emails a security notice. A Paystack transfer recipient is created even when the name needs manual review, because we never keep the full account number to create it later; the account status is what gates payouts.
- **`/teach` stays the public landing page.** The studio opens at `/teach/courses`. The instructor dashboard (docs/20) moves to `/teach/dashboard` in Phase 10, when there are sales and ratings to show. `/admin/instructors` (list and detail) moves to Phase 10 for the same reason; Phase 2 ships the applications queue.
- **Reviewer decisions are approve or request changes.** Rejecting a course for a policy violation (docs/25 §B) arrives with moderation and strikes (Phases 8–9); until then reviewers request changes and cite the rule number.
- **Rich text is editor JSON.** The contract accepts only the node and mark types the server renders; the server builds `*_html` from an allowlist with escaped text and http(s)/mailto links only. No HTML from the browser is stored.
- **Video uploads:** tus-js-client straight to Bunny with signed headers valid for 24 hours, 8 MB chunks and retries. A new upload always creates a new Bunny video (no cross-session resume), because each signature is bound to one video id.

### ADR-032 Catalog delivery (Phase 3)
- **Search index updated inline, not by a job.** `course_search` is rewritten inside the approval, unpublish, restore and slug-change transactions (`reindexCourse`). A reviewer's approval and the index can't disagree, and there is no queue lag to explain to instructors. Every deploy (and CI, before its build) runs `pnpm db:reindex`, which indexes live courses missing from the index, such as those published in Phase 2. Revisit if approvals start timing out.
- **Search:** weighted full-text (title A; subtitle, tags, instructor B; description and outcomes C) first, then `pg_trgm` `word_similarity > 0.35` on the normalised title plus tags for typos. Ties go to the course whose own title is closer. Offset paging, capped at 96 results; browsing uses keyset cursors per sort.
- **Cache tags:** `course:{id}`, `course-slug:{slug}` and `instructor:{id}` expire at once (`{ expire: 0 }`) so a published change shows on the next visit; `catalog` (home rows, listings, counts, sitemaps) is stale-while-revalidate. Measured: an approved subtitle fix is live within 5 seconds (e2e/catalog-publish.spec.ts).
- **Prerendering:** the 200 most popular courses and every instructor with a live course are built statically; others serve the app shell and fill in on first visit. Old slugs redirect with an instant meta refresh and client redirect (the redirect happens inside a streamed boundary, so the status is already 200). Google treats this as a permanent redirect; a real 308 would need a database lookup in the proxy for every course URL.
- **Plain `/courses` is fully static.** Reading the query string made the whole listing a streamed hole: on the Phase 4 preview the first cover waited ~1 s to be discovered and ~1 s more to be revealed (LCP 2.0–2.8 s). `proxy.ts` now rewrites only `/courses?…` (filters, sort, pages) to `/course-results`, which reads the query; the unfiltered page ships its grid in the HTML. `/course-results` is noindex with a canonical of `/courses`.
- **Metadata is never streamed** (`htmlLimitedBots: /.*/`). Link previews in WhatsApp, Telegram and LinkedIn, and audits, read only `<head>`; our `generateMetadata` reads cached data, so blocking costs milliseconds.
- **Public pages ship almost no JS of their own.** Filters are a GET form, mobile filters a `<details>`, curriculum sections `<details>`, paging plain links. Covers and avatars are a plain `<img>` whose `src`/`srcset` point at `/_next/image` (lib/image.ts): Vercel resizes to WebP and caches for a month, with no next/image client JS (~5 KB). Uploads are often 2–3 MB PNGs; the first preview run measured a 5.4 s LCP on `/courses` from one 505 KB cover. Resized, that cover is 5–12 KB and the avatar 846 bytes. Only our CDN origin and the configured widths are accepted. If Vercel's image quota becomes a cost, resize at upload instead. The public bucket should move from `r2.dev` (rate-limited, slow first fetch) to `cdn.tokslearn.com` before launch. Analytics is one ~0.5 KB island per page with a delegated click listener reading `data-track`. Catalog pages measure 142.5–144.0 KB of the 145 KB budget.
- **Browser error reporting skips React #419** (a streamed boundary that ended in notFound/redirect). Unknown slugs produce it on every visit; real server errors are reported by server-side Sentry. The Sentry SDK and its setup load only after the first real error.
- **Share images** are drawn by `next/og` with its bundled font, which has no ₦ glyph; prices there read "NGN 15,000".
- **Local demo catalog:** `pnpm db:seed:demo-catalog` publishes ten courses through the real services with fake storage and video providers. It refuses production.

### ADR-033 Commerce, ledger and enrollments (Phase 4)
- **Money:** integer kobo everywhere; `allocate()` (largest remainder) for bundles, coupon discounts and the Paystack fee; `splitBps()` for commission. Property tests (fast-check) prove parts always sum to the whole. Money code must stay at ≥ 95% line and function coverage (`pnpm --filter @tokslearn/core test:money`, run in CI).
- **Ledger:** `ledger.post()` is the only writer. It rejects unbalanced or unknown lines, is idempotent per key even under concurrent calls (insert … on conflict do nothing), and locks balances in account-id order. Journal rows are append-only by database trigger. The integrity check runs nightly and is shown on `/admin/ledger`. Tests that need real concurrency commit to the test database and empty it afterwards (`resetTestDb`, TRUNCATE).
- **Pricing (pure, server-side):** bundles split by course list price; one coupon per order. Instructor coupons only touch their own courses, and all of that instructor's lines count as `instructor_coupon`. A referral counts only for the instructor who owns the link, as the last touch within 30 days. Commission resolves promo → instructor override → default. The client sends only the total it saw; any difference is `CART_CHANGED`.
- **Attribution is stored on our side.** `/r/{code}` records the visit against a random `tl_aid` browser id (HttpOnly). No cookie carries the attribution itself, so it can't be forged to move an instructor to 97%. Paid-campaign landings (`platform_paid`) are supported by pricing and `recordPaidLanding`, but nothing captures them yet: they get wired when Tokslearn runs ads, with a server-signed landing cookie.
- **Commission rules** are never edited in place: a change ends the current row and inserts a new one, and order items keep the rule id and rate they used. A rule can't end the instant it starts, so a same-millisecond change starts 1 ms later.
- **Fees and tax:** the Paystack fee comes from verify's `fees`. It is allocated to lines by net price and, with `gateway_fee_bearer = proportional` (default), split by the commission rate. An instructor's share never goes below zero. VAT on commission (`tax_rules.vatOnCommission`) is **off**. When on, it is carved out of platform revenue into `tax:vat_payable` and the instructor is unaffected. Q6 stays open until the accountant confirms.
- **completeOrder** is the single path from "Paystack says paid" to enrollments, used by confirm, the webhook job, the hourly reconcile and the admin re-check. Paystack is verified outside the transaction, and amount, currency and reference must all match. A mismatch leaves the order pending and logs an error. A late bank transfer completes even an order already marked failed or abandoned. The refund window runs from Paystack's `paid_at`; courses with no refund window release the instructor's earning at once.
- **Free things:** a ₦0 course is enrolled directly (`enrollments.enrollFree`), with no order. A 100% coupon creates a ₦0 order with provider `none` and `coupon_100` enrollments, and no ledger entry.
- **Carts:** signed-in users have one server cart (max 20 items). Visitors keep a browser cart that `cart.preview` prices and that merges on sign-in. Coupons need sign-in (per-user limits).
- **Webhook:** `/api/webhooks/paystack` checks the HMAC signature, records the event once in `payment_events` (the id ends with the order reference, for the admin order page) and hands `charge.success` to the `paystack-charge` job, which re-verifies with Paystack. Other events are recorded and ignored until Phase 10.
- **Public-page JS:** buying uses a small `fetch` helper against `/api/v1`, not the oRPC client. The smallest islands (buy buttons, header cart, tracking) opt out of React Compiler (`'use no memo'`), whose memo cache doubled them. The course page measures 144.9 KB of 145, so any new client code on it needs a matching cut.
- **Deferred:** earnings release cron, payouts and statements (Phase 10); refunds and "Request refund" (Phase 10); the PDF receipt download (Phase 10, with statements); the `new-sale` email digest (Phase 9); client events `cart_item_added/removed` and `wishlist_added/removed` (budget; purchases and enrollments are tracked server-side).

### ADR-034 Learning experience (Phase 5)
- **Who gets in:** `enrollments.lessonAccess` decides everything the player hands out (outline, lesson, signed video, file links, notes). Order: staff roles, the instructor, the course's TAs, an active unexpired enrollment (then drip), free previews, else not enrolled or revoked. Enrolled learners are checked before previews, so their progress on preview lessons counts.
- **Progress is never trusted as sent.** Each beat's watched time is capped at min(60 s, 2 × seconds since the last beat + 5 s); position is capped at the video length. Completion is max(watched, furthest point) ÷ length ≥ the course threshold. A `video_progress` consumption event is written at most every 5 minutes per lesson; once a buyer has watched 30% of the course's video, or downloads an important file, the purchase stops being refundable and the instructor's earning is released (`markPurchaseConsumed`, idempotent per order item).
- **Important downloads ask first.** While a purchase is refundable, `learn.resourceDownload` returns `DOWNLOAD_CONFIRM_REQUIRED` for an important file until the learner confirms. The dialog says plainly that downloading ends the refund right.
- **Drip is scheduling, not content.** `studio.drip.update` writes to the live course and lessons at once, without a review, and bumps the course version like any studio write. A lesson a learner has already started stays open if the date moves later. Free previews are never locked. Cohort-relative drip arrives with cohorts (Phase 8). The `drip-unlocks` job runs at 07:00 Lagos and sends one `lesson-unlocked` email per learner per course for lessons that opened in the previous 24 hours; the first lesson's id is the idempotency key, so a re-run sends nothing new.
- **Activity emails before preferences:** `lesson-unlocked` is an `activity` email, but notification preferences and unsubscribe links arrive in Phase 9. Until then it goes to every enrolled learner of a drip course, which is only instructors who chose drip. Phase 9 must add the preference check to this job.
- **Streaks and badges:** a Lagos day counts at ≥ 1 lesson completed or ≥ 10 minutes learned, counted once per day. One freeze token per 7 days of streak, at most 2, spent by the 00:15 Lagos rollover on a missed day. Badges are evaluated by the `badges-evaluate` job on `lesson.completed`, `course.completed` and `streak.extended` (one run at a time per learner); awarding is insert-if-absent. Badge criteria live in the `badges` table and are re-seeded with reference data on every deploy.
- **Player client:** the video, notes, downloads and shortcuts are separate client islands talking through window events, calling `/api/v1` with plain `fetch` (no oRPC client, no TanStack Query). Bunny's iframe is driven by the player.js postMessage protocol directly (ready, play, pause, timeupdate, ended, setCurrentTime), without the player.js library. Beats go every 20 s while playing, on pause and on end, at least 10 s apart (the heartbeat limit is 6 a minute per user); a failed beat keeps its time for the next one. The page-leave beat uses `fetch` with `keepalive` instead of `navigator.sendBeacon`, because `sendBeacon` can't send a JSON content type. Measured on Moto G4 emulation (4× CPU, slow 4G): worst interaction 80 ms. First-load JS 250 KB gzipped, signed-in only (the 145 KB budget covers public pages).
- **Watermark:** the learner's name and a masked email ("Ch***@gmail.com"), faint, moving between corners every 40 s. It deters casual screen recording; it doesn't stop it. DRM stays off (`drm_required` exists for later).
- **Instructors see learners by first name and last initial** ("Amaka O."), with progress and last activity, never emails.
- **Deferred:** Q&A and announcements tabs (Phase 8), certificates on My learning (Phase 7), notification preferences (Phase 9), start-at-480p on slow connections (Bunny's player picks the rendition; revisit if learners report stalls).

---

## Open questions (resolve before the phase that needs them)

| # | Question | Needed by |
|---|----------|-----------|
| Q2 | Legal review of holding funds + terms of service + instructor agreement | Phase 10 / launch |
| Q6 | VAT handling on platform commission (7.5%) — confirm with accountant | Phase 4 |

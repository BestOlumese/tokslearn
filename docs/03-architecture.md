# 03 — Architecture

## 1. Shape

```
                 ┌──────────────── apps/web (Next.js 16) ────────────────┐
 Browser ───────▶│ Server Components ──▶ packages/core (services)        │
                 │ Client Components ──▶ /api/rpc  ─┐                     │
 Expo app ──────▶│                        /api/v1  ─┼─▶ packages/api ──▶ packages/core
 (Phase 14)      │ /api/auth/* (Better Auth)        │     (oRPC router)       │
 Paystack/Bunny/ │ /api/webhooks/* ─────────────────┘                         ▼
 Daily/Dojah ───▶│ /api/inngest (Inngest)                         packages/db (Drizzle)
                 └────────────────────────────────────────────────────────▶ Neon Postgres
                         │                    │                │
                      Upstash Redis     Cloudflare R2     Bunny Stream / Daily / Paystack
```

Three ways into business logic, one business-logic layer:

1. **Server Components** call `@tokslearn/core` functions directly (no HTTP hop) with a server-side
   `Actor` built from the session.
2. **Client components and the mobile app** call oRPC procedures. Procedures are thin: resolve actor
   → validate input (contract) → call core → map errors.
3. **Webhooks and jobs** call core with a `SystemActor`.

## 2. Monorepo layout

```
tokslearn/
├─ CLAUDE.md
├─ docs/
├─ apps/
│  └─ web/
│     ├─ app/
│     │  ├─ (marketing)/          home, about, pricing pages — static
│     │  ├─ (catalog)/            courses, categories, search, instructors — static shell + streamed bits
│     │  ├─ (auth)/               sign-in, sign-up, verify, reset
│     │  ├─ (learn)/learn/[courseSlug]/[lessonId]   course player — dynamic
│     │  ├─ (account)/account/    learner dashboard, orders, certificates, settings
│     │  ├─ (teach)/teach/        instructor studio
│     │  ├─ (admin)/admin/        back office
│     │  ├─ verify/[code]/        certificate verification — static per code
│     │  ├─ api/
│     │  │  ├─ rpc/[[...rest]]/route.ts
│     │  │  ├─ v1/[[...rest]]/route.ts
│     │  │  ├─ auth/[...all]/route.ts
│     │  │  ├─ inngest/route.ts
│     │  │  └─ webhooks/{paystack,bunny,daily,dojah}/route.ts
│     │  ├─ sitemap.ts, robots.ts, opengraph-image.tsx
│     │  └─ layout.tsx
│     ├─ components/              app-specific components, grouped by area
│     ├─ lib/                     orpc client, query client, auth client, formatters
│     ├─ proxy.ts                 (Next 16 replacement for middleware) — auth redirects only, no DB
│     └─ next.config.ts
├─ packages/
│  ├─ contract/   src/<module>.ts → oRPC contract + Zod schemas; src/index.ts combines
│  ├─ core/       src/<module>/{index.ts, service.ts, repo.ts, rules.ts, errors.ts, events.ts, *.test.ts}
│  ├─ db/         src/schema/<module>.ts, src/client.ts, migrations/, seed/
│  ├─ api/        src/router.ts, src/procedures/<module>.ts, src/middleware/*.ts
│  ├─ auth/       src/server.ts, src/client.ts, src/permissions.ts
│  ├─ jobs/       src/client.ts, src/functions/<name>.ts, src/events.ts
│  ├─ integrations/ src/{paystack,bunny,daily,r2,dojah,resend,upstash}/
│  ├─ ui/         tokens.css, primitives (Button, Input, Dialog…), icons
│  ├─ emails/     React Email templates
│  └─ config/     tsconfig bases, biome.json, tailwind preset
├─ turbo.json, pnpm-workspace.yaml, package.json
└─ .github/workflows/
```

Package names: `@tokslearn/<name>`. Internal packages are compiled by Next via `transpilePackages`
(no separate build step) except `contract`, which must also build for Expo later.

## 3. Domain modules (`packages/core/src/`)

| Module | Owns |
|--------|------|
| `identity` | users, profiles, roles, staff permissions (wraps Better Auth tables) |
| `instructors` | applications, KYC status, payout accounts, instructor profiles |
| `catalog` | categories, tags, course listing, search index |
| `courses` | courses, revisions, sections, lessons, resources, pricing, settings, review workflow |
| `media` | video assets, upload sessions, playback tokens, files in R2 |
| `commerce` | carts, wishlists, orders, order items, coupons, referrals, bundles, checkout |
| `ledger` | accounts, journal entries, balances, commission rules |
| `payouts` | payout runs, payout items, transfer reconciliation |
| `refunds` | refund requests, eligibility engine, consumption evidence |
| `enrollments` | enrollments, access checks, drip unlock computation |
| `progress` | lesson progress, course completion, streaks, activity log |
| `assessments` | question banks, quizzes, exams, attempts, grading |
| `assignments` | assignments, submissions, rubrics, grades |
| `certificates` | templates, issuance, verification, revocation, external results |
| `cohorts` | cohort runs, membership, schedules |
| `community` | discussions, Q&A threads, replies, announcements, reports |
| `live` | live sessions, Daily rooms, attendance, recordings |
| `reviews` | ratings, reviews, instructor replies |
| `engagement` | badges, streak rewards, notes, bookmarks |
| `notifications` | in-app notifications, preferences, push tokens, email dispatch |
| `analytics` | instructor stats aggregates, platform reports |
| `admin` | audit log, settings, moderation actions |

### Module rules
- A module exports only from `index.ts`. Other modules import `@tokslearn/core/<module>`, never deep paths. Enforce with Biome `noRestrictedImports` / a custom lint script.
- A module owns its tables. Other modules never write to them directly; they call the owner's service.
  Reads across modules for performance (joins) are allowed in **query functions owned by the reading
  module**, documented in its `repo.ts` with a comment naming the foreign tables.
- Cross-module side effects go through **domain events** (see §6), not direct calls, when the caller
  does not need the result (e.g. `enrollment.created` → notifications, analytics, streak).
- Money-moving flows (checkout completion, refunds, payouts) run in one DB transaction and call
  `ledger.post()` synchronously inside that transaction.

## 4. The `Actor` and authorization

Every core function takes `ctx: { actor: Actor; db: Db | Tx; now: Date; requestId: string }`.

```ts
type Actor =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; roles: Role[]; sessionId: string }
  | { kind: 'system'; reason: string }   // jobs, webhooks
```

Authorization lives in `core/<module>/rules.ts` as pure functions
(`canEditCourse(actor, course)`), unit tested. Services call rules before doing work and throw
`ForbiddenError`. UI hides buttons using the same rules exported through a lightweight
`permissions` procedure; the UI check is cosmetic, the service check is binding.

## 5. Rendering strategy (Next.js 16 with `cacheComponents: true`)

| Route | Strategy |
|-------|----------|
| Home, category pages, course landing, instructor profile | Static shell prerendered. Course data via `'use cache'` functions tagged `course:{id}`, `instructor:{id}`, `catalog`. Per-user bits (Enroll/Continue button, wishlist heart, price with coupon) stream inside `<Suspense>`. |
| Search results | Static shell; results component reads `searchParams` inside Suspense. Search function cached with short `cacheLife` keyed by query. |
| Verify certificate | `'use cache'` per code, tag `certificate:{id}`, invalidated on revoke. |
| Learner dashboard, course player, instructor studio, admin | Dynamic (user-specific). Shell still prerendered; data streams. Client-side interactivity via TanStack Query + oRPC. |

Invalidation: services that change cached data call `revalidateTag`/`updateTag` through a small
`cache` adapter in `core` (so core stays framework-agnostic; the web app injects the Next.js
implementation, jobs inject a no-op or an HTTP revalidate call).

Use `generateStaticParams` for the top N (e.g. 500) courses by enrollment; the rest get the app shell
instantly and are filled on first visit (ISR with Cache Components).

## 6. Domain events

- Emitted by core services via `ctx.events.emit('enrollment.created', payload)`.
- Inside a transaction, events are written to an `outbox` table in the same transaction.
- An Inngest function (triggered right after commit + a cron sweeper every minute) reads the
  outbox and sends events to Inngest. Handlers are idempotent (keyed by event id).
- This guarantees no event is lost if the request dies after commit, and none is sent if the
  transaction rolls back.

Event naming: `<module>.<past-tense-verb>` e.g. `order.paid`, `lesson.completed`,
`certificate.issued`, `refund.approved`, `payout.sent`.

## 7. Conventions

### TypeScript
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- Inferred Drizzle types never leak to the client; API outputs are defined by contract schemas.

### Naming
- DB: snake_case tables (plural) and columns. TS: camelCase. Drizzle `casing: 'snake_case'`.
- Procedures: `module.verbNoun` e.g. `courses.list`, `courses.getBySlug`, `cart.addItem`.
- Events: `module.pastTense`.

### Errors
- Core throws `DomainError` subclasses: `NotFoundError`, `ForbiddenError`, `ConflictError`,
  `ValidationError`, `RuleViolationError(code)`, `ExternalServiceError`.
- API middleware maps them to oRPC error codes (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`,
  `BAD_REQUEST`, `UNPROCESSABLE_CONTENT`, `SERVICE_UNAVAILABLE`) with a stable `data.code`
  string the clients can switch on (e.g. `REFUND_WINDOW_CLOSED`).

### Logging
- Structured JSON logs with `requestId`, `actor`, `module`, `action`. No personal data beyond user id.
- Sentry for exceptions with the same context.

### Dates and money
- `Money = { amount: bigint (kobo); currency: 'NGN' }` in core. Serialized to clients as
  `{ amount: string, currency }` (string to avoid JS number precision issues; clients format with `Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' })`).
- All dates ISO strings over the wire.

### Feature flags
- `feature_flags` table + cached lookup (60 s). Used to dark-launch cohorts, live, subscriptions.

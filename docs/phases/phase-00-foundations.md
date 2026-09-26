# Phase 0 — Foundations

**Prompt for Claude Code:**
> Read CLAUDE.md, docs/03-architecture.md, docs/04-tech-stack.md, docs/11-design-system.md and this
> file. Execute Phase 0 task by task. After each task, run the checks listed, then tick it here.
> Check each library's current docs before installing (use latest stable versions) and record exact
> versions as an ADR "Pinned versions" in docs/02-decisions.md.

## Goal
An empty but production-shaped monorepo: tooling, CI, database, auth-free app shell, design tokens,
styleguide page, deployed to Vercel with Neon.

**Screens, errors, emails, events:** build every row marked Ph 0 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks

### 0.1 Monorepo
- [x] `pnpm` workspace + Turborepo (`turbo.json` pipelines: `build`, `dev`, `lint`, `typecheck`, `test`, `test:int`).
- [x] Packages scaffolded per `03 §2` with `package.json` names `@tokslearn/*`, TS project references or path-free workspace imports.
- [x] `packages/config`: `tsconfig.base.json` (strict flags from `03 §7`), `biome.json`, Tailwind preset.
- [x] Node version pinned (`.nvmrc`, `engines`). `.editorconfig`.
- [x] Lint rule/script forbidding deep imports into `@tokslearn/core/<module>/*`.

### 0.2 Next.js app
- [x] `apps/web` Next.js 16 App Router, TypeScript, `cacheComponents: true`, `reactCompiler: true`, `transpilePackages` for workspace packages, `typedRoutes`.
- [x] Route groups created with placeholder pages (see `03 §2`).
- [x] `proxy.ts` stub. Security headers + CSP (report-only first) in `next.config.ts`.
- [x] Copy `/.env.example` into place; `env.ts` with `@t3-oss/env-nextjs` (DB, Redis, Better Auth secret, provider keys — optional for now).
- [x] `/api/v1/health` route (returns version, DB + Redis status).

### 0.3 Database
- [ ] Neon project (region AWS eu-central-1), branches `main`, `staging`, `dev`.
  - _Needs the Neon account (docs/22 §1). Code is ready: set `DATABASE_URL`/`DATABASE_URL_DIRECT`, then `pnpm db:migrate && pnpm db:seed`._
- [x] `packages/db`: Drizzle config (`casing: 'snake_case'`), neon-serverless Pool client, `uuidv7` helper, money helpers, base columns helper (`id`, `createdAt`, `updatedAt`).
- [x] Tables for this phase: `settings`, `feature_flags`, `outbox`, `idempotency_keys`, `audit_log`.
- [x] Migration workflow scripts: `db:generate`, `db:migrate`, `db:studio`, `db:seed`.
- [x] Docker compose Postgres for tests.

### 0.4 Core skeleton
- [x] `packages/core`: `Ctx`, `Actor`, `DomainError` classes, `events.emit` → outbox writer, `cache` adapter interface, `clock`.
- [x] `packages/contract/src/errors.ts` with every code from `docs/21-error-codes.md` (Zod enum + user messages).
- [x] Analytics wrappers (server `track`, client consent-gated) per `docs/24-analytics-events.md`; consent banner.
- [x] `packages/contract` + `packages/api`: oRPC base (context, error mapping middleware, rate-limit middleware stub, idempotency middleware), `health.ping` procedure. RPC + OpenAPI handlers mounted. OpenAPI spec served.
- [x] `packages/jobs`: Inngest client, `outbox-dispatch` function, `/api/inngest` route.
- [x] `packages/integrations`: folder per provider with interface + fake; Upstash Redis client.

### 0.5 Design foundation
- [ ] Install skills per `docs/18-skills-setup.md`.
  - _Blocked by the local permission policy on installing third-party skills. Reviewed and pinned sources are listed in the Phase 0 summary; the owner installs them. The web-design-guidelines review ran by fetching its rules directly._
- [x] `packages/ui/tokens.css` exactly as `11 §1`, Tailwind v4 `@theme`, Figtree via `next/font`.
- [x] Restyled primitives: Button, Input, Textarea, Select, Checkbox, Radio, Switch, Label, Dialog, Sheet, Popover, Tooltip, Tabs, Toast, Badge, Avatar, Skeleton, Progress, Table, EmptyState.
- [x] `/styleguide` page (dev + staff only) showing tokens and every component state.
- [x] Root layout: header (logo wordmark "Tokslearn" set in Figtree 700, not an icon-in-gradient), footer, skip link.
- [x] `pnpm copy:check` script with the banned-words list from `11 §7`.

### 0.6 Quality and CI
- [x] Vitest configured (unit + integration projects). One example test each.
- [x] Playwright configured with one smoke test (home renders).
- [x] GitHub Actions `ci.yml` per `15 §4` (Lighthouse CI can target a placeholder home for now).
- [x] Sentry wired (web + server). PostHog wrapper loaded lazily (no-op without key).
- [x] Renovate config.

### 0.7 Deploy
- [ ] Vercel project (Pro), root `apps/web`, region `fra1`, Neon integration for preview branches, env vars per environment, spend alerts.
  - _Needs the Vercel and GitHub accounts. `apps/web/vercel.json` pins `fra1` and runs migrations before the build._
- [ ] Domain placeholder or Vercel URL live; `/api/v1/health` green in production.
  - _After the Vercel project exists. `/api/v1/health` is green locally (database ok, redis not_configured)._

## Acceptance checklist
- [ ] `pnpm typecheck lint test` pass locally and in CI.
  - _Local: pass (plus `test:int` against Postgres 17). CI: runs once the repo is on GitHub._
- [ ] Preview deploy per PR with its own Neon branch.
  - _Needs Vercel + Neon integration; `.github/workflows/preview.yml` runs Playwright and Lighthouse on each preview._
- [ ] `/styleguide` reviewed with `web-design-guidelines` + `avoid-ai-design`; no P0/P1 findings.
  - _web-design-guidelines: findings fixed. avoid-ai-design: checked by hand against docs/11 §6 (no P0/P1); its scanner runs once the skill is installed._
- [ ] Lighthouse mobile on `/` ≥ 95 perf, 100 a11y.
  - _Local production build: `/` 99 perf, 100 a11y, 100 best practices, 100 SEO, LCP 1.7 s, CLS 0. Re-check on the first preview deploy. First-load JS budget is open question Q7 in docs/02._
- [x] `docs/02-decisions.md` has the "Pinned versions" ADR.

# Tokslearn — Agent Operating Rules

You are building **Tokslearn**, an instructor marketplace LMS for the Nigerian market first
(NGN, Paystack), designed to scale to 100k+ users and to ship a React Native (Expo) app later
that uses the same API.

Read this file fully before any task. Then read the guide(s) listed for the task in
`docs/00-index.md`. The guides are the source of truth. If code and guides disagree, stop and ask.

---

## 1. Non-negotiables

1. **Modular monolith, one repo.** No microservices. Domain modules talk to each other only
   through their public service functions (`packages/core/src/<module>/index.ts`).
2. **One business-logic layer.** Every read and write goes through `packages/core` services.
   Server Components call services directly. Client components and the mobile app call the
   same services through the oRPC API. Never put business logic in React components,
   route handlers, or Server Actions.
3. **API-first for every mutation.** Every user action must be possible through the oRPC API,
   because the mobile app will use it. If you add a feature, you add its procedure.
   (See `docs/06-api-design.md`.)
4. **Money is integer kobo** (`bigint`), never floats. Every money movement writes balanced
   ledger entries inside a DB transaction. (See `docs/08-payments-ledger-payouts.md`.)
5. **Validate at the boundary with Zod.** Shared schemas live in `packages/contract`.
6. **Light theme only. No generic AI design, no AI-sounding copy.**
   Follow `docs/11-design-system.md` exactly. Run the design audit before closing any UI task.
7. **Performance budget is a feature.** Lighthouse ≥ 95 (mobile) on public pages, LCP < 2.0s,
   CLS < 0.05, INP < 200ms. Public JS per route < 120 KB gzipped.
   (See `docs/12-performance-and-seo.md`.)
8. **Security by default.** Authorization is checked in the service layer, not only in the UI.
   Webhooks are signature-verified and idempotent. No secrets in client code.
9. **Never store raw NIN, BVN, card numbers or full bank details beyond what payouts require.**
   Store verification results and provider references only. (See `docs/14-security-and-compliance.md`.)

## 2. Stack (pinned decisions — do not swap without an ADR in `docs/02-decisions.md`)

pnpm + Turborepo · Next.js 16 (App Router, `cacheComponents`, React Compiler) · React 19.2 ·
TypeScript strict · oRPC v1 (RPC + OpenAPI) · TanStack Query · Zod · Drizzle ORM ·
Neon Postgres · Better Auth · Paystack · Bunny Stream · Daily · Cloudflare R2 · Inngest ·
Upstash Redis · Resend + React Email · Tailwind CSS v4 + shadcn/ui (restyled) · Zustand
(client UI state only) · Sentry · PostHog · Vitest · Playwright · Biome · Vercel (fra1) ·
Expo (later).

Full reasoning: `docs/04-tech-stack.md`.

## 3. Repo layout

```
apps/web            Next.js app (learner, instructor, admin surfaces)
apps/mobile         Expo app (Phase 14 — do not create before then)
packages/contract   oRPC contract + Zod schemas + shared types (NO server code)
packages/core       Domain services (business logic), per module
packages/db         Drizzle schema, migrations, db client, seed
packages/api        oRPC router implementation (thin: auth → validate → call core)
packages/auth       Better Auth server + client config
packages/jobs       Inngest client + functions
packages/integrations  Paystack, Bunny, Daily, R2, Dojah, Resend clients (typed, mockable)
packages/ui         Design tokens + primitives shared web-side
packages/emails     React Email templates
packages/config     tsconfig, biome, tailwind preset
```

## 4. How to work

- Every page you build must match its row in `docs/20-screen-inventory.md` (content and states).
  Every error uses a code from `docs/21-error-codes.md`. Every email comes from
  `docs/23-email-catalog.md`. Every tracked event comes from `docs/24-analytics-events.md`.
  Add to those files first if something is missing.
- Work phase by phase from `docs/phases/`. Do not start a phase until the previous phase's
  acceptance checklist passes.
- Before coding a feature: restate the goal, list files you will touch, name the guide
  sections you followed. Keep changes small and reviewable.
- After coding: run `pnpm typecheck && pnpm lint && pnpm test`. For UI: run the design audit
  and a Lighthouse check on the affected route. Update the phase checklist.
- When a decision is not covered by the guides, propose options, pick the one that best
  fits scale + cost + mobile-readiness, and record it as an ADR in `docs/02-decisions.md`.
- Always check the current docs of a library before using an API you are unsure of
  (versions move fast). Prefer the library's official docs or `llms.txt`.
- Never mark a task done with failing tests, type errors, or TODOs in critical paths
  (payments, ledger, auth, grading).

## 5. Code conventions (short form — full list in `docs/03-architecture.md`)

- File names kebab-case. Components PascalCase. One component per file in `components/`.
- Server Components by default. `"use client"` only at leaf components that need it.
- No barrel re-exports inside apps (hurts tree-shaking). Packages expose one entry per module.
- Errors: throw typed `ORPCError` codes from the API layer; core services throw `DomainError`
  subclasses (see `docs/06-api-design.md#errors`).
- IDs: UUIDv7 primary keys. Public URLs use slugs or short public IDs, never sequential ints.
- Timestamps: `timestamptz`, stored UTC, displayed in `Africa/Lagos` by default.
- Every table has `created_at`, `updated_at`. Soft-delete only where the guide says so.
- No `any`. No non-null assertions on external data. No default exports except Next.js
  files that require them.

## 6. Copy rules (enforced)

Plain, specific, human. Banned words and patterns are listed in
`docs/11-design-system.md#voice-and-copy`. If a sentence would fit on any other website,
rewrite it for Tokslearn.

# 04 — Tech Stack

Versions below are the minimum known-good lines as of September 2026. At setup, install the latest
stable release of each and record the exact versions in `docs/02-decisions.md` (ADR "Pinned versions").
Always read the library's current docs before using an unfamiliar API.

## 1. Core

| Concern | Choice | Why | Notes |
|---------|--------|-----|-------|
| Package manager / monorepo | pnpm + Turborepo | Fast installs, workspace protocol, remote cache | Expo supports pnpm monorepos (use `node-linker=hoisted` only inside `apps/mobile` if Metro needs it) |
| Web framework | Next.js 16.3+ (App Router) | Cache Components = static shell + streamed dynamic parts; Turbopack; React Compiler | `cacheComponents: true`, `reactCompiler: true`. Cache Components require the Node.js runtime — do not use the Edge runtime. Next 16 replaced `middleware.ts` with `proxy.ts`. |
| UI runtime | React 19.2 | | |
| Language | TypeScript (strict) | | |
| Styling | Tailwind CSS v4 | Zero-runtime, tokens as CSS variables | Tokens in `packages/ui/tokens.css` |
| Components | shadcn/ui (copied in, restyled) + Radix primitives | Accessible primitives, full ownership | Must be restyled to our tokens; default shadcn look is not acceptable |
| Icons | Lucide (tree-shaken per icon import) | Consistent line icons | 1.75 stroke, sizes 16/20/24 only |
| Forms | react-hook-form + Zod resolver | Small, uncontrolled inputs | Schemas from `@tokslearn/contract` |
| Client data | TanStack Query v5 via `@orpc/tanstack-query` | Caching, optimistic updates, same on mobile | |
| Client UI state | Zustand | Player UI state, cart drawer, exam timer UI | Never for server data |
| Rich text | Tiptap (lessons, Q&A), stored as JSON + sanitized HTML | Structured, renderable on mobile | Render read-only content server-side to HTML; do not ship the editor on public pages |

## 2. API

| Concern | Choice | Why |
|---------|--------|-----|
| API framework | **oRPC v1** (contract-first) | End-to-end types like tRPC **plus** first-class OpenAPI. One contract serves web, Expo, and third parties. |
| Transport | `RPCHandler` at `/api/rpc` (first-party), `OpenAPIHandler` at `/api/v1` (REST + spec) | Mobile can use either; the typed RPC client is preferred |
| Validation | Zod (v4) | Shared by forms, API, and mobile |
| Docs | Generated OpenAPI spec served at `/api/v1/openapi.json`; Scalar reference page at `/developers` (staff-only until public API launch) | |

oRPC v2 is in beta (Aug 2026). Stay on v1. Upgrade only after v2 stable + an ADR.

## 3. Data

| Concern | Choice | Notes |
|---------|--------|-------|
| Database | Neon Postgres (Postgres 17+), region **AWS eu-central-1 (Frankfurt)** | Branch per PR for previews; point-in-time restore |
| ORM | Drizzle ORM + drizzle-kit | SQL-shaped queries, migrations as SQL files committed to git |
| Driver | `drizzle-orm/neon-serverless` with `Pool` (WebSocket) | Needed for interactive transactions (checkout, ledger). Create the pool per request in serverless or reuse module-level with Vercel Fluid compute. |
| Pooling | Neon pooled connection string (PgBouncer) for app traffic; direct string for migrations | |
| Cache / rate limit / locks | Upstash Redis (`@upstash/redis`, `@upstash/ratelimit`) | Free tier to start |
| Search | Postgres full-text search (`tsvector` + GIN) + `pg_trgm` for typo tolerance | Move to Typesense/Meilisearch only if needed (>50k courses or complex ranking) |
| Files | Cloudflare R2 (S3 API) with presigned uploads/downloads | Zero egress fees. Assignments, resources, certificate PDFs, images |
| Images | `next/image` with R2 as remote pattern; upload-time resize to WebP/AVIF via a job | Keep Vercel image optimization usage low |

## 4. Auth and identity

| Concern | Choice |
|---------|--------|
| Auth | **Better Auth** (Drizzle adapter). Plugins: `admin`, `twoFactor`, `emailOTP` (or `magicLink`), `bearer` (mobile/API), `organization` (Phase 13), `@better-auth/expo` (Phase 14). Social: Google. |
| KYC | **Dojah** (BVN/NIN lookup + selfie liveness/face match). Nigerian-focused, sandbox available. Alternatives if pricing/coverage changes: Smile ID, Prembly, Didit. Abstract behind `integrations/kyc`. |
| Bank account check | Paystack Resolve Account Number |

## 5. Payments

| Concern | Choice |
|---------|--------|
| Gateway | **Paystack** (card, bank transfer, USSD, Apple Pay where available). Transactions API + webhooks. |
| Payouts | Paystack Transfers (transfer recipients + bulk transfer) |
| Subscriptions (Phase 12) | Paystack Plans/Subscriptions |
| International (Phase 16) | Stripe or Flutterwave behind the same `PaymentProvider` interface |

## 6. Media and real-time

| Concern | Choice | Notes |
|---------|--------|-------|
| Video hosting/encoding/delivery | **Bunny Stream** | Free H.264 encoding, cheap delivery, TUS resumable uploads, token auth, embeddable player, webhooks. DRM (MediaCage) later. |
| Web player | Bunny embed player (iframe) behind a click-to-load facade; progress via player.js events | Minimal JS on our side, DRM-ready later |
| Mobile player (Phase 14) | `expo-video` (HLS). DRM/offline: `react-native-video` + TWG Offline SDK (commercial) or Bunny's native SDK — decide in Phase 15 |
| Live classes | **Daily** (Prebuilt for v1; custom call UI later) | 10k free participant-min/month then ~$0.004/min; cloud recording billed per minute |

## 7. Background work and messaging

| Concern | Choice |
|---------|--------|
| Jobs, schedules, workflows | **Inngest** (durable steps, retries, cron, concurrency keys) |
| Email | **Resend** + React Email |
| Push (Phase 14) | Expo Push Notifications |
| In-app notifications | Own table + polling/`TanStack Query` refetch on focus; SSE via oRPC later if needed |

## 8. Quality and observability

| Concern | Choice |
|---------|--------|
| Lint/format | Biome |
| Unit/integration tests | Vitest (+ a real Postgres via Docker or a Neon test branch) |
| E2E | Playwright |
| Load tests | k6 |
| Errors/tracing | Sentry (free tier to start) |
| Product analytics / flags | PostHog (free tier), loaded after interaction/idle |
| Perf monitoring | Lighthouse CI in GitHub Actions + Vercel Speed Insights (optional, paid) |
| Uptime | Better Stack or UptimeRobot free tier |

## 9. Hosting

| Concern | Choice |
|---------|--------|
| Web + API | **Vercel Pro**, function region `fra1` (same region as Neon) |
| DNS / domain | Cloudflare DNS (proxy **off** for the Vercel apex to avoid double-CDN issues) |
| Secrets | Vercel env vars per environment; validated at boot with `@t3-oss/env-nextjs` |
| Mobile builds (Phase 14) | EAS Build + EAS Update |

## 10. Monthly cost at launch (estimate — verify prices at setup)

| Service | Plan | Est. USD/month |
|---------|------|---------------:|
| Vercel | Pro, 1 seat | 20 |
| Neon | Free → Launch when needed | 0–19 |
| Bunny Stream | Pay as you go | 5–20 |
| Daily | Free 10k min | 0 |
| Inngest | Free tier | 0 |
| Upstash | Free tier | 0 |
| Resend | Free tier | 0 |
| Cloudflare R2 | Free 10 GB | 0 |
| Sentry, PostHog | Free tiers | 0 |
| Domain | | ~1–2 |
| **Total** | | **~$26–61** |

Per-transaction costs (not in the table): Paystack fees on each payment and transfer; Dojah per
verification. Budget these as cost of sales.

## 11. Things we deliberately do not use

- **Microservices / Kubernetes** — no need at this scale (ADR-001).
- **Server Actions for business logic** — not callable by mobile. OK only for trivial web-only form glue that immediately calls a core service (prefer oRPC anyway).
- **Edge runtime** — Cache Components and the Postgres pool need Node.js.
- **Prisma** — heavier runtime; team already knows Drizzle.
- **Firebase / Supabase auth** — we own auth data with Better Auth.
- **Dark mode** — light only (ADR-013).

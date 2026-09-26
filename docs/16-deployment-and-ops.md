# 16 — Deployment and Operations

## 1. Environments

| Env | Web | DB | Providers |
|-----|-----|----|-----------|
| Local | `pnpm dev` | Docker Postgres (or a Neon dev branch) | Paystack test keys, Bunny dev library, Daily dev domain, Inngest Dev Server, Resend test |
| Preview (per PR) | Vercel preview | Neon branch per PR (Neon ↔ Vercel integration), seeded | Test keys |
| Staging | `staging.tokslearn.com` | Neon `staging` branch | Test keys, staging Bunny library |
| Production | `tokslearn.com` | Neon `main` | Live keys |

Webhooks for previews: point provider test webhooks at staging; previews use fakes or manual triggers.

## 2. Vercel configuration

- Plan: Pro. Framework: Next.js. Root: `apps/web`. Build: `turbo run build --filter=web`.
- Function region: `fra1` (matches Neon eu-central-1). Fluid compute on (module-level pool reuse).
- Set **Spend Management** limits and alerts from day one.
- Env vars per environment, validated at build/boot. Never share production secrets with previews.
- Cron is handled by Inngest (not Vercel Cron) so schedules are durable and observable.

## 3. CI/CD (GitHub Actions)

- `ci.yml` on PR: quality gates from `15 §4`.
- Migrations: run `drizzle-kit migrate` against the target Neon branch in the deploy job **before** promoting the new build (expand/contract migrations keep old code working).
- `main` → auto-deploy to staging → smoke tests → manual promote to production (Vercel "Promote").
- Tag releases (`vYYYY.MM.DD-n`), changelog from conventional commits.
- Turborepo remote cache (Vercel) to keep CI fast.

## 4. Observability

- Sentry: web (client + server), API, Inngest functions. Release tracking + source maps. Alerts: new issue in payments/ledger/auth modules → email immediately.
- Logs: structured JSON; Vercel log drains to a cheap store later (Axiom/Better Stack) when needed.
- Business dashboards (admin): orders/day, revenue, refunds rate, failed payments, payout run status, heartbeats/min, active learners.
- Uptime checks: home, `/api/v1/health` (DB + Redis ping), Paystack webhook endpoint reachability.
- Inngest dashboard for job failures; alert on repeated failures.

## 5. Costs

Review monthly (1st working day) in `docs/costs.md`: Vercel usage (function duration, data transfer, image optimization), Neon compute hours/storage, Bunny storage + delivery, Daily minutes, Resend volume, Dojah checks, Paystack fees. Triggers to act:
- Vercel > $150/month consistently → review caching, then evaluate Cloudflare (OpenNext/vinext) or container hosting.
- Neon compute always-on → move to a paid plan with right-sized autoscaling; add read replica for analytics.
- Daily > ~500k participant-min/month → evaluate LiveKit Cloud.
- Bunny delivery dominating → check renditions/start quality, consider geo-replication settings.

## 6. Scaling runbook (in order)

1. Find the slow query (Neon query insights / `pg_stat_statements`) → add index / rewrite.
2. Cache the read (`'use cache'` tags or Redis).
3. Move work async (Inngest) and batch writes (heartbeats).
4. Increase Neon compute / autoscaling max; enable read replica for heavy reads (analytics, search).
5. Partition the biggest append-only tables.
6. Only then consider extracting a module into its own service.

## 7. Incident basics

- `docs/runbooks/` per critical flow: payments failing, webhooks not arriving, payout run stuck, video processing stuck, DB overload. Each: symptoms, checks, fixes, who to notify.
- Status page (free tier) linked from the footer.

# 22 — Environment and Accounts

The full variable list is in `/.env.example` (repo root). This file explains who owns each
account, which environment uses which keys, and the setup order.

## 1. Accounts to create (setup order)

| # | Service | Account type | Needed by | Notes |
|---|---------|-------------|-----------|-------|
| 1 | GitHub | Organization `tokslearn` | Phase 0 | Private repo, branch protection on `main` |
| 2 | Vercel | Pro team | Phase 0 | Link GitHub; region `fra1`; spend alerts |
| 3 | Neon | Project in AWS eu-central-1 | Phase 0 | Branches `main`, `staging`, `dev`; Vercel integration |
| 4 | Upstash | Redis database in eu-central-1 | Phase 0 | |
| 5 | Sentry, PostHog (EU cloud) | Free tiers | Phase 0 | |
| 6 | Inngest | App `tokslearn` | Phase 0 | Separate environments for staging/production |
| 7 | Resend | Domain `mail.tokslearn.com` | Phase 1 | SPF, DKIM, DMARC records |
| 8 | Google Cloud | OAuth client | Phase 1 | Authorized redirect: `{APP_URL}/api/auth/callback/google` |
| 9 | Cloudflare | DNS + R2 | Phase 1 | Buckets per env; custom domain for public bucket |
| 10 | Paystack | Business account | Phase 2 (test) / Phase 11 (live) | Start business verification early — live activation takes time. Disable transfer OTP for API payouts once security measures are in place. |
| 11 | Dojah | Sandbox → production | Phase 2 | Production needs business KYC/contract |
| 12 | Bunny | Stream libraries per env | Phase 2 | Token auth, referrer allowlist, webhook |
| 13 | Daily | Domain `tokslearn` | Phase 8 | Webhook endpoint |
| 14 | Apple Developer / Google Play | Company accounts | Phase 14 | Apple needs a D-U-N-S number for organizations — apply months early |

Store account ownership (which email owns each) and recovery codes in the company password manager,
not in the repo.

## 2. Keys per environment

| Variable group | Local | Preview | Staging | Production |
|----------------|-------|---------|---------|------------|
| Database | Docker or Neon `dev` branch | Neon branch per PR | Neon `staging` | Neon `main` |
| Paystack | test | test | test | **live** |
| Dojah | sandbox | sandbox (fake by default) | sandbox | production |
| Bunny | dev library | staging library | staging library | production library |
| Daily | dev rooms | staging | staging | production |
| R2 | `*-dev` buckets | `*-staging` | `*-staging` | production buckets |
| Inngest | Dev Server | staging env | staging env | production env |
| Resend | test/sandbox | staging sender | staging sender | production |

Previews never receive production secrets. Preview webhooks from providers are not configured;
use the fake integrations or trigger events manually.

## 3. Rules

- `apps/web/env.ts` validates every variable at boot and build; missing required values fail the deploy.
- Server-only variables are never imported into files with `"use client"` (enforced by `server-only` imports in integration clients).
- Rotation: provider keys yearly and whenever someone with access leaves; `BETTER_AUTH_SECRET` rotation invalidates sessions — plan it.

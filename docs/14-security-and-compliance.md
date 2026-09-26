# 14 — Security and Compliance

## 1. Threat model highlights

| Asset | Threat | Control |
|-------|--------|---------|
| Money (orders, payouts) | Price tampering, replayed webhooks, forged payment confirmation | Server-side pricing, provider verification before fulfilment, signature checks, idempotency, amount/currency match |
| Payout destination | Account takeover changes bank details | 2FA step-up, 72 h hold on first payout after bank change, email to old address, name match to KYC |
| Paid content | Link sharing, downloads | Token-auth playback with expiry, referrer lock, watermark, concurrent-session limit (setting: 3 active sessions), DRM later |
| Exam integrity | Cheating, answer leakage | Answers never sent to client, server deadlines, randomization, integrity signals |
| Personal data | Leaks, over-collection | Minimization, no raw BVN/NIN, access control, audit log, encryption at rest (Neon/R2 default) |
| Accounts | Credential stuffing | Rate limits, breached-password check, 2FA, lockouts |
| Platform | Abuse (spam, fake reviews, refund fraud) | Rate limits, review eligibility, refund abuse rule, moderation queue |

## 2. Application security checklist

- **Input:** Zod on every procedure/webhook/form. Reject unknown keys (`strict()`) on mutations.
- **Output:** DTOs only. Sanitize all user HTML with an allowlist (e.g. `sanitize-html`) server-side before storing `*_html`.
- **AuthZ:** rules in core; every service call checks. Tests for "user A cannot access user B's X" per module (IDOR tests).
- **CSRF:** Better Auth handles auth routes; oRPC RPC endpoint requires a custom header (`x-tokslearn-client`) + same-site cookies; reject cross-origin requests with cookies (check `Origin`).
- **Headers** (set in `next.config.ts`): strict CSP (nonce-based for scripts; allow Paystack, Bunny iframe, Daily, PostHog, Sentry origins explicitly), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic only on live and KYC pages), `frame-ancestors 'none'`.
- **Secrets:** only server env vars; validated with `@t3-oss/env-nextjs`; no secrets in `NEXT_PUBLIC_*`. Rotate Paystack/Bunny/Daily keys yearly and after any staff change.
- **Uploads:** presigned with content-type and size constraints; extension allowlist; never serve user uploads from the app origin (R2 domain); `Content-Disposition: attachment` for private files.
- **Dependencies:** Renovate (weekly, grouped), `pnpm audit` in CI, lockfile committed, avoid packages with install scripts where possible.
- **Logging:** no PII or secrets in logs; hash IPs (with a rotating salt) for evidence tables.
- **Admin:** staff routes require staff role + 2FA; impersonation is read-only by default and always audited with a banner.
- **Backups:** Neon point-in-time restore (check retention of your plan); weekly logical dump to R2 (encrypted) via GitHub Action; test restore quarterly.

## 3. Nigeria Data Protection Act (NDPA) 2023 — practical checklist

(Not legal advice — have a lawyer review before launch.)

- Privacy policy and terms in plain language; instructor agreement (payouts, content rights, refunds, prohibited content).
- Lawful basis and consent: explicit consent for marketing; clear notice for KYC processing and exam integrity signals.
- Data minimization: instructors cannot see learner emails by default; store only KYC results.
- Data subject rights: export my data (`me.exportData` → JSON + files zip job), correct, delete (anonymize) — self-service.
- Cross-border transfer: our processors (Vercel, Neon Frankfurt, Bunny, Daily, Resend, Sentry, PostHog) are outside Nigeria — document them, sign DPAs, and note in the privacy policy.
- Breach response plan: detect → assess → notify the regulator within the required window (72 h under NDPA) → notify affected users.
- Register with / file audits to the Nigeria Data Protection Commission if thresholds apply (check with counsel).
- Keep a record of processing activities (a simple table in `docs/compliance/ropa.md`).

## 4. Payments compliance

- We never touch card data (Paystack hosted checkout / InlineJS) → minimal PCI scope (SAQ A-level).
- Keep invoices/receipts and ledger records for the statutory retention period (confirm with accountant, commonly 6+ years).
- Consumer protection: refund policy shown clearly before purchase and in the receipt.

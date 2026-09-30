# Phase 11 — Hardening and Launch

**Prompt:** Read CLAUDE.md, `docs/12`, `docs/14`, `docs/15 §5`, `docs/16`. Execute Phase 11.

**Screens, errors, emails, events:** build every row marked Ph 11 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [ ] Performance pass on every public route (Lighthouse CI budgets green), bundle review, image variants in use everywhere, third-party scripts audit.
- [ ] Security pass: CSP enforced (not report-only), headers, IDOR test sweep across all modules, dependency audit, secret rotation, rate limits verified, webhook signature tests, admin 2FA enforced.
- [ ] Load tests per `15 §5` on staging with seeded volume; fix bottlenecks via the runbook order in `16 §6`.
- [ ] Phase 6 exam spike (moved here): `load/exam-spike.js`, 500 learners, p95 < 500 ms on start, save and submit.
- [ ] Neon: move to paid plan with minimum compute (no cold starts), verify PITR retention, run a restore drill.
- [ ] Backups job to R2; runbooks written for payments, webhooks, payouts, video, DB overload.
- [ ] Legal: privacy policy, terms, instructor agreement, refund policy page, cookie notice (analytics consent), NDPA items from `14 §3`.
- [ ] Email domain: SPF, DKIM, DMARC verified; deliverability test to Gmail/Yahoo/Outlook.
- [ ] Monitoring: Sentry alerts, uptime checks, status page, spend alerts on every provider.
- [ ] Content: 5–10 instructors onboarded with real courses; seed categories; homepage rows curated.
- [ ] Vercel: upgrade Hobby → Pro (ADR-012: Hobby forbids commercial use) and turn on Spend Management with a $50 limit and email alerts. Must happen before live keys below (carried over from Phase 0).
- [ ] Switch Paystack/Bunny/Daily/Dojah to live keys; test ₦100 live purchase + refund end to end.
- [ ] Launch checklist sign-off, tag release.

## Acceptance
- [ ] All budgets green; load test targets met.
- [ ] A live-money purchase, refund and (test) payout succeeded in production.
- [ ] Rollback procedure tested (Vercel instant rollback + backward-compatible migrations).

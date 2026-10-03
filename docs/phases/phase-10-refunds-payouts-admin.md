# Phase 10 — Refunds, Payouts, Statements, Admin Back Office

**Prompt:** Read CLAUDE.md and `docs/08 §7–9`, `docs/07 §3–4`, `docs/14`. Money code ≥ 95% coverage.
Execute Phase 10.

**Screens, errors, emails, events:** build every row marked Ph 10 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks

### Refunds
- [x] Eligibility engine (pure) + tests for every rule; policy text shown on course page, checkout, receipt, and important-resource download.
- [x] Learner refund request UI (from order page), status tracking, one appeal.
- [x] Finance queue for `under_review` and appeals.
- [x] Paystack refund processing job + webhook + ledger entries + enrollment revocation. PR 1 of 4 (ADR-043).

### Earnings and payouts
- [ ] `earnings-release` job.
- [ ] Instructor earnings page: pending (with release dates), available, in transit, paid; line items; export CSV.
- [ ] Payout runs: draft job, finance review UI with anomalies, approval with 2FA (+ super-admin co-sign above threshold), processing with bulk transfers, webhooks, failure rollover, notifications.
- [ ] Monthly statement PDFs.
- [ ] First-payout hold after bank change (72 h) + alert emails.

### Admin back office
- [ ] Dashboard (orders, revenue, refunds rate, failed payments, payout status, active learners).
- [ ] Users, instructors, courses, orders, refunds, payouts, ledger explorer (read-only with filters), coupons, commission, settings, feature flags, reports/moderation queue, audit log viewer.
- [ ] Support tools: impersonation (read-only, bannered, audited), resend receipt, grant enrollment (audited, `admin_grant`).

### Procedures
`refunds.checkEligibility`, `refunds.request`, `refunds.appeal`, `refunds.listMine`, `earnings.summary`,
`earnings.lines`, `earnings.statements`, `admin.refunds.*`, `admin.payouts.*`, `admin.ledger.*`,
`admin.settings.*`, `admin.audit.*`, `admin.support.*`.

## Acceptance
- [ ] Full monthly cycle simulated in staging with Paystack test transfers: sales → releases → refund → payout run → success + one failure → rollover. Ledger balanced throughout; integrity job clean.
- [ ] Every staff action appears in the audit log.
- [ ] Finance cannot change commission; super admin can (with 2FA).

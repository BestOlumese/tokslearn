# Phase 4 — Commerce, Enrollments and Ledger

**Prompt:** Read CLAUDE.md and all of `docs/08-payments-ledger-payouts.md` carefully, plus `docs/05`
(commerce, ledger, enrollments). Money code needs ≥ 95% coverage. Execute Phase 4.

**Screens, errors, emails, events:** build every row marked Ph 4 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] Tables: carts, cart_items, wishlist_items, coupons, coupon_redemptions, referral_links, attributions, orders, order_items, payment_events, ledger_accounts, journal_entries, journal_lines, account_balances, commission_rules, enrollments, consumption_events.
- [x] Money utils: allocation (largest remainder), bps math, formatting. Property tests.
- [x] `ledger.post()` with all guarantees in `08 §5`; balance locking order; nightly integrity job.
- [x] Attribution: referral link redirect route `/r/{code}` (sets `tl_ref`, logs click via Redis counter), UTM capture.
- [x] Commission rule resolution + admin UI `/admin/settings/commission` (super admin, 2FA, audit).
- [x] Coupons: instructor UI in studio + platform coupons in admin; validation rules.
- [x] Cart + wishlist UI (cart drawer, wishlist page); anonymous cart merges on sign-in (localStorage → server).
- [x] Checkout: `checkout.start` → Paystack initialize → InlineJS popup → `checkout.confirm`; webhook; `completeOrder` idempotent; reconciliation + abandonment crons; free-course enroll path.
- [x] Receipt page `/account/orders/[publicId]` + email receipt. Refund policy restated.
- [x] Enrollment access service (`enrollments.canAccessCourse/Lesson`) used everywhere.
- [x] Learner dashboard `/account` "My learning" (enrolled courses, continue buttons).
- [x] Procedures: `cart.*`, `wishlist.*`, `coupons.validate`, `checkout.start`, `checkout.confirm`, `orders.list`, `orders.get`, `enrollments.enrollFree`, `enrollments.listMine`, `referrals.*` (instructor), `studio.coupons.*`, `admin.commission.*`, `admin.orders.*`.

## Acceptance
- [x] All tests in `08 §12` pass. (Property tests for allocation; every ledger flow; 3-way `completeOrder` race; webhook replay; amount mismatch stays pending. Money code coverage 96.8% lines, gated in CI.)
- [ ] Paystack test mode: card success, card failure, bank transfer delayed success (webhook-only), duplicate webhook — correct results every time. (All four pass against the fake Paystack in tests; owner to repeat on the preview with Paystack test keys and test cards.)
- [x] Ledger explorer (admin, read-only) shows balanced entries for each test order.
- [x] Referral sale shows 3% platform rate snapshot; organic shows 40% (ADR-017 defaults). (`commerce.int.test.ts`)
- [x] Concurrency test: 3 parallel `completeOrder` calls → one sale entry.

Notes: receipt PDF download, refunds and earnings release are Phase 10 (ADR-033). Paid-campaign
capture for `platform_paid` waits until Tokslearn runs ads.

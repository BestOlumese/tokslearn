# Phase 4 — Commerce, Enrollments and Ledger

**Prompt:** Read CLAUDE.md and all of `docs/08-payments-ledger-payouts.md` carefully, plus `docs/05`
(commerce, ledger, enrollments). Money code needs ≥ 95% coverage. Execute Phase 4.

**Screens, errors, emails, events:** build every row marked Ph 4 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [ ] Tables: carts, cart_items, wishlist_items, coupons, coupon_redemptions, referral_links, attributions, orders, order_items, payment_events, ledger_accounts, journal_entries, journal_lines, account_balances, commission_rules, enrollments, consumption_events.
- [ ] Money utils: allocation (largest remainder), bps math, formatting. Property tests.
- [ ] `ledger.post()` with all guarantees in `08 §5`; balance locking order; nightly integrity job.
- [ ] Attribution: referral link redirect route `/r/{code}` (sets `tl_ref`, logs click via Redis counter), UTM capture.
- [ ] Commission rule resolution + admin UI `/admin/settings/commission` (super admin, 2FA, audit).
- [ ] Coupons: instructor UI in studio + platform coupons in admin; validation rules.
- [ ] Cart + wishlist UI (cart drawer, wishlist page); anonymous cart merges on sign-in (localStorage → server).
- [ ] Checkout: `checkout.start` → Paystack initialize → InlineJS popup → `checkout.confirm`; webhook; `completeOrder` idempotent; reconciliation + abandonment crons; free-course enroll path.
- [ ] Receipt page `/account/orders/[publicId]` + email receipt. Refund policy restated.
- [ ] Enrollment access service (`enrollments.canAccessCourse/Lesson`) used everywhere.
- [ ] Learner dashboard `/account` "My learning" (enrolled courses, continue buttons).
- [ ] Procedures: `cart.*`, `wishlist.*`, `coupons.validate`, `checkout.start`, `checkout.confirm`, `orders.list`, `orders.get`, `enrollments.enrollFree`, `enrollments.listMine`, `referrals.*` (instructor), `studio.coupons.*`, `admin.commission.*`, `admin.orders.*`.

## Acceptance
- [ ] All tests in `08 §12` pass.
- [ ] Paystack test mode: card success, card failure, bank transfer delayed success (webhook-only), duplicate webhook — correct results every time.
- [ ] Ledger explorer (admin, read-only) shows balanced entries for each test order.
- [ ] Referral sale shows 3% platform rate snapshot; organic shows 40% (ADR-017 defaults).
- [ ] Concurrency test: 3 parallel `completeOrder` calls → one sale entry.

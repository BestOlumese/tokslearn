# 08 — Payments, Commission, Ledger, Refunds, Payouts

This is the most sensitive part of the system. Every rule here is binding. All money code lives in
`core/commerce`, `core/ledger`, `core/refunds`, `core/payouts` and has ≥ 95% test coverage.

## 1. Money primitives

- Store kobo as `bigint`. In TS use `bigint` in core; convert to string at the API boundary.
- Never compute money with floats. Percentages are **basis points** (1% = 100 bps).
- Rounding: allocate with the **largest remainder method** so parts always sum to the whole
  (`allocate(total, [weights]) → bigint[]`). Unit-test with odd amounts.
- One currency per order (NGN in v1).

## 2. Pricing at checkout (server-side only)

The client never sends prices. `checkout.start` recomputes everything:

1. Load cart items (courses, bundles). Reject unpublished/owned/already-enrolled items.
2. Expand bundles into per-course lines; allocate the bundle price across courses by list price.
3. Apply coupon (one per order in v1). Instructor coupons apply only to that instructor's lines.
4. Resolve **attribution source** per line (see §3).
5. Resolve **commission rule** per line → `platform_rate_bps` snapshot.
6. Compute `net_price`, `platform_share`, `instructor_share`, `gateway_fee_share` (§4).
7. Snapshot `refund_policy_days` from the course.

Free total (₦0) → skip Paystack, create order `paid` with `provider='none'`, enroll immediately.

## 3. Attribution and commission

### Attribution (last-touch with instructor priority)
- Visiting an instructor referral link sets first-party cookie `tl_ref` (30 days) and writes `attributions`.
- Using an instructor's coupon at checkout → source `instructor_coupon` for that instructor's lines.
- Instructor referral cookie for the same instructor as the line → `instructor_referral`.
- Traffic tagged from platform ad campaigns (UTM `utm_medium=paid` from our ad accounts) → `platform_paid`.
- Everything else → `platform_organic`.
- A referral link only counts for the instructor who owns it (no cross-instructor credit).

### Commission rules (data, not code)
Resolution order: active `promo` rule for instructor+source → `instructor` override → `default` for source.

Defaults (ADR-017):

| Source | Platform rate | Instructor gets |
|--------|--------------:|----------------:|
| instructor_referral | 3% | 97% |
| instructor_coupon | 3% | 97% |
| platform_organic | 40% | 60% |
| platform_paid | 50% | 50% |

Super admin edits rules in `/admin/settings/commission` (2FA + audit log). Changes apply to new orders only.

## 4. Gateway fees

Setting `gateway_fee_bearer`: `proportional` (default) | `platform`.

- `proportional`: the Paystack fee for the order is allocated to each line by net price, then split
  between instructor and platform by the commission rate. Prevents the platform losing money on
  3%-commission referral sales.
- Fees are read from the Paystack verify response (`fees` field), not estimated.

## 5. Ledger (double-entry)

Accounts (created lazily per instructor):

| Code | Type | Meaning |
|------|------|---------|
| `platform:cash:paystack` | asset | Balance held at Paystack |
| `platform:cash:bank` | asset | Settled to company bank |
| `platform:revenue` | revenue | Commission + fee recoveries |
| `platform:gateway_fees` | expense | Paystack charges |
| `platform:refund_losses` | expense | Fees not returned on refunds, chargeback losses |
| `instructor:{id}:pending` | liability | Earned, still refundable |
| `instructor:{id}:available` | liability | Releasable to instructor |
| `instructor:{id}:in_transit` | liability | Payout sent, awaiting confirmation |
| `instructor:{id}:receivable` | asset | Money owed back by instructor (chargebacks after payout) |

### Worked example — ₦10,000 course, organic (40%), Paystack fee ₦250, proportional fees

Instructor share of fee = 150, platform share = 100.

**Sale** (on verified payment):

| Account | Dr | Cr |
|---------|---:|---:|
| platform:cash:paystack | 9,750 | |
| platform:gateway_fees | 250 | |
| instructor:X:pending | | 5,850 |
| platform:revenue | | 4,150 |

(4,150 = 4,000 commission + 150 fee recovered from instructor. Net platform = 3,900.)

**Release** (refund window closed or non-refundable event):

| instructor:X:pending | 5,850 | |
| instructor:X:available | | 5,850 |

**Payout initiated:** Dr `available` / Cr `in_transit`. **Transfer success:** Dr `in_transit` / Cr `platform:cash:paystack`; transfer fee Dr `platform:gateway_fees` / Cr `platform:cash:paystack`. **Transfer failed/reversed:** Dr `in_transit` / Cr `available`.

**Refund before release** (learner gets ₦10,000 back; Paystack keeps its fee):

| instructor:X:pending | 5,850 | |
| platform:revenue | 4,150 | |
| platform:cash:paystack | | 10,000 |

Platform absorbs the ₦250 fee (it stays in `gateway_fees`). Instructor ends at ₦0 (ADR-020).

**Chargeback after payout:** Dr `instructor:X:receivable` for the instructor's share; future
earnings net against the receivable before payout.

**Settlement** from Paystack to bank: Dr `platform:cash:bank` / Cr `platform:cash:paystack`.
Operational note: payouts are sent from the Paystack balance — configure settlements (or top-ups)
so the balance covers each month's payout run.

### Posting API

```ts
await ledger.post(tx, {
  kind: 'sale',
  ref: { type: 'order', id: order.id },
  idempotencyKey: `sale:${order.id}`,
  lines: [
    { account: 'platform:cash:paystack', debit: 975000n },
    { account: 'platform:gateway_fees', debit: 25000n },
    { account: `instructor:${instructorId}:pending`, credit: 585000n },
    { account: 'platform:revenue', credit: 415000n },
  ],
})
```

`post()` rejects unbalanced entries, zero/negative lines, duplicate idempotency keys (returns the
existing entry), and currency mixes. Balances update in the same transaction with row locks taken
in account-id order (prevents deadlocks).

## 6. Checkout flow (web now, mobile later)

```
client            api/core                               Paystack
  │ checkout.start ─▶ price cart, create order(pending)
  │                   + items (snapshots)  [tx]
  │                   initialize transaction ───────────▶ (reference = order.public_id,
  │                                                        amount = total_kobo, email, metadata)
  │ ◀── { accessCode, reference }
  │ Paystack Popup (InlineJS) with accessCode
  │ onSuccess ─▶ checkout.confirm(reference)
  │                   completeOrder(reference) ─ verify ─▶ GET /transaction/verify/:ref
  │                                                        webhook charge.success ─▶ same completeOrder()
  │ ◀── { status: 'paid', enrollments }
```

`completeOrder(reference)` (idempotent, used by confirm, webhook and a reconciliation cron):
1. Call Paystack verify **outside** the DB transaction. Require `status=success`, amount == `total_kobo`, currency == order currency, reference matches.
2. Transaction: lock order `FOR UPDATE`; if already `paid` → return. Else set `paid`, set item statuses, compute `refundable_until = paid_at + refund_policy_days` (0 days → `non_refundable`, release immediately), post `sale` entry, create enrollments, record coupon redemption, write outbox events `order.paid`, `enrollment.created`.
3. After commit: invalidate caches for the learner (Continue buttons), send receipt email via event.

Abandoned orders: cron marks `pending` > 24 h as `abandoned` after a final verify call.
Reconciliation cron (hourly): verify any `pending` order < 24 h old that had a Paystack
initialization, in case both the redirect and the webhook were missed.

Mobile (Phase 14): same `checkout.start`; the app opens Paystack checkout in an in-app browser or
uses Paystack's mobile SDK with the access code, then calls `checkout.confirm`. Course purchases in
iOS/Android apps are subject to store rules on digital goods — Phase 14 decides (web purchase
link-out vs in-app purchase). Keep purchase logic provider-agnostic.

## 7. Refunds

### Eligibility engine (`core/refunds/eligibility.ts`, pure function)

Input: order item, course refund policy snapshot, now, consumption summary. Output:
`{ eligible: boolean, reasonCode, details }`.

Deny if any:
- `refund_policy_days_snapshot = 0` → `NO_REFUND_POLICY`
- `now > refundable_until` → `REFUND_WINDOW_CLOSED`
- watched ≥ `refund_consumption_threshold_pct` (setting, 30% — ADR-018) of course video duration → `CONTENT_CONSUMED`
- any `resource_download` of an `is_important` resource → `IMPORTANT_RESOURCE_DOWNLOADED`
- a certificate was issued → `CERTIFICATE_ISSUED`
- a final/certification exam attempt was started → `EXAM_STARTED`
- more than N refunds by this user in 90 days (abuse, setting default 3) → `REVIEW_REQUIRED` (goes to finance queue instead of auto-deny)

Otherwise → auto-approve.

The UI shows these rules **before purchase** (course page + checkout) and on the "Download"
button of important resources ("Downloading this makes your purchase non-refundable") with a
confirm step. The first consumption event that crosses a rule marks the item `non_refundable`
and releases the earning early.

### Processing
1. `refunds.request` → eligibility → `auto_approved`/`auto_denied`/`under_review`.
2. Approved → Inngest job calls Paystack Refund API → on `refund.processed` webhook: post refund ledger entry, revoke enrollment (and certificate if any — should not exist by rules), set statuses, notify both parties.
3. Denied → learner can appeal once → finance decides.

## 8. Earnings release (daily cron 02:00 Lagos)

Select `order_items` where `earning_status='pending'` and (`refundable_until < now()` or
`status='non_refundable'`) in batches of 500 → post `release` entries → set `available`.

## 9. Monthly payouts

- Cron on the 1st: create `payout_runs` draft for the previous month: every instructor with `available ≥ min_payout` (setting, default ₦5,000), active payout account, KYC verified, not suspended.
- Transfers go out on the 5th (next business day if it falls on a weekend/public holiday — ADR-019).
- Finance reviews the draft (totals, flagged instructors, anomalies like > 3× last month) and approves with 2FA; super admin co-signs if total > setting threshold.
- Processing job: post `payout initiated` entries, send Paystack **bulk transfers** in chunks within Paystack's documented batch limit, store transfer codes. OTP for transfers must be disabled on the Paystack account for API transfers (security: restrict the secret key, IP-allowlist on Paystack if available).
- Webhooks `transfer.success` / `transfer.failed` / `transfer.reversed` update items and post ledger entries. Failed items roll over to next month and notify the instructor to fix bank details.
- Generate monthly PDF statements (sales, refunds, fees, commission, payout) per instructor.
- Instructors see: pending (with release dates), available, in transit, paid, and full line-item history in `/teach/earnings`.

## 10. Taxes

VAT (7.5%) on platform commission and withholding-tax obligations must be confirmed with an
accountant (ADR Q6). Design: a `tax_rules` setting and extra ledger lines (`tax:vat_payable`)
posted in the sale entry once confirmed. Do not hardcode.

## 11. Subscriptions pool (Phase 12, design now)

- Monthly/annual plans via Paystack Subscriptions. Revenue recognized monthly.
- Pool = net subscription revenue × `pool_share_bps` (setting, e.g. 50%).
- Only courses with `subscription_opt_in = true` are in the subscription catalog and share the pool.
- Allocation: engaged minutes from `lesson_progress` heartbeats of subscribers on opted-in courses (cap per learner per course per day to prevent farming, e.g. 180 min) → instructor share = pool × their minutes / all minutes. Posted as `pool_allocation` entries into instructors' `available` after the month closes (no refunds on pool money).

## 12. Tests that must exist

- Allocation sums always equal totals (property-based test with fast-check).
- Every flow (sale, release, refund before release, payout success/failure/reversal, chargeback) leaves the ledger balanced and accounts at expected values.
- `completeOrder` idempotency: 3 concurrent calls → one sale entry, one set of enrollments.
- Webhook replay (same event twice) → no double effects.
- Amount-mismatch verification → order stays pending + Sentry alert.

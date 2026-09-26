# 19 — Concerns and Risks

## 1. Scope vs timeline (biggest risk)

The v1 feature list is a large product for one developer in 3–4 months, even with Claude Code.
Rough effort (focused weeks, including tests):

| Phases | Area | Weeks |
|--------|------|------:|
| 0–1 | Foundations, auth | 1.5 |
| 2 | Instructor onboarding, KYC, course builder, uploads | 2 |
| 3 | Catalog, course pages, search, SEO | 1 |
| 4 | Commerce, coupons, referrals, commission, ledger | 2 |
| 5 | Player, progress, drip, notes, streaks | 1.5 |
| 6 | Quizzes, exams, assignments | 2 |
| 7 | Certificates | 0.5 |
| 8 | Cohorts, community, live | 2 |
| 9 | Reviews, wishlist, badges, notifications | 1 |
| 10 | Refunds, payouts, statements, admin | 2 |
| 11 | Hardening, load tests, launch | 1.5 |
| **Total** | | **~19 weeks** |

That is ~4.5 months at a steady pace. Recommendations:
- **Launch gate** = phases 0–7, 10, 11 (≈ 14 weeks). Ship cohorts/community/live (8) and engagement (9) in the weeks right after launch behind feature flags.
- Payouts only need to work by the end of the first month after launch (first payout date), so Phase 10 payout processing can finish in launch week +2 if needed; refunds must be ready at launch.
- Seed the marketplace with 5–10 committed instructors before launch; a marketplace with empty shelves fails regardless of code quality.

## 2. Business/legal risks

- Holding instructor funds (ADR-003) — legal review.
- VAT/WHT on commission — accountant.
- Content rights and piracy — instructor agreement, takedown process, watermark now, DRM later.
- App store rules for selling courses in the mobile app — decide in Phase 14.

## 3. Technical risks

| Risk | Mitigation |
|------|-----------|
| Next.js 16 Cache Components edge cases (new model) | Keep dynamic parts in Suspense; follow official docs; write E2E tests on caching/invalidation |
| oRPC v1 → v2 migration later | Contract-first isolates change; upgrade in one PR with the contract tests as safety net |
| Paystack outage | Show clear error, keep cart; reconciliation cron; consider Flutterwave as secondary provider behind the same interface (Phase 16) |
| Bunny processing delays | Instructor sees status; job retries; alert when stuck > 1 h |
| Neon cold starts on free plan | Paid plan with minimum compute before launch |
| Vercel cost spikes | Spend limits; caching; image variants from R2 |
| Single developer bus factor | These guides, ADRs, runbooks; tests as documentation |

## 4. Product risks

- Refund rules feel harsh → show them clearly before purchase; allow instructor to be more generous (longer window up to 14 days).
- Certificate credibility → verification page, exam integrity, instructor vetting, revocation.
- Low completion rates → drip, streaks, reminders, cohorts.

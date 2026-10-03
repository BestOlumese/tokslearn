# Phase 9 — Engagement (reviews, notifications centre, polish)

**Prompt:** Read CLAUDE.md, `docs/10 §12`, `docs/13 §3`. Execute Phase 9.

**Screens, errors, emails, events:** build every row marked Ph 9 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] Reviews: eligibility, create/edit, instructor reply, reporting, stats job, display rules (≥ 3 reviews to show rating), course page + instructor page integration, JSON-LD aggregateRating. PR 1 of 3 (ADR-040).
- [ ] Notifications centre: bell, list, mark read/all read, preferences page (per type × channel), digest batching.
- [ ] Wishlist polish: price-drop notification (when an instructor lowers price or runs a coupon on a wishlisted course; opt-in).
- [ ] Badge showcase on learner profile (opt-in public).
- [ ] Procedures: `reviews.*` ✓, `studio.reviews.reply` ✓ (PR 1), `notifications.list`, `notifications.unreadCount`, `notifications.markRead`, `notifications.preferences.*`.

## Acceptance
- [x] Ineligible learners cannot review (test). One review per learner per course. `reviews.int.test.ts`: under 20% and 30 minutes → REVIEW_NOT_ELIGIBLE; writing again edits the one row.
- [ ] Unread count query uses the index (EXPLAIN in PR).
- [ ] Preferences respected for every non-security notification type (test matrix).

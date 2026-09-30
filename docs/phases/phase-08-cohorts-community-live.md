# Phase 8 — Cohorts, Community and Live Classes

**Prompt:** Read CLAUDE.md, `docs/10 §9–11`, `docs/09 §6`. Build behind feature flags
`cohorts`, `community`, `live`. Execute Phase 8.

**Screens, errors, emails, events:** build every row marked Ph 8 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] Cohorts: tables, studio UI (create runs, capacity, windows, schedule), cohort selection on course page/checkout, capacity reservation (in Postgres, ADR-037), cohort home page. PR 1 of 3; the cohort home gains announcements, discussion and live sessions with PRs 2 and 3.
- [x] Community: threads/posts/reactions/reports/thread_reads; course, cohort and lesson scopes; Q&A with instructor answers + accepted answer; announcements (email; the in-app notification centre is Phase 9); moderation tools; sanitization; mentions. PR 2 of 3 (ADR-038).
- [ ] Live: Daily integration (rooms, meeting tokens, webhooks), schedule UI, join page with Daily Prebuilt (loaded only there), join window, attendance, reminders, recording import to Bunny, cost guards.
- [ ] Procedures: `cohorts.*`, `studio.cohorts.*`, `community.listThreads`, `community.getThread`, `community.createThread`, `community.reply`, `community.react`, `community.acceptAnswer`, `community.report`, `community.moderate`, `live.list`, `live.join`, `studio.live.*`.

## Acceptance
- [x] Cohort capacity cannot be oversold under 50 concurrent checkouts (test). `cohorts/race.int.test.ts`: 50 checkouts for a run of 10 sell exactly 10; the other 40 get COHORT_FULL.
- [ ] Learner not in cohort cannot join its live session or read its threads. Threads done (`community.int.test.ts`: a learner of the course outside the run gets THREAD_NOT_FOUND and doesn't see it listed); the live part comes with PR 3.
- [ ] Recording appears on the lesson after the session (E2E with Daily test room).
- [x] Posting HTML with scripts is sanitized (test). `community.int.test.ts`: a script tag becomes text, a javascript: link and an image node are dropped.

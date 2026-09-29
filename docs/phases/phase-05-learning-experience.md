# Phase 5 — Learning Experience

**Prompt:** Read CLAUDE.md, `docs/09 §3–4`, `docs/10 §2–4`, `docs/12 §6`. Execute Phase 5.

**Screens, errors, emails, events:** build every row marked Ph 5 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] Player route `/learn/[courseSlug]/[lessonId]`: layout, outline with access/lock states, next/previous, keyboard shortcuts, mobile bottom sheet outline.
- [x] Video: facade → `learn.playback` (returns `embedUrl`, `hlsUrl`, `expiresAt`, `resumeAt`) → Bunny iframe + player.js events; watermark overlay.
- [x] Heartbeats (`progress.heartbeat`, `sendBeacon` fallback: `fetch` with `keepalive`, ADR-034), `progress.syncBatch` (for mobile later), server clamping, completion computation, course progress update, `lesson.completed` event.
- [x] Article lessons (server-rendered HTML), resource downloads with important-resource confirm + consumption logging.
- [x] Drip unlock computation + locked lesson UI + unlock notification job. (Plus the studio drip page, which didn't exist yet.)
- [x] Notes (timestamped) + bookmarks; notes export as Markdown.
- [x] Streaks: `activity_days`, `streaks`, rollover job, freeze tokens; small streak indicator in dashboard.
- [x] Badges: tables, seed v1 badges, evaluator functions.
- [x] Learner dashboard: continue learning, progress per course, streak, recent certificates (placeholder: the Completed tab says certificates appear there; Phase 7).
- [x] Procedures: `learn.getCourseOutline`, `learn.getLesson`, `learn.playback`, `learn.resourceDownload`, `progress.heartbeat`, `progress.syncBatch`, `progress.getCourse`, `notes.*`, `bookmarks.*`, `engagement.getStreak`, `engagement.listBadges`. (Also `learn.continue`, `progress.markComplete`, `studio.drip.*`, `studio.learners.list`.)

## Acceptance
- [x] Non-enrolled users cannot obtain playback or resource URLs (tests). (`learning.int.test.ts` in core and api: strangers, visitors and revoked learners.)
- [ ] Refresh mid-video resumes within 20 s of last position. (Core test, and in a browser against a player.js stand-in: refreshed at ~0:24, resumed at 0:23. Needs the owner's check on the preview with real Bunny video.)
- [x] Fake watch-time (heartbeats claiming 10 min in 1 min) is clamped (test). (Three beats claiming 600 s, 20 s apart, credit 45 s each.)
- [x] Downloading an important resource marks item non-refundable and releases earning (integration test). (Also: 30% of the video watched does the same.)
- [x] Player shell INP < 200 ms on mid-range Android profile. (Moto G4 emulation, 4× CPU, slow 4G: worst interaction 80 ms, opening the outline sheet.)

Notes: Q&A and announcements tabs arrive with Phase 8, certificates with Phase 7. Badges are awarded by
the `badges-evaluate` Inngest job, so they appear a few seconds after the lesson that earns them.

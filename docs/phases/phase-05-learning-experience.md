# Phase 5 — Learning Experience

**Prompt:** Read CLAUDE.md, `docs/09 §3–4`, `docs/10 §2–4`, `docs/12 §6`. Execute Phase 5.

**Screens, errors, emails, events:** build every row marked Ph 5 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [ ] Player route `/learn/[courseSlug]/[lessonId]`: layout, outline with access/lock states, next/previous, keyboard shortcuts, mobile bottom sheet outline.
- [ ] Video: facade → `learn.playback` (returns `embedUrl`, `hlsUrl`, `expiresAt`, `resumeAt`) → Bunny iframe + player.js events; watermark overlay.
- [ ] Heartbeats (`progress.heartbeat`, `sendBeacon` fallback), `progress.syncBatch` (for mobile later), server clamping, completion computation, course progress update, `lesson.completed` event.
- [ ] Article lessons (server-rendered HTML), resource downloads with important-resource confirm + consumption logging.
- [ ] Drip unlock computation + locked lesson UI + unlock notification job.
- [ ] Notes (timestamped) + bookmarks; notes export as Markdown.
- [ ] Streaks: `activity_days`, `streaks`, rollover job, freeze tokens; small streak indicator in dashboard.
- [ ] Badges: tables, seed v1 badges, evaluator functions.
- [ ] Learner dashboard: continue learning, progress per course, streak, recent certificates (placeholder).
- [ ] Procedures: `learn.getCourseOutline`, `learn.getLesson`, `learn.playback`, `learn.resourceDownload`, `progress.heartbeat`, `progress.syncBatch`, `progress.getCourse`, `notes.*`, `bookmarks.*`, `engagement.getStreak`, `engagement.listBadges`.

## Acceptance
- [ ] Non-enrolled users cannot obtain playback or resource URLs (tests).
- [ ] Refresh mid-video resumes within 20 s of last position.
- [ ] Fake watch-time (heartbeats claiming 10 min in 1 min) is clamped (test).
- [ ] Downloading an important resource marks item non-refundable and releases earning (integration test).
- [ ] Player shell INP < 200 ms on mid-range Android profile.

# Phase 3 — Catalog and Discovery

**Prompt:** Read CLAUDE.md, `docs/12`, `docs/11 §5`, `docs/03 §5`, `docs/05` (catalog). Execute Phase 3.

**Screens, errors, emails, events:** build every row marked Ph 3 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [x] `course_search` table + reindex (inline in the approval transaction, ADR-032); FTS (weighted: title A, subtitle/tags B, description C, instructor name B) + trigram fallback for typos.
- [x] Pages (static shells + cached data + streamed user bits):
  - [x] Home (`11 §5` pattern), categories index, category page, all courses with filters (price, level, rating, duration, certificate, language), search results.
  - [x] Course landing page: sticky purchase panel (price, refund policy in plain words, certificate type, includes), curriculum with preview lessons, instructor block, reviews block (placeholder until Phase 9), FAQ.
  - [x] Instructor public profile.
- [x] Preview lesson playback (facade + tokenized embed) for visitors.
- [x] `generateStaticParams` for top courses; ISR for the rest; cache tags + invalidation on publish/update.
- [x] SEO: metadata, OG images, JSON-LD, sitemap split, robots, slug redirects.
- [x] Procedures: `catalog.home`, `catalog.categories`, `courses.list`, `courses.search`, `courses.getBySlug`, `courses.getCurriculum`, `instructors.getBySlug`, `learn.previewPlayback`.

## Acceptance
- [x] Lighthouse mobile ≥ 95 perf / 100 a11y / 100 SEO on home, catalog, course, instructor pages. (Local production build, 2026-09-27: perf 0.99–1.0, a11y/BP/SEO 1.0, CLS 0 on the eight public routes checked. CI runs the same on previews.)
- [ ] Rich Results test passes for a course page. (Owner, on production: search.google.com/test/rich-results with a live course URL.)
- [x] Publishing/updating a course updates its page within seconds (tag invalidation) — E2E test. (`e2e/catalog-publish.spec.ts`, live in under 5 s; needs the demo catalog, so it runs locally.)
- [x] Search finds "javascrpit" → JavaScript courses (trigram). (`catalog.int.test.ts`)
- [x] Design audit clean; copy check clean. (No overflow at 360/768/1280, copy check OK, JS 142.5–144.0 KB of 145.)

Also shipped: `/admin/courses` (feature, unpublish, restore with reasons), `/admin/categories` (tree editing and ordering), studio trailer upload and course URL editing, catalog analytics events, `pnpm db:seed:demo-catalog`.

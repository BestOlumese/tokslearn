# Phase 3 — Catalog and Discovery

**Prompt:** Read CLAUDE.md, `docs/12`, `docs/11 §5`, `docs/03 §5`, `docs/05` (catalog). Execute Phase 3.

**Screens, errors, emails, events:** build every row marked Ph 3 in `docs/20-screen-inventory.md`, and wire the matching error codes (`21`), emails (`23`) and analytics events (`24`).

## Tasks
- [ ] `course_search` table + reindex job; FTS (weighted: title A, subtitle/tags B, description C, instructor name B) + trigram fallback for typos.
- [ ] Pages (static shells + cached data + streamed user bits):
  - [ ] Home (`11 §5` pattern), categories index, category page, all courses with filters (price, level, rating, duration, certificate, language), search results.
  - [ ] Course landing page: sticky purchase panel (price, refund policy in plain words, certificate type, includes), curriculum with preview lessons, instructor block, reviews block (placeholder until Phase 9), FAQ.
  - [ ] Instructor public profile.
- [ ] Preview lesson playback (facade + tokenized embed) for visitors.
- [ ] `generateStaticParams` for top courses; ISR for the rest; cache tags + invalidation on publish/update.
- [ ] SEO: metadata, OG images, JSON-LD, sitemap split, robots, slug redirects.
- [ ] Procedures: `catalog.home`, `catalog.categories`, `courses.list`, `courses.search`, `courses.getBySlug`, `courses.getCurriculum`, `instructors.getBySlug`, `learn.previewPlayback`.

## Acceptance
- [ ] Lighthouse mobile ≥ 95 perf / 100 a11y / 100 SEO on home, catalog, course, instructor pages.
- [ ] Rich Results test passes for a course page.
- [ ] Publishing/updating a course updates its page within seconds (tag invalidation) — E2E test.
- [ ] Search finds "javascrpit" → JavaScript courses (trigram).
- [ ] Design audit clean; copy check clean.

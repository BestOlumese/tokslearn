# 12 — Performance and SEO

## 1. Budgets (enforced in CI with Lighthouse CI on preview deploys)

| Metric | Public pages (mobile, throttled) | App pages (authed) |
|--------|-------------------------------|-------------------|
| Lighthouse Performance | ≥ 95 | ≥ 85 |
| Lighthouse Accessibility | 100 | 100 |
| Lighthouse SEO / Best practices | 100 | ≥ 95 |
| LCP | < 2.0 s | < 2.5 s |
| CLS | < 0.05 | < 0.1 |
| INP | < 200 ms | < 200 ms |
| First-load JS (gzipped) | < 145 KB | < 200 KB |

First-load JS is measured by `scripts/check-bundle-size.mjs` on the production build (gzip, `noModule` polyfills excluded). The Next.js 16 + React 19 runtime alone is ~130 KB of it, so app code on public pages gets ~15 KB (ADR-026).

How CI measures (ADR-045): category scores and CLS with Lighthouse's simulated slow 4G; LCP in a second pass under real slow-4G throttling (`LHCI_PASS=lcp`), median of 3 runs.

Checked routes: `/`, `/courses`, `/courses/[slug]` (a seeded course), `/instructors/[slug]`, `/verify/[code]`, `/sign-in`.

## 2. Rendering rules

1. **Server Components by default.** A `"use client"` file needs a comment explaining why.
2. Push client boundaries to leaves: the "Add to cart" button is a client component; the course page is not.
3. Every user-specific or request-specific read (`cookies()`, `headers()`, `searchParams`, session) sits inside a `<Suspense>` with a layout-matching skeleton so the static shell is prerendered.
4. Cache public data with `'use cache'` + `cacheLife` + `cacheTag`. Invalidate precisely with tags on writes (see `03 §5`).
5. Parallelize data fetching: start independent promises before awaiting (`Promise.all`); avoid waterfalls between nested Server Components (pass promises down or fetch in parallel at the top).
6. Pass only the fields the client needs across the server→client boundary (RSC payload size).
7. Enable `partialPrefetching` (Next 16.3) with Cache Components for instant navigation between catalog/course pages once stable in our tests.

## 3. Asset rules

- Images: `next/image` with explicit `width`/`height` or `fill` + sized parent; `sizes` always set; `priority` only on the LCP image of that route; AVIF/WebP variants from our upload pipeline (custom loader). Covers are 16:9.
- Fonts: `next/font` (self-hosted, `display: swap`, preloaded, subsets). Max 2 families on a page.
- Third-party scripts: none on public pages at load. PostHog loaded with `next/script` `strategy="lazyOnload"` after first interaction or idle; Paystack InlineJS loaded only on checkout; Daily only on live page; Bunny iframe only after click (facade).
- No heavy libraries on public routes: no charting, no editor, no date library (use `Intl`), no lodash. Use `import` of individual Lucide icons.
- Use `optimizePackageImports` for icon/util packages if needed; check bundles with `@next/bundle-analyzer` per PR that adds a dependency.

## 4. Data and API performance

- Indexed queries only on hot paths (see `05 §3`). p95 read < 300 ms measured at the API.
- Rate-limit and debounce chatty clients (heartbeats, autosave, search-as-you-type 250 ms).
- Search endpoint cached (`'use cache'`, `cacheLife('minutes')`) by normalized query.
- Avoid N+1: repo functions take arrays; use `inArray` batch loads; relational queries with explicit `columns`.
- Keep transactions short; never call third-party APIs inside a DB transaction.

## 5. SEO

- Per-route `generateMetadata`: unique title (`{Course title} — {Instructor} | Tokslearn`, ≤ 60 chars), description (≤ 155 chars, real content), canonical URL, Open Graph + Twitter cards.
- Dynamic OG images via `opengraph-image.tsx` for courses, instructors, certificates (Satori, cached).
- JSON-LD: `Course` (+ `hasCourseInstance` for cohorts, `offers` with NGN price, `aggregateRating` only with ≥ 3 reviews), `Person` for instructors, `BreadcrumbList`, `EducationalOccupationalCredential` on verify pages, `Organization` + `WebSite` with `SearchAction` on home.
- `sitemap.ts` split by type (courses, categories, instructors) with `lastModified`; regenerate on publish events (tag invalidation). `robots.ts` disallows `/learn`, `/teach`, `/admin`, `/account`, `/api`.
- Clean URLs: `/courses/{slug}`, `/categories/{slug}`, `/instructors/{slug}`. Slug changes create 301 redirects (`slug_redirects` table checked in `proxy.ts` via a cached map, or in the page's not-found path).
- Course pages must render full content server-side (description, curriculum titles, instructor bio, reviews) — crawlable without JS.
- Performance is SEO: keep Core Web Vitals green in field data (check Search Console monthly).

## 6. Nigerian network reality

- Test on "Slow 4G" and a mid-range Android (e.g. Moto G-class) profile. Most learners are on mobile data.
- Offer lower video renditions by default on slow connections (Bunny ABR handles it; start at 480p when `navigator.connection.effectiveType` is `3g` or `saveData` is on).
- Respect `Save-Data`: skip autoplay previews and decorative images.
- Keep the course player shell usable before video loads (outline, notes).

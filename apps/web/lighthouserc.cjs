// Lighthouse CI budgets (docs/12 §1). Mobile emulation with throttling is the default preset.
// Previews are noindex on purpose, so the crawlability audit is skipped there.
const base = process.env.LHCI_BASE_URL ?? 'http://localhost:3000'
// Course and instructor slugs differ per database, so they come in as extra routes, e.g.
// LHCI_EXTRA_ROUTES=/courses/excel-for-accountants,/instructors/tobi-adeleke
const extra = (process.env.LHCI_EXTRA_ROUTES ?? '').split(',').filter(Boolean)
// /verify/TL-C-0000-0000 is the not-found state: previews have no certificates to show.
const routes = [
  '/',
  '/courses',
  '/categories',
  '/search?q=excel',
  '/sign-in',
  '/verify',
  '/verify/TL-C-0000-0000',
  ...extra,
]
// Vercel Deployment Protection bypass for previews (same secret as Playwright).
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

// Two passes (ADR-045), chosen with LHCI_PASS:
// - `scores` (default): Lighthouse's simulated slow 4G, for the category scores and CLS.
// - `lcp`: real slow-4G throttling, for LCP only. The simulation counts every script that finished
//   loading before the observed LCP as render-blocking; on a CI runner next to Vercel the ~150 KB
//   of async JS finishes before the first paint, so it charges ~0.9 s that a visitor on a slow
//   network, whose browser paints the HTML and the cover image first, never waits for. With a real
//   cover as the first card, /courses read 2.74 s simulated and 1.5–1.65 s throttled (2026-10-04).
const lcpPass = process.env.LHCI_PASS === 'lcp'

module.exports = {
  ci: {
    collect: {
      url: routes.map((r) => `${base}${r}`),
      numberOfRuns: 3,
      settings: {
        skipAudits: ['is-crawlable'],
        ...(lcpPass ? { throttlingMethod: 'devtools', onlyCategories: ['performance'] } : {}),
        // Vercel injects its preview toolbar (vercel.live) into every preview, never production.
        // When it starts loading before the first paint, the slow-4G simulation counts a whole
        // extra connection against LCP (+~1.4 s on /categories, 2026-09-30). Measure what
        // visitors get: production has no toolbar.
        blockedUrlPatterns: ['*vercel.live*'],
        // Lighthouse sends extra headers with every page request, but fetches robots.txt on its
        // own, so the scores pass also asks for the bypass cookie (otherwise robots.txt is
        // Vercel's login page and SEO fails). The cookie costs a redirect on the first request,
        // which real throttling would add to LCP, so the LCP pass goes without.
        ...(bypass
          ? {
              extraHeaders: JSON.stringify({
                'x-vercel-protection-bypass': bypass,
                ...(lcpPass ? {} : { 'x-vercel-set-bypass-cookie': 'true' }),
              }),
            }
          : {}),
      },
    },
    assert: {
      assertions: lcpPass
        ? { 'largest-contentful-paint': ['error', { maxNumericValue: 2000 }] }
        : {
            'categories:performance': ['error', { minScore: 0.95 }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['error', { minScore: 0.95 }],
            'categories:seo': ['error', { minScore: 1 }],
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
          },
    },
    upload: { target: 'temporary-public-storage' },
  },
}

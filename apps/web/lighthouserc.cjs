// Lighthouse CI budgets (docs/12 §1). Mobile emulation with throttling is the default preset.
// Previews are noindex on purpose, so the crawlability audit is skipped there.
const base = process.env.LHCI_BASE_URL ?? 'http://localhost:3000'
// Course and instructor slugs differ per database, so they come in as extra routes, e.g.
// LHCI_EXTRA_ROUTES=/courses/excel-for-accountants,/instructors/tobi-adeleke
const extra = (process.env.LHCI_EXTRA_ROUTES ?? '').split(',').filter(Boolean)
const routes = ['/', '/courses', '/categories', '/search?q=excel', '/sign-in', '/verify', ...extra]
// Vercel Deployment Protection bypass for previews (same secret as Playwright).
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

module.exports = {
  ci: {
    collect: {
      url: routes.map((r) => `${base}${r}`),
      numberOfRuns: 3,
      settings: {
        skipAudits: ['is-crawlable'],
        ...(bypass
          ? {
              extraHeaders: JSON.stringify({
                'x-vercel-protection-bypass': bypass,
                'x-vercel-set-bypass-cookie': 'true',
              }),
            }
          : {}),
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.95 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 1 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
      },
    },
    upload: { target: 'temporary-public-storage' },
  },
}

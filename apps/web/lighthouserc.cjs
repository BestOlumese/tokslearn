// Lighthouse CI budgets (docs/12 §1). Mobile emulation with throttling is the default preset.
// Previews are noindex on purpose, so the crawlability audit is skipped there.
const base = process.env.LHCI_BASE_URL ?? 'http://localhost:3000'
const routes = ['/', '/courses', '/sign-in', '/verify']

module.exports = {
  ci: {
    collect: {
      url: routes.map((r) => `${base}${r}`),
      numberOfRuns: 3,
      settings: { skipAudits: ['is-crawlable'] },
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

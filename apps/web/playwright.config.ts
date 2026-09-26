import { defineConfig, devices } from '@playwright/test'

// Smoke tests (docs/15 §3). Locally they start `next start`; in CI, PLAYWRIGHT_BASE_URL points
// at the preview deployment.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

// Vercel Deployment Protection: previews redirect to a login page unless automation sends this.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const extraHTTPHeaders = bypass
  ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
  : undefined

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'on-first-retry', ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}) },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm start',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})

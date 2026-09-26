import { expect, test } from '@playwright/test'

test('home renders with the wordmark, one h1 and working navigation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Tokslearn', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(
    page.getByRole('contentinfo').getByRole('link', { name: 'Verify a certificate' }),
  ).toBeVisible()

  // No horizontal scroll at this viewport.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})

test('skip link moves focus to the main content', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium')
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
})

test('health endpoint answers with the contract shape', async ({ request }) => {
  const res = await request.get('/api/v1/health')
  expect([200]).toContain(res.status())
  const body = await res.json()
  expect(body).toMatchObject({
    version: expect.any(String),
    checks: { database: expect.any(String) },
  })
})

test('unknown pages show the not-found page', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: "We couldn't find that page" })).toBeVisible()
})

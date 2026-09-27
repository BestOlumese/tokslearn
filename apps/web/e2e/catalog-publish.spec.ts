import { expect, test } from '@playwright/test'

// Phase 3 acceptance: a published change reaches the course page within seconds (tag
// invalidation, docs/03 §5). Needs the demo catalog and demo passwords on the app's database:
//   pnpm db:seed && SEED_PASSWORD=demo-password-2026 pnpm --filter @tokslearn/auth seed:passwords
//   pnpm db:seed:demo-catalog
// then E2E_DEMO_CATALOG=1. Skipped against preview deployments, which have no demo data.

const slug = 'excel-for-accountants'

interface StudioCourse {
  id: string
  version: number
  tags: string[]
  revision: {
    title: string
    subtitle: string | null
    descriptionDoc: unknown
    outcomes: string[]
    requirements: string[]
    level: string
    language: string
    categoryId: string | null
    coverFileId: string | null
  }
}

test('an approved subtitle fix shows on the course page within seconds', async ({
  page,
  request,
  baseURL,
}, info) => {
  test.skip(!process.env.E2E_DEMO_CATALOG, 'needs the demo catalog (see top of file)')
  test.skip(info.project.name !== 'desktop', 'edits shared data; run once')
  const origin = { origin: baseURL ?? '' }

  const signIn = await request.post('/api/auth/sign-in/email', {
    headers: origin,
    data: { email: 'instructor@tokslearn.test', password: 'demo-password-2026' },
  })
  expect(signIn.ok()).toBe(true)

  const list = await request.get('/api/v1/studio/courses', { headers: origin })
  const rows = (await list.json()) as Array<{ id: string; slug: string }>
  const id = rows.find((r) => r.slug === slug)?.id
  expect(id).toBeTruthy()
  const s = (await (
    await request.get(`/api/v1/studio/courses/${id}`, { headers: origin })
  ).json()) as StudioCourse

  // Toggle one letter so the change counts as a small fix and is approved at once.
  const current = s.revision.subtitle ?? ''
  const next = current.endsWith('nights') ? current.slice(0, -1) : `${current.replace(/s$/, '')}s`

  await page.goto(`/courses/${slug}`)
  await expect(page.getByText(current, { exact: true })).toBeVisible()

  const saved = await request.post(`/api/v1/studio/courses/${id}/details`, {
    headers: origin,
    data: {
      courseId: s.id,
      version: s.version,
      title: s.revision.title,
      subtitle: next,
      description: s.revision.descriptionDoc,
      outcomes: s.revision.outcomes,
      requirements: s.revision.requirements,
      level: s.revision.level,
      language: s.revision.language,
      categoryId: s.revision.categoryId,
      coverFileId: s.revision.coverFileId,
      tags: s.tags,
    },
  })
  expect(saved.ok()).toBe(true)
  const edited = (await saved.json()) as StudioCourse
  const submitted = await request.post(`/api/v1/studio/courses/${id}/submit`, {
    headers: origin,
    data: { courseId: s.id, version: edited.version },
  })
  expect(((await submitted.json()) as { outcome: string }).outcome).toBe('auto_approved')

  await expect
    .poll(
      async () => {
        await page.goto(`/courses/${slug}`)
        return page.getByText(next, { exact: true }).isVisible()
      },
      { timeout: 10_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true)
})

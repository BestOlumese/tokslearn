import { createRouterClient } from '@orpc/server'
import { resetFeatureFlagCache } from '@tokslearn/core/admin'
import { closeTestDb, seed, withRollback } from '@tokslearn/db/testing'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { router } from './router'
import { testContext } from './test-context'

afterAll(closeTestDb)
beforeEach(resetFeatureFlagCache)

const admin = {
  kind: 'user' as const,
  userId: '0190a000-0000-7000-8000-000000000001',
  sessionId: 's',
  roles: ['admin' as const],
}

describe('admin feature flag procedures', () => {
  it('lists and toggles flags, returning contract DTOs', async () => {
    await withRollback(async (db) => {
      await seed(db)
      const client = createRouterClient(router, { context: testContext({ db, actor: admin }) })
      const { items } = await client.admin.listFeatureFlags()
      expect(items.map((f) => f.key)).toContain('maintenance_mode')

      const updated = await client.admin.setFeatureFlag({ key: 'live_classes', enabled: true })
      expect(updated.enabled).toBe(true)
      expect(typeof updated.updatedAt).toBe('string')
    })
  })

  it('returns STAFF_ONLY for a signed-in learner', async () => {
    await withRollback(async (db) => {
      const learner = { ...admin, roles: ['learner' as const] }
      const client = createRouterClient(router, { context: testContext({ db, actor: learner }) })
      await expect(client.admin.listFeatureFlags()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { code: 'STAFF_ONLY' },
      })
    })
  })
})

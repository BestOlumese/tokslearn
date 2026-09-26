import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { featureFlags, outbox } from './schema'
import { seed } from './seed'
import { closeTestDb, withRollback } from './testing'

afterAll(closeTestDb)

describe('phase 0 schema', () => {
  it('applies migrations and seeds default flags', async () => {
    await withRollback(async (db) => {
      await seed(db)
      const [flag] = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, 'maintenance_mode'))
      expect(flag?.enabled).toBe(false)
    })
  })

  it('defaults new outbox rows to pending with a UUIDv7 id', async () => {
    await withRollback(async (db) => {
      const [row] = await db
        .insert(outbox)
        .values({ eventName: 'test.created', payload: { a: 1 } })
        .returning()
      expect(row?.status).toBe('pending')
      expect(row?.id.charAt(14)).toBe('7')
    })
  })
})

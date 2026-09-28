import { schema } from '@tokslearn/db'
import { closeTestDb, withRollback } from '@tokslearn/db/testing'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { insertUser } from '../kernel/testing'
import { loadUserActor } from '.'

afterAll(closeTestDb)

describe('loadUserActor', () => {
  it('reads the verified email flag from the database, not the session snapshot', async () => {
    await withRollback(async (db) => {
      const userId = await insertUser(db)
      await db.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, userId))
      const session = {
        userId,
        sessionId: '01920000-0000-7000-8000-00000000beef',
        emailVerified: true,
        twoFactorEnabled: false,
      }
      expect((await loadUserActor(db, session)).emailVerified).toBe(false)
      // Verified after sign-in (e.g. by support): counts at once, the snapshot still says false.
      await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, userId))
      const actor = await loadUserActor(db, { ...session, emailVerified: false })
      expect(actor).toMatchObject({
        emailVerified: true,
        twoFactorEnabled: false,
        twoFactorVerifiedAt: null,
        roles: ['learner'],
      })
      // A user row that vanished falls back to the session.
      expect(
        (await loadUserActor(db, { ...session, userId: '01920000-0000-7000-8000-00000000dead' }))
          .emailVerified,
      ).toBe(true)
    })
  })
})

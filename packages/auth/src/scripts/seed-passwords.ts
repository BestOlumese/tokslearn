// Gives the demo users (packages/db seed) a password so they can sign in locally and on
// previews. Refuses to run against production. Usage:
//   SEED_PASSWORD='choose-one-10+' pnpm --filter @tokslearn/auth seed:passwords
import { createDb, newId, schema, seedUsers } from '@tokslearn/db'
import { hashPassword } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'

const url = process.env.DATABASE_URL
const password = process.env.SEED_PASSWORD
if (!url) throw new Error('Set DATABASE_URL')
if (process.env.NEXT_PUBLIC_APP_ENV === 'production') throw new Error('Not in production')
if (!password || password.length < 10) throw new Error('Set SEED_PASSWORD (10+ characters)')

const { db, close } = createDb(url, { max: 1, tcp: true })
try {
  const hash = await hashPassword(password)
  for (const u of seedUsers) {
    const [existing] = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, 'credential')))
    if (existing) {
      await db
        .update(schema.account)
        .set({ password: hash })
        .where(eq(schema.account.id, existing.id))
    } else {
      await db.insert(schema.account).values({
        id: newId(),
        userId: u.id,
        providerId: 'credential',
        accountId: u.id,
        password: hash,
      })
    }
  }
  console.info(`Passwords set for ${seedUsers.length} demo users (emails end in @tokslearn.test).`)
} finally {
  await close()
}

import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../client'
import { featureFlags, settings, user, userRoles } from '../schema'
import { seedFeatureFlags, seedSettings, seedUsers } from './data'

/** Demo users and roles (idempotent). Callers must refuse to run this in production. */
export async function seedDemoUsers(db: Db): Promise<void> {
  await db
    .insert(user)
    .values(
      seedUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        emailVerified: true,
      })),
    )
    .onConflictDoNothing()
  await db
    .insert(userRoles)
    .values(seedUsers.flatMap((u) => u.roles.map((role) => ({ userId: u.id, role }))))
    .onConflictDoNothing()
}

/** Idempotent: re-running updates descriptions but never flips a flag someone changed. */
export async function seed(db: Db): Promise<void> {
  await db
    .insert(settings)
    .values(seedSettings.map((s) => ({ key: s.key, value: s.value })))
    .onConflictDoNothing()

  await db
    .insert(featureFlags)
    .values([...seedFeatureFlags])
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { description: sql`excluded.description` },
    })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Set DATABASE_URL to seed.')
    process.exit(1)
  }
  const handle = createDb(url, { max: 1, tcp: true })
  try {
    await seed(handle.db)
    console.info('Settings and feature flags seeded.')
    if (process.env.NEXT_PUBLIC_APP_ENV === 'production') {
      console.info('Production: demo users skipped.')
    } else {
      await seedDemoUsers(handle.db)
      console.info(
        'Demo users seeded. Run `pnpm --filter @tokslearn/auth seed:passwords` to let them sign in.',
      )
    }
  } finally {
    await handle.close()
  }
}

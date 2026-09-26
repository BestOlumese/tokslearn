import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../client'
import { featureFlags, settings } from '../schema'
import { seedFeatureFlags, seedSettings } from './data'

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
  const handle = createDb(url, { max: 1 })
  try {
    await seed(handle.db)
    console.info('Seed complete.')
  } finally {
    await handle.close()
  }
}

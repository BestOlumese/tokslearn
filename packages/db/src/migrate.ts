import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))

// Arbitrary constant shared by every process that migrates this database.
const MIGRATION_LOCK_ID = 7_243_110_001

/**
 * Apply committed SQL migrations over a direct TCP connection. Never `drizzle-kit push` in prod.
 * A session-level advisory lock serialises concurrent runners (parallel test packages, two
 * Vercel builds at once); the second waits, then finds nothing left to apply.
 */
export async function runMigrations(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_ID])
    await migrate(drizzle({ client }), { migrationsFolder })
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {})
    await client.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // DATABASE_URL_UNPOOLED is what the Neon ↔ Vercel integration sets on preview branches.
  const url =
    process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error(
      'Set DATABASE_URL_DIRECT (or DATABASE_URL_UNPOOLED / DATABASE_URL) to run migrations. On Vercel: Project → Settings → Environment Variables.',
    )
    process.exit(1)
  }
  await runMigrations(url)
  console.info('Migrations applied.')
}

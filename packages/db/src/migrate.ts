import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

export const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url))

/** Apply committed SQL migrations over a direct TCP connection. Never `drizzle-kit push` in prod. */
export async function runMigrations(url: string): Promise<void> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    await migrate(drizzle({ client }), { migrationsFolder })
  } finally {
    await client.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // DATABASE_URL_UNPOOLED is what the Neon ↔ Vercel integration sets on preview branches.
  const url =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL
  if (!url) {
    console.error(
      'Set DATABASE_URL_DIRECT (or DATABASE_URL_UNPOOLED / DATABASE_URL) to run migrations. On Vercel: Project → Settings → Environment Variables.',
    )
    process.exit(1)
  }
  await runMigrations(url)
  console.info('Migrations applied.')
}

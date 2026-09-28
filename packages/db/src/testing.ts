import { sql } from 'drizzle-orm'
import { createDb, type Db, type DbHandle } from './client'
import { runMigrations } from './migrate'

class Rollback extends Error {}

let handle: DbHandle | undefined
let migrated: Promise<void> | undefined

/** Test database from TEST_DATABASE_URL (Docker Postgres on :5433), migrated once per process. */
export async function getTestDb(): Promise<Db> {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('TEST_DATABASE_URL is not set. Run `pnpm db:up` first.')
  migrated ??= runMigrations(url)
  await migrated
  handle ??= createDb(url, { max: 4 })
  return handle.db
}

/** Runs `fn` inside a transaction that is always rolled back (docs/15 §1). */
export async function withRollback(fn: (tx: Db) => Promise<void>): Promise<void> {
  const db = await getTestDb()
  try {
    await db.transaction(async (tx) => {
      await fn(tx as unknown as Db)
      throw new Rollback()
    })
  } catch (error) {
    if (!(error instanceof Rollback)) throw error
  }
}

/**
 * Empties every table. Only for tests that must commit (real concurrency); other tests use
 * `withRollback` and expect an empty database. TRUNCATE skips the ledger's row triggers.
 */
export async function resetTestDb(): Promise<void> {
  const db = await getTestDb()
  const result = await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)
  const tables = (result as unknown as { rows: Array<{ tablename: string }> }).rows
    .map((r) => `"${r.tablename}"`)
    .join(', ')
  if (tables) await db.execute(sql.raw(`truncate ${tables} restart identity cascade`))
}

export async function closeTestDb(): Promise<void> {
  await handle?.close()
  handle = undefined
}

export { seed, seedDemoUsers } from './seed'

import { Pool as NeonPool } from '@neondatabase/serverless'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core'
import pg from 'pg'
import * as schema from './schema'

export type Schema = typeof schema
export type Db = PgDatabase<PgQueryResultHKT, Schema>
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>
/** A database handle or an open transaction. Core services accept either. */
export type DbOrTx = Db | Tx

export interface DbHandle {
  db: Db
  close: () => Promise<void>
}

const isNeon = (url: string) => new URL(url).hostname.endsWith('.neon.tech')

/**
 * Neon URLs use the WebSocket Pool driver (interactive transactions, ADR-011).
 * Anything else (Docker Postgres for tests and local dev) uses node-postgres.
 * Both drivers expose the same Drizzle Postgres API.
 */
export function createDb(connectionString: string, options: { max?: number } = {}): DbHandle {
  const max = options.max ?? 10
  if (isNeon(connectionString)) {
    const pool = new NeonPool({ connectionString, max })
    return {
      db: drizzleNeon({ client: pool, schema, casing: 'snake_case' }),
      close: () => pool.end(),
    }
  }
  const pool = new pg.Pool({ connectionString, max })
  return {
    db: drizzleNodePg({ client: pool, schema, casing: 'snake_case' }),
    close: () => pool.end(),
  }
}

let shared: DbHandle | undefined

/**
 * Module-level pool, reused across requests on Vercel Fluid compute (docs/04 §3).
 * Reads DATABASE_URL lazily so importing this file never needs env at build time.
 */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    shared = createDb(url)
  }
  return shared.db
}
